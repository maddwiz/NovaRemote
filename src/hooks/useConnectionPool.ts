import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

import { apiRequest, normalizeBaseUrl, websocketUrl } from "../api/client";
import {
  DEFAULT_CWD,
  POOL_HEALTH_INTERVAL_MS,
  POOL_MAX_RECONNECT_DELAY_MS,
  POLL_INTERVAL_MS,
  STREAM_RETRY_BASE_MS,
  STREAM_RETRY_FACTOR,
  isLikelyAiSession,
  makeLocalLlmSessionName,
  makeShellSessionName,
  sortByCreatedAt,
} from "../constants";
import {
  CodexMessageResponse,
  CodexStartResponse,
  HealthMetrics,
  ServerCapabilities,
  ServerConnection,
  ServerProfile,
  SessionConnectionMeta,
  SessionMeta,
  ShellRunResponse,
  TerminalSendMode,
  TmuxStreamMessage,
  TmuxTailResponse,
} from "../types";

type UseConnectionPoolArgs = {
  servers: ServerProfile[];
  enabled: boolean;
  initialFocusedServerId?: string | null;
  shellRunWaitMs?: number;
  onError?: (error: unknown) => void;
};

type SetStateAction<T> = T | ((prevState: T) => T);

type ConnectionPoolState = Record<string, ServerConnection>;

type PoolAction =
  | { type: "UPSERT_SERVER"; server: ServerProfile }
  | { type: "REMOVE_SERVER"; serverId: string }
  | { type: "RESET_SERVER"; serverId: string }
  | { type: "SET_STATUS"; serverId: string; status: ServerConnection["status"] }
  | { type: "SET_CAPABILITIES_LOADING"; serverId: string; loading: boolean }
  | {
      type: "SET_CAPABILITIES";
      serverId: string;
      capabilities: ServerCapabilities;
      terminalApiBasePath: "/tmux" | "/terminal";
    }
  | { type: "SET_SESSIONS"; serverId: string; allSessions: string[]; openSessions: string[] }
  | { type: "CREATE_LOCAL_AI_SESSION"; serverId: string; session: string; initialPrompt: string }
  | { type: "TOGGLE_SESSION_VISIBLE"; serverId: string; session: string }
  | { type: "REMOVE_OPEN_SESSION"; serverId: string; session: string }
  | { type: "REMOVE_SESSION"; serverId: string; session: string }
  | { type: "SET_TAIL"; serverId: string; session: string; output: string }
  | { type: "APPEND_TAIL"; serverId: string; session: string; delta: string }
  | { type: "REPLACE_TAILS"; serverId: string; tails: Record<string, string> }
  | { type: "SET_DRAFT"; serverId: string; session: string; text: string }
  | { type: "REPLACE_DRAFTS"; serverId: string; drafts: Record<string, string> }
  | { type: "SET_SEND_BUSY"; serverId: string; session: string; busy: boolean }
  | { type: "SET_SEND_MODE"; serverId: string; session: string; mode: TerminalSendMode }
  | { type: "SET_STREAM_LIVE"; serverId: string; session: string; live: boolean }
  | { type: "SET_CONNECTION_META"; serverId: string; session: string; meta: SessionConnectionMeta }
  | { type: "SET_HEALTH"; serverId: string; lastPingAt?: number | null; latencyMs?: number | null }
  | { type: "SET_ERROR"; serverId: string; error: string | null };

type CapabilityProbeResult = {
  capabilities: ServerCapabilities;
  terminalApiBasePath: "/tmux" | "/terminal";
};

type CachedCapabilityProbe = {
  fingerprint: string;
  result: CapabilityProbeResult;
  expiresAt: number;
};

type ConnectionPool = {
  connections: Map<string, ServerConnection>;
  lifecyclePaused: boolean;
  focusedServerId: string | null;
  focusedConnection: ServerConnection | null;
  setFocusedServerId: (id: string | null) => void;
  refreshSessions: (serverId: string) => Promise<void>;
  reconnectServer: (serverId: string, forceProbe?: boolean) => Promise<void>;
  reconnectServers: (serverIds: string[], forceProbe?: boolean) => Promise<void>;
  createSession: (
    serverId: string,
    cwd: string,
    kind: TerminalSendMode,
    prompt?: string,
    openOnMac?: boolean
  ) => Promise<string>;
  createLocalAiSession: (serverId: string, initialPrompt?: string) => string;
  sendCommand: (
    serverId: string,
    session: string,
    command: string,
    mode: TerminalSendMode,
    clearDraft?: boolean
  ) => Promise<void>;
  sendControlChar: (serverId: string, session: string, char: string) => Promise<void>;
  stopSession: (serverId: string, session: string) => Promise<void>;
  openOnMac: (serverId: string, session: string) => Promise<void>;
  toggleSessionVisible: (serverId: string, session: string) => void;
  removeOpenSession: (serverId: string, session: string) => void;
  setDraft: (serverId: string, session: string, text: string) => void;
  setSessionMode: (serverId: string, session: string, mode: TerminalSendMode) => void;
  setDrafts: (serverId: string, updater: SetStateAction<Record<string, string>>) => void;
  setTails: (serverId: string, updater: SetStateAction<Record<string, string>>) => void;
  fetchTail: (serverId: string, session: string, showErrors: boolean) => Promise<void>;
  connectStream: (serverId: string, session: string) => void;
  closeStream: (serverId: string, session: string) => void;
  closeAllStreams: (serverId?: string) => void;
  allConnectedServers: ServerProfile[];
  totalActiveStreams: number;
  connectAll: () => void;
  disconnectAll: () => void;
  refreshAll: () => Promise<void>;
};

type ReactNativeWebSocketCtor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> }
) => WebSocket;

const ReactNativeWebSocket =
  typeof globalThis !== "undefined" && "WebSocket" in globalThis
    ? (globalThis.WebSocket as unknown as ReactNativeWebSocketCtor)
    : null;

const WS_READY_STATE_CONNECTING = 0;
const WS_READY_STATE_OPEN = 1;

const EMPTY_CAPABILITIES: ServerCapabilities = {
  terminal: false,
  tmux: false,
  codex: false,
  files: false,
  shellRun: false,
  macAttach: false,
  stream: false,
  sysStats: false,
  processes: false,
  collaboration: false,
  spectate: false,
};

const EMPTY_HEALTH: HealthMetrics = {
  lastPingAt: null,
  latencyMs: null,
  activeStreams: 0,
  openSessions: 0,
};

const CONTROL_CHAR_TO_CTRL_KEY: Record<string, string> = {
  "\u0003": "C-c",
  "\u0004": "C-d",
  "\u001a": "C-z",
  "\u000c": "C-l",
};

const MAX_TAIL_LINES = 1200;
const CAPABILITY_CACHE_TTL_MS = 45_000;

function hasServerCredentials(server: ServerProfile): boolean {
  return Boolean(normalizeBaseUrl(server.baseUrl) && server.token.trim());
}

function serverFingerprint(server: ServerProfile): string {
  return `${normalizeBaseUrl(server.baseUrl)}::${server.token.trim()}`;
}

function trimTailOutput(output: string): string {
  const lines = output.split("\n");
  if (lines.length <= MAX_TAIL_LINES) {
    return output;
  }
  return lines.slice(lines.length - MAX_TAIL_LINES).join("\n");
}

function prependUnique(value: string, current: string[]): string[] {
  if (current.includes(value)) {
    return current;
  }
  return [value, ...current];
}

function buildConnection(server: ServerProfile): ServerConnection {
  const connected = hasServerCredentials(server);
  return {
    server,
    connected,
    capabilities: EMPTY_CAPABILITIES,
    terminalApiBasePath: "/tmux",
    capabilitiesLoading: connected,
    allSessions: [],
    localAiSessions: [],
    openSessions: [],
    tails: {},
    drafts: {},
    sendBusy: {},
    sendModes: {},
    streamLive: {},
    connectionMeta: {},
    health: EMPTY_HEALTH,
    status: connected ? "connecting" : "disconnected",
    lastError: null,
    activeStreamCount: 0,
  };
}

function uniqueSessions(sessions: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  sessions.forEach((session) => {
    if (!session || seen.has(session)) {
      return;
    }
    seen.add(session);
    next.push(session);
  });
  return next;
}

function pruneToSessions<T>(record: Record<string, T>, allowed: Set<string>): Record<string, T> {
  const next: Record<string, T> = {};
  Object.entries(record).forEach(([session, value]) => {
    if (allowed.has(session)) {
      next[session] = value;
    }
  });
  return next;
}

function deriveStatus(connection: ServerConnection, remoteOpenCount: number, activeStreams: number): ServerConnection["status"] {
  if (!connection.connected) {
    return "disconnected";
  }
  if (connection.capabilitiesLoading) {
    return "connecting";
  }

  const states = Object.values(connection.connectionMeta)
    .filter((meta) => meta)
    .map((meta) => meta.state);
  if (states.some((state) => state === "connecting" || state === "reconnecting")) {
    return "connecting";
  }

  if (remoteOpenCount === 0) {
    return connection.lastError ? "degraded" : "connected";
  }

  if (activeStreams === remoteOpenCount) {
    return connection.lastError ? "degraded" : "connected";
  }
  if (activeStreams > 0) {
    return "degraded";
  }

  return connection.lastError ? "error" : "degraded";
}

function recalculateConnection(connection: ServerConnection): ServerConnection {
  const remoteOpenSessions = connection.openSessions.filter((session) => !connection.localAiSessions.includes(session));
  const activeStreamCount = remoteOpenSessions.filter((session) => Boolean(connection.streamLive[session])).length;
  const nextHealth: HealthMetrics = {
    ...connection.health,
    activeStreams: activeStreamCount,
    openSessions: remoteOpenSessions.length,
  };

  return {
    ...connection,
    health: nextHealth,
    activeStreamCount,
    status: deriveStatus(connection, remoteOpenSessions.length, activeStreamCount),
  };
}

function updateConnection(
  state: ConnectionPoolState,
  serverId: string,
  updater: (connection: ServerConnection) => ServerConnection
): ConnectionPoolState {
  const current = state[serverId];
  if (!current) {
    return state;
  }
  const updated = recalculateConnection(updater(current));
  if (updated === current) {
    return state;
  }
  return {
    ...state,
    [serverId]: updated,
  };
}

function readPath(source: Record<string, unknown>, path: string): unknown {
  const keys = path.split(".");
  let cursor: unknown = source;
  for (const key of keys) {
    if (!cursor || typeof cursor !== "object" || !(key in cursor)) {
      return undefined;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

function toBool(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "yes", "1", "enabled", "available"].includes(normalized)) {
      return true;
    }
    if (["false", "no", "0", "disabled", "unavailable"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function readBool(source: Record<string, unknown>, paths: string[]): boolean | null {
  for (const path of paths) {
    const value = readPath(source, path);
    const bool = toBool(value);
    if (bool !== null) {
      return bool;
    }
  }
  return null;
}

async function authFetch(baseUrl: string, token: string, path: string, init: RequestInit): Promise<Response> {
  return await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });
}

async function endpointExists(baseUrl: string, token: string, path: string): Promise<boolean> {
  try {
    const response = await authFetch(baseUrl, token, path, { method: "GET" });
    return response.status !== 404;
  } catch {
    return false;
  }
}

async function endpointSupportsAction(baseUrl: string, token: string, path: string): Promise<boolean> {
  const methods: Array<"OPTIONS" | "HEAD"> = ["OPTIONS", "HEAD"];
  for (const method of methods) {
    try {
      const response = await authFetch(baseUrl, token, path, { method });
      if (response.status === 404) {
        return false;
      }
      if (response.ok || response.status === 401 || response.status === 403 || response.status === 405) {
        return true;
      }
    } catch {
      // Try next method.
    }
  }
  return false;
}

async function endpointSupportsAnyAction(baseUrl: string, token: string, paths: string[]): Promise<boolean> {
  for (const path of paths) {
    if (await endpointSupportsAction(baseUrl, token, path)) {
      return true;
    }
  }
  return false;
}

async function readManifest(baseUrl: string, token: string): Promise<Record<string, unknown>> {
  const candidates = ["/capabilities", "/health"];
  for (const path of candidates) {
    try {
      const response = await authFetch(baseUrl, token, path, { method: "GET" });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as Record<string, unknown>;
      if (payload && typeof payload === "object") {
        return payload;
      }
    } catch {
      // Continue to next candidate.
    }
  }
  return {};
}

function readTerminalApiHint(manifest: Record<string, unknown>): "/tmux" | "/terminal" | null {
  const apiHint =
    (readPath(manifest, "terminal.api_kind") as string | undefined) ||
    (readPath(manifest, "terminal_api") as string | undefined) ||
    (readPath(manifest, "capabilities.terminal.api_kind") as string | undefined);

  if (typeof apiHint !== "string") {
    return null;
  }
  const normalized = apiHint.trim().toLowerCase();
  if (normalized === "terminal") {
    return "/terminal";
  }
  if (normalized === "tmux") {
    return "/tmux";
  }
  return null;
}

function chooseApiBasePath(
  manifest: Record<string, unknown>,
  supportsTerminalSessions: boolean,
  supportsTmuxSessions: boolean
): "/tmux" | "/terminal" {
  const hint = readTerminalApiHint(manifest);
  if (hint) {
    return hint;
  }
  if (supportsTerminalSessions) {
    return "/terminal";
  }
  if (supportsTmuxSessions) {
    return "/tmux";
  }
  return "/tmux";
}

async function probeServerCapabilities(server: ServerProfile): Promise<CapabilityProbeResult> {
  const manifestRoot = await readManifest(server.baseUrl, server.token);
  const manifest =
    (readPath(manifestRoot, "capabilities") as Record<string, unknown> | undefined) ||
    (readPath(manifestRoot, "features") as Record<string, unknown> | undefined) ||
    manifestRoot;

  const manifestTerminal = readBool(manifest, ["terminal.available", "terminal", "pty.available", "tmux.available"]);
  const manifestTmux = readBool(manifest, ["tmux.available", "tmux"]);
  const manifestCodex = readBool(manifest, ["codex.available", "codex", "ai.codex.available"]);
  const manifestFiles = readBool(manifest, ["files.available", "files", "fs.available"]);
  const manifestShellRun = readBool(manifest, ["shell.run", "shellRun", "shell_run", "shell.available"]);
  const manifestMacAttach = readBool(manifest, ["mac.attach", "mac.attach.available", "macAttach"]);
  const manifestStream = readBool(manifest, ["stream.available", "stream", "terminal.stream", "tmux.stream"]);
  const manifestSysStats = readBool(manifest, ["sys.stats", "sysStats", "stats.system", "system.stats"]);
  const manifestProcesses = readBool(manifest, ["proc.list", "proc", "processes", "process.list"]);
  const manifestCollaboration = readBool(manifest, [
    "collaboration",
    "collaboration.available",
    "collab",
    "collab.available",
    "presence",
    "presence.available",
    "multiplayer",
  ]);
  const manifestSpectate = readBool(manifest, [
    "spectate",
    "spectate.available",
    "session_share",
    "session.share",
    "session.share.available",
    "sharing.spectate",
    "terminal.spectate",
    "tmux.spectate",
  ]);

  const probeTmuxSessions = manifestTmux === null || manifestTerminal === null;
  const probeTerminalSessions = manifestTerminal === null;

  const [
    supportsTmuxSessions,
    supportsTerminalSessions,
    filesList,
    shellRunProbe,
    macAttachProbe,
    codexProbe,
    sysStatsProbe,
    procListProbe,
    collabProbe,
    spectateProbe,
  ] = await Promise.all([
    probeTmuxSessions ? endpointExists(server.baseUrl, server.token, "/tmux/sessions") : Promise.resolve(false),
    probeTerminalSessions ? endpointExists(server.baseUrl, server.token, "/terminal/sessions") : Promise.resolve(false),
    manifestFiles === null ? endpointExists(server.baseUrl, server.token, "/files/list?path=%2F") : Promise.resolve(false),
    manifestShellRun === null ? endpointSupportsAction(server.baseUrl, server.token, "/shell/run") : Promise.resolve(false),
    manifestMacAttach === null ? endpointSupportsAction(server.baseUrl, server.token, "/mac/attach") : Promise.resolve(false),
    manifestCodex === null ? endpointSupportsAction(server.baseUrl, server.token, "/codex/start") : Promise.resolve(false),
    manifestSysStats === null ? endpointExists(server.baseUrl, server.token, "/sys/stats") : Promise.resolve(false),
    manifestProcesses === null ? endpointExists(server.baseUrl, server.token, "/proc/list") : Promise.resolve(false),
    manifestCollaboration === null
      ? endpointSupportsAction(server.baseUrl, server.token, "/collab/presence")
      : Promise.resolve(false),
    manifestSpectate === null
      ? endpointSupportsAnyAction(server.baseUrl, server.token, [
          "/session/spectate",
          "/terminal/spectate",
          "/tmux/spectate",
          "/spectate/token",
        ])
      : Promise.resolve(false),
  ]);

  const terminalAvailable = manifestTerminal ?? (supportsTerminalSessions || supportsTmuxSessions || manifestTmux === true);

  return {
    capabilities: {
      terminal: terminalAvailable,
      tmux: manifestTmux ?? supportsTmuxSessions,
      codex: manifestCodex ?? codexProbe,
      files: manifestFiles ?? filesList,
      shellRun: manifestShellRun ?? shellRunProbe,
      macAttach: manifestMacAttach ?? macAttachProbe,
      stream: manifestStream ?? terminalAvailable,
      sysStats: manifestSysStats ?? sysStatsProbe,
      processes: manifestProcesses ?? procListProbe,
      collaboration: manifestCollaboration ?? collabProbe,
      spectate: manifestSpectate ?? spectateProbe,
    },
    terminalApiBasePath: chooseApiBasePath(manifest, supportsTerminalSessions, supportsTmuxSessions),
  };
}

function reducer(state: ConnectionPoolState, action: PoolAction): ConnectionPoolState {
  if (action.type === "UPSERT_SERVER") {
    const existing = state[action.server.id];
    if (!existing) {
      return {
        ...state,
        [action.server.id]: buildConnection(action.server),
      };
    }

    const connected = hasServerCredentials(action.server);
    const next = recalculateConnection({
      ...existing,
      server: action.server,
      connected,
      capabilitiesLoading: connected ? existing.capabilitiesLoading : false,
      status: connected ? existing.status : "disconnected",
      lastError: connected ? existing.lastError : null,
    });

    return {
      ...state,
      [action.server.id]: next,
    };
  }

  if (action.type === "REMOVE_SERVER") {
    if (!(action.serverId in state)) {
      return state;
    }
    const next = { ...state };
    delete next[action.serverId];
    return next;
  }

  if (action.type === "RESET_SERVER") {
    return updateConnection(state, action.serverId, (connection) => {
      const reset = buildConnection(connection.server);
      return {
        ...reset,
        connected: connection.connected,
        capabilitiesLoading: connection.connected,
      };
    });
  }

  if (action.type === "SET_STATUS") {
    const current = state[action.serverId];
    if (!current || current.status === action.status) {
      return state;
    }
    return {
      ...state,
      [action.serverId]: {
        ...current,
        status: action.status,
      },
    };
  }

  if (action.type === "SET_CAPABILITIES_LOADING") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      capabilitiesLoading: action.loading,
    }));
  }

  if (action.type === "SET_CAPABILITIES") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      capabilities: action.capabilities,
      terminalApiBasePath: action.terminalApiBasePath,
      capabilitiesLoading: false,
      lastError: null,
    }));
  }

  if (action.type === "SET_SESSIONS") {
    return updateConnection(state, action.serverId, (connection) => {
      const mergedAll = uniqueSessions(action.allSessions);
      const mergedOpen = uniqueSessions(action.openSessions).filter((session) => mergedAll.includes(session));
      const allowed = new Set<string>(mergedAll);
      const sendModes = pruneToSessions(connection.sendModes, allowed);
      mergedAll.forEach((session) => {
        if (!sendModes[session]) {
          sendModes[session] = connection.localAiSessions.includes(session) || isLikelyAiSession(session) ? "ai" : "shell";
        }
      });

      return {
        ...connection,
        allSessions: mergedAll,
        openSessions: mergedOpen,
        tails: pruneToSessions(connection.tails, allowed),
        drafts: pruneToSessions(connection.drafts, allowed),
        sendBusy: pruneToSessions(connection.sendBusy, allowed),
        sendModes,
        streamLive: pruneToSessions(connection.streamLive, allowed),
        connectionMeta: pruneToSessions(connection.connectionMeta, allowed),
        lastError: null,
      };
    });
  }

  if (action.type === "CREATE_LOCAL_AI_SESSION") {
    return updateConnection(state, action.serverId, (connection) => {
      const localAiSessions = prependUnique(action.session, connection.localAiSessions);
      const allSessions = prependUnique(action.session, connection.allSessions);
      const openSessions = prependUnique(action.session, connection.openSessions);
      const draft = action.initialPrompt.trim();

      return {
        ...connection,
        localAiSessions,
        allSessions,
        openSessions,
        sendModes: {
          ...connection.sendModes,
          [action.session]: "ai",
        },
        drafts: draft
          ? {
              ...connection.drafts,
              [action.session]: draft,
            }
          : connection.drafts,
      };
    });
  }

  if (action.type === "TOGGLE_SESSION_VISIBLE") {
    return updateConnection(state, action.serverId, (connection) => {
      if (!connection.allSessions.includes(action.session)) {
        return connection;
      }
      const openSessions = connection.openSessions.includes(action.session)
        ? connection.openSessions.filter((name) => name !== action.session)
        : [action.session, ...connection.openSessions];
      return {
        ...connection,
        openSessions,
      };
    });
  }

  if (action.type === "REMOVE_OPEN_SESSION") {
    return updateConnection(state, action.serverId, (connection) => {
      if (!connection.openSessions.includes(action.session)) {
        return connection;
      }
      return {
        ...connection,
        openSessions: connection.openSessions.filter((name) => name !== action.session),
      };
    });
  }

  if (action.type === "REMOVE_SESSION") {
    return updateConnection(state, action.serverId, (connection) => {
      if (!connection.allSessions.includes(action.session) && !connection.openSessions.includes(action.session)) {
        return connection;
      }

      const next = { ...connection };
      next.allSessions = connection.allSessions.filter((name) => name !== action.session);
      next.localAiSessions = connection.localAiSessions.filter((name) => name !== action.session);
      next.openSessions = connection.openSessions.filter((name) => name !== action.session);

      const prune = <T,>(record: Record<string, T>): Record<string, T> => {
        if (!(action.session in record)) {
          return record;
        }
        const copy = { ...record };
        delete copy[action.session];
        return copy;
      };

      next.tails = prune(connection.tails);
      next.drafts = prune(connection.drafts);
      next.sendBusy = prune(connection.sendBusy);
      next.sendModes = prune(connection.sendModes);
      next.streamLive = prune(connection.streamLive);
      next.connectionMeta = prune(connection.connectionMeta);

      return next;
    });
  }

  if (action.type === "SET_TAIL") {
    return updateConnection(state, action.serverId, (connection) => {
      const output = trimTailOutput(action.output);
      if (connection.tails[action.session] === output) {
        return connection;
      }
      return {
        ...connection,
        tails: {
          ...connection.tails,
          [action.session]: output,
        },
      };
    });
  }

  if (action.type === "APPEND_TAIL") {
    return updateConnection(state, action.serverId, (connection) => {
      const nextOutput = trimTailOutput(`${connection.tails[action.session] || ""}${action.delta}`);
      if (connection.tails[action.session] === nextOutput) {
        return connection;
      }
      return {
        ...connection,
        tails: {
          ...connection.tails,
          [action.session]: nextOutput,
        },
      };
    });
  }

  if (action.type === "REPLACE_TAILS") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      tails: Object.fromEntries(
        Object.entries(action.tails).map(([session, output]) => [session, trimTailOutput(output)])
      ),
    }));
  }

  if (action.type === "SET_DRAFT") {
    return updateConnection(state, action.serverId, (connection) => {
      if (connection.drafts[action.session] === action.text) {
        return connection;
      }
      return {
        ...connection,
        drafts: {
          ...connection.drafts,
          [action.session]: action.text,
        },
      };
    });
  }

  if (action.type === "REPLACE_DRAFTS") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      drafts: action.drafts,
    }));
  }

  if (action.type === "SET_SEND_BUSY") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      sendBusy: {
        ...connection.sendBusy,
        [action.session]: action.busy,
      },
    }));
  }

  if (action.type === "SET_SEND_MODE") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      sendModes: {
        ...connection.sendModes,
        [action.session]: action.mode,
      },
    }));
  }

  if (action.type === "SET_STREAM_LIVE") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      streamLive: {
        ...connection.streamLive,
        [action.session]: action.live,
      },
    }));
  }

  if (action.type === "SET_CONNECTION_META") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      connectionMeta: {
        ...connection.connectionMeta,
        [action.session]: action.meta,
      },
    }));
  }

  if (action.type === "SET_HEALTH") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      health: {
        ...connection.health,
        lastPingAt: action.lastPingAt === undefined ? connection.health.lastPingAt : action.lastPingAt,
        latencyMs: action.latencyMs === undefined ? connection.health.latencyMs : action.latencyMs,
      },
    }));
  }

  if (action.type === "SET_ERROR") {
    return updateConnection(state, action.serverId, (connection) => ({
      ...connection,
      lastError: action.error,
      capabilitiesLoading: action.error ? false : connection.capabilitiesLoading,
    }));
  }

  return state;
}

function reduceActions(initialState: ConnectionPoolState, actions: PoolAction[]): ConnectionPoolState {
  return actions.reduce((nextState, action) => reducer(nextState, action), initialState);
}

function reduceStreamMessage(
  state: ConnectionPoolState,
  serverId: string,
  expectedSession: string,
  message: TmuxStreamMessage,
  now: number = Date.now()
): {
  state: ConnectionPoolState;
  closeRequested: boolean;
  errorMessage: string | null;
} {
  if (!message || message.session !== expectedSession) {
    return { state, closeRequested: false, errorMessage: null };
  }

  let nextState = reducer(state, {
    type: "SET_CONNECTION_META",
    serverId,
    session: expectedSession,
    meta: {
      state: "connected",
      retryCount: state[serverId]?.connectionMeta[expectedSession]?.retryCount ?? 0,
      lastMessageAt: now,
    },
  });

  if (message.type === "snapshot") {
    nextState = reducer(nextState, {
      type: "SET_TAIL",
      serverId,
      session: expectedSession,
      output: message.data ?? "",
    });
    return { state: nextState, closeRequested: false, errorMessage: null };
  }

  if (message.type === "delta") {
    nextState = reducer(nextState, {
      type: "APPEND_TAIL",
      serverId,
      session: expectedSession,
      delta: message.data ?? "",
    });
    return { state: nextState, closeRequested: false, errorMessage: null };
  }

  if (message.type === "session_closed") {
    nextState = reduceActions(nextState, [
      { type: "SET_STREAM_LIVE", serverId, session: expectedSession, live: false },
      {
        type: "SET_CONNECTION_META",
        serverId,
        session: expectedSession,
        meta: {
          state: "disconnected",
          retryCount: 0,
          lastMessageAt: nextState[serverId]?.connectionMeta[expectedSession]?.lastMessageAt ?? null,
        },
      },
      { type: "REMOVE_SESSION", serverId, session: expectedSession },
    ]);
    return { state: nextState, closeRequested: true, errorMessage: null };
  }

  if (message.type === "error" && message.data) {
    nextState = reducer(nextState, {
      type: "SET_ERROR",
      serverId,
      error: message.data,
    });
    return { state: nextState, closeRequested: false, errorMessage: message.data };
  }

  return { state: nextState, closeRequested: false, errorMessage: null };
}

export const connectionPoolTestUtils = {
  reducer,
  reduceActions,
  reduceStreamMessage,
  buildConnection,
  emptyCapabilities: EMPTY_CAPABILITIES,
  emptyHealth: EMPTY_HEALTH,
};

function getOrCreateNestedMap<T>(store: Map<string, Map<string, T>>, serverId: string): Map<string, T> {
  const existing = store.get(serverId);
  if (existing) {
    return existing;
  }
  const created = new Map<string, T>();
  store.set(serverId, created);
  return created;
}

function getNestedValue<T>(store: Map<string, Map<string, T>>, serverId: string, key: string): T | undefined {
  return store.get(serverId)?.get(key);
}

function setNestedValue<T>(store: Map<string, Map<string, T>>, serverId: string, key: string, value: T) {
  getOrCreateNestedMap(store, serverId).set(key, value);
}

function deleteNestedValue<T>(store: Map<string, Map<string, T>>, serverId: string, key: string) {
  const group = store.get(serverId);
  if (!group) {
    return;
  }
  group.delete(key);
  if (group.size === 0) {
    store.delete(serverId);
  }
}

export function useConnectionPool({
  servers,
  enabled,
  initialFocusedServerId = null,
  shellRunWaitMs = 1200,
  onError,
}: UseConnectionPoolArgs): ConnectionPool {
  const [state, dispatch] = useReducer(reducer, {});
  const [focusedServerId, setFocusedServerIdState] = useState<string | null>(initialFocusedServerId);
  const [lifecyclePaused, setLifecyclePausedState] = useState(false);

  const stateRef = useRef<ConnectionPoolState>(state);
  const wsRefs = useRef<Map<string, Map<string, WebSocket>>>(new Map());
  const streamRetryTimersRef = useRef<Map<string, Map<string, ReturnType<typeof setTimeout>>>>(new Map());
  const streamRetryCountsRef = useRef<Map<string, Map<string, number>>>(new Map());
  const capabilityCacheRef = useRef<Map<string, CachedCapabilityProbe>>(new Map());
  const autoconnectFingerprintRef = useRef<Record<string, string>>({});
  const serverFingerprintRef = useRef<Record<string, string>>({});
  const lifecyclePausedRef = useRef(false);
  const healthPingInFlightRef = useRef(false);
  const healthPingTriggerRef = useRef<(() => Promise<void>) | null>(null);
  const pollInFlightRef = useRef<Set<string>>(new Set());
  const sendInFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const setLifecyclePaused = useCallback((next: boolean) => {
    lifecyclePausedRef.current = next;
    setLifecyclePausedState(next);
  }, []);

  const clearRetry = useCallback((serverId: string, session: string) => {
    const timer = getNestedValue(streamRetryTimersRef.current, serverId, session);
    if (timer) {
      clearTimeout(timer);
      deleteNestedValue(streamRetryTimersRef.current, serverId, session);
    }
    deleteNestedValue(streamRetryCountsRef.current, serverId, session);
  }, []);

  const closeStream = useCallback(
    (serverId: string, session: string) => {
      clearRetry(serverId, session);

      const serverStreams = wsRefs.current.get(serverId);
      const ws = serverStreams?.get(session);
      if (ws) {
        ws.onopen = null;
        ws.onmessage = null;
        ws.onclose = null;
        ws.onerror = null;
        try {
          ws.close();
        } catch {
          // Ignore close failures.
        }
        serverStreams?.delete(session);
        if (serverStreams && serverStreams.size === 0) {
          wsRefs.current.delete(serverId);
        }
      }

      dispatch({ type: "SET_STREAM_LIVE", serverId, session, live: false });
      dispatch({
        type: "SET_CONNECTION_META",
        serverId,
        session,
        meta: {
          state: "disconnected",
          retryCount: 0,
          lastMessageAt: stateRef.current[serverId]?.connectionMeta[session]?.lastMessageAt ?? null,
        },
      });
    },
    [clearRetry]
  );

  const closeAllStreams = useCallback(
    (targetServerId?: string) => {
      if (targetServerId) {
        const sessions = Array.from(wsRefs.current.get(targetServerId)?.keys() || []);
        sessions.forEach((session) => {
          closeStream(targetServerId, session);
        });
        return;
      }

      Array.from(wsRefs.current.keys()).forEach((serverId) => {
        const sessions = Array.from(wsRefs.current.get(serverId)?.keys() || []);
        sessions.forEach((session) => {
          closeStream(serverId, session);
        });
      });
    },
    [closeStream]
  );

  const connectStream = useCallback(
    (serverId: string, session: string) => {
      const connection = stateRef.current[serverId];
      if (lifecyclePausedRef.current || !enabled || !connection || !connection.connected) {
        return;
      }
      if (connection.localAiSessions.includes(session)) {
        return;
      }
      if (!connection.openSessions.includes(session)) {
        return;
      }
      if (getNestedValue(streamRetryTimersRef.current, serverId, session)) {
        return;
      }

      const existing = wsRefs.current.get(serverId)?.get(session);
      if (
        existing &&
        (existing.readyState === WS_READY_STATE_CONNECTING || existing.readyState === WS_READY_STATE_OPEN)
      ) {
        return;
      }

      if (!ReactNativeWebSocket) {
        dispatch({
          type: "SET_ERROR",
          serverId,
          error: "WebSocket transport is unavailable in this runtime.",
        });
        return;
      }

      clearRetry(serverId, session);

      const ws = new ReactNativeWebSocket(
        websocketUrl(connection.server.baseUrl, session, `${connection.terminalApiBasePath}/stream`),
        undefined,
        {
          headers: {
            Authorization: `Bearer ${connection.server.token}`,
          },
        }
      );
      getOrCreateNestedMap(wsRefs.current, serverId).set(session, ws);

      dispatch({
        type: "SET_CONNECTION_META",
        serverId,
        session,
        meta: {
          state: stateRef.current[serverId]?.connectionMeta[session]?.retryCount ? "reconnecting" : "connecting",
          retryCount: stateRef.current[serverId]?.connectionMeta[session]?.retryCount ?? 0,
          lastMessageAt: stateRef.current[serverId]?.connectionMeta[session]?.lastMessageAt ?? null,
        },
      });

      ws.onopen = () => {
        setNestedValue(streamRetryCountsRef.current, serverId, session, 0);
        try {
          ws.send(JSON.stringify({ type: "auth", token: connection.server.token }));
        } catch {
          try {
            ws.close();
          } catch {
            // Ignore close failures.
          }
          return;
        }

        dispatch({ type: "SET_STREAM_LIVE", serverId, session, live: true });
        dispatch({
          type: "SET_CONNECTION_META",
          serverId,
          session,
          meta: {
            state: "connected",
            retryCount: 0,
            lastMessageAt: Date.now(),
          },
        });
      };

      ws.onmessage = (event) => {
        let message: TmuxStreamMessage | null = null;
        try {
          message = JSON.parse(String(event.data)) as TmuxStreamMessage;
        } catch {
          return;
        }
        if (!message || message.session !== session) {
          return;
        }

        dispatch({
          type: "SET_CONNECTION_META",
          serverId,
          session,
          meta: {
            state: "connected",
            retryCount: stateRef.current[serverId]?.connectionMeta[session]?.retryCount ?? 0,
            lastMessageAt: Date.now(),
          },
        });

        if (message.type === "snapshot") {
          dispatch({ type: "SET_TAIL", serverId, session, output: message.data ?? "" });
          return;
        }

        if (message.type === "delta") {
          dispatch({ type: "APPEND_TAIL", serverId, session, delta: message.data ?? "" });
          return;
        }

        if (message.type === "session_closed") {
          closeStream(serverId, session);
          dispatch({ type: "REMOVE_SESSION", serverId, session });
          return;
        }

        if (message.type === "error" && message.data) {
          const error = new Error(message.data);
          onError?.(error);
          dispatch({ type: "SET_ERROR", serverId, error: message.data });
        }
      };

      ws.onclose = () => {
        dispatch({ type: "SET_STREAM_LIVE", serverId, session, live: false });
        wsRefs.current.get(serverId)?.delete(session);
        if ((wsRefs.current.get(serverId)?.size || 0) === 0) {
          wsRefs.current.delete(serverId);
        }

        const latest = stateRef.current[serverId];
        if (
          lifecyclePausedRef.current ||
          !enabled ||
          !latest ||
          !latest.connected ||
          !latest.openSessions.includes(session)
        ) {
          dispatch({
            type: "SET_CONNECTION_META",
            serverId,
            session,
            meta: {
              state: "disconnected",
              retryCount: 0,
              lastMessageAt: latest?.connectionMeta[session]?.lastMessageAt ?? null,
            },
          });
          return;
        }

        const previousCount = getNestedValue(streamRetryCountsRef.current, serverId, session) ?? 0;
        const nextCount = previousCount + 1;
        setNestedValue(streamRetryCountsRef.current, serverId, session, nextCount);

        const delay = Math.min(
          STREAM_RETRY_BASE_MS * Math.pow(STREAM_RETRY_FACTOR, nextCount - 1),
          POOL_MAX_RECONNECT_DELAY_MS
        );

        dispatch({
          type: "SET_CONNECTION_META",
          serverId,
          session,
          meta: {
            state: "reconnecting",
            retryCount: nextCount,
            lastMessageAt: latest.connectionMeta[session]?.lastMessageAt ?? null,
          },
        });

        const retryTimer = setTimeout(() => {
          deleteNestedValue(streamRetryTimersRef.current, serverId, session);
          connectStream(serverId, session);
        }, delay);
        setNestedValue(streamRetryTimersRef.current, serverId, session, retryTimer);
      };

      ws.onerror = () => {
        // onclose handles retries.
      };
    },
    [clearRetry, enabled, onError]
  );

  const refreshSessions = useCallback(async (serverId: string) => {
    const connection = stateRef.current[serverId];
    if (!connection || !connection.connected) {
      throw new Error("Select a server with URL and token first.");
    }

    const data = await apiRequest<{ sessions: SessionMeta[] }>(
      connection.server.baseUrl,
      connection.server.token,
      `${connection.terminalApiBasePath}/sessions`
    );

    const names = sortByCreatedAt(data.sessions || []).map((entry) => entry.name);
    const mergedNames = uniqueSessions([...names, ...connection.localAiSessions.filter((session) => !names.includes(session))]);
    const existingOpen = connection.openSessions.filter((session) => mergedNames.includes(session));
    const nextOpen = existingOpen.length > 0 ? existingOpen : mergedNames[0] ? [mergedNames[0]] : [];

    dispatch({
      type: "SET_SESSIONS",
      serverId,
      allSessions: mergedNames,
      openSessions: nextOpen,
    });
  }, []);

  const probeCapabilities = useCallback(async (serverId: string, force: boolean = false) => {
    const connection = stateRef.current[serverId];
    if (!connection || !connection.connected) {
      dispatch({ type: "SET_CAPABILITIES_LOADING", serverId, loading: false });
      dispatch({
        type: "SET_CAPABILITIES",
        serverId,
        capabilities: EMPTY_CAPABILITIES,
        terminalApiBasePath: "/tmux",
      });
      return;
    }

    const fingerprint = serverFingerprint(connection.server);
    const now = Date.now();
    const cached = capabilityCacheRef.current.get(serverId);
    if (!force && cached && cached.fingerprint === fingerprint && cached.expiresAt > now) {
      dispatch({
        type: "SET_CAPABILITIES",
        serverId,
        capabilities: cached.result.capabilities,
        terminalApiBasePath: cached.result.terminalApiBasePath,
      });
      return;
    }

    dispatch({ type: "SET_CAPABILITIES_LOADING", serverId, loading: true });

    try {
      const result = await probeServerCapabilities(connection.server);
      capabilityCacheRef.current.set(serverId, {
        fingerprint,
        result,
        expiresAt: now + CAPABILITY_CACHE_TTL_MS,
      });

      dispatch({
        type: "SET_CAPABILITIES",
        serverId,
        capabilities: result.capabilities,
        terminalApiBasePath: result.terminalApiBasePath,
      });
    } catch (error) {
      dispatch({ type: "SET_CAPABILITIES_LOADING", serverId, loading: false });
      dispatch({
        type: "SET_ERROR",
        serverId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }, []);

  const connectServer = useCallback(
    async (serverId: string, forceProbe: boolean = false) => {
      const connection = stateRef.current[serverId];
      if (!connection) {
        return;
      }
      if (!connection.connected) {
        dispatch({ type: "SET_STATUS", serverId, status: "disconnected" });
        return;
      }

      dispatch({ type: "SET_STATUS", serverId, status: "connecting" });
      try {
        await probeCapabilities(serverId, forceProbe);
        await refreshSessions(serverId);
        dispatch({ type: "SET_ERROR", serverId, error: null });
      } catch (error) {
        dispatch({
          type: "SET_ERROR",
          serverId,
          error: error instanceof Error ? error.message : String(error),
        });
        onError?.(error);
      }
    },
    [onError, probeCapabilities, refreshSessions]
  );

  const reconnectServer = useCallback(
    async (serverId: string, forceProbe: boolean = true) => {
      setLifecyclePaused(false);
      await connectServer(serverId, forceProbe);
    },
    [connectServer, setLifecyclePaused]
  );

  const reconnectServers = useCallback(
    async (serverIds: string[], forceProbe: boolean = true) => {
      const uniqueServerIds = Array.from(new Set(serverIds.map((value) => value.trim()).filter(Boolean)));
      setLifecyclePaused(false);
      await Promise.all(uniqueServerIds.map((serverId) => connectServer(serverId, forceProbe)));
    },
    [connectServer, setLifecyclePaused]
  );

  const fetchTail = useCallback(
    async (serverId: string, session: string, showErrors: boolean) => {
      const key = `${serverId}::${session}`;
      const connection = stateRef.current[serverId];
      if (!connection || !connection.connected || pollInFlightRef.current.has(key)) {
        return;
      }

      pollInFlightRef.current.add(key);
      try {
        const data = await apiRequest<TmuxTailResponse>(
          connection.server.baseUrl,
          connection.server.token,
          `${connection.terminalApiBasePath}/tail?session=${encodeURIComponent(session)}&lines=600`
        );
        dispatch({
          type: "SET_TAIL",
          serverId,
          session,
          output: data.output ?? "",
        });
      } catch (error) {
        if (showErrors) {
          onError?.(error);
        }
      } finally {
        pollInFlightRef.current.delete(key);
      }
    },
    [onError]
  );

  const createLocalAiSession = useCallback((serverId: string, initialPrompt: string = "") => {
    const session = makeLocalLlmSessionName();
    dispatch({
      type: "CREATE_LOCAL_AI_SESSION",
      serverId,
      session,
      initialPrompt,
    });
    return session;
  }, []);

  const createSession = useCallback(
    async (
      serverId: string,
      cwd: string,
      kind: TerminalSendMode,
      prompt: string = "",
      openOnMac: boolean = true
    ) => {
      const connection = stateRef.current[serverId];
      if (!connection || !connection.connected) {
        throw new Error("Connect to a server first.");
      }

      const resolvedCwd = cwd.trim() || connection.server.defaultCwd || DEFAULT_CWD;

      if (kind === "ai") {
        const payload = {
          cwd: resolvedCwd,
          initial_prompt: prompt.trim() || null,
          open_on_mac: openOnMac,
        };

        const data = await apiRequest<CodexStartResponse>(connection.server.baseUrl, connection.server.token, "/codex/start", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const session = data.session;
        const allSessions = prependUnique(session, stateRef.current[serverId]?.allSessions || []);
        const openSessions = prependUnique(session, stateRef.current[serverId]?.openSessions || []);
        dispatch({ type: "SET_SESSIONS", serverId, allSessions, openSessions });
        dispatch({ type: "SET_SEND_MODE", serverId, session, mode: "ai" });
        if (data.tail) {
          dispatch({ type: "SET_TAIL", serverId, session, output: data.tail || "" });
        }

        if (openOnMac && data.open_on_mac && !data.open_on_mac.opened) {
          throw new Error(data.open_on_mac.error || "Session started, but Mac open failed.");
        }

        return session;
      }

      const session = makeShellSessionName();
      await apiRequest(connection.server.baseUrl, connection.server.token, `${connection.terminalApiBasePath}/session`, {
        method: "POST",
        body: JSON.stringify({ session, cwd: resolvedCwd }),
      });

      const initialCommand = prompt.trim();
      if (initialCommand) {
        await apiRequest(connection.server.baseUrl, connection.server.token, `${connection.terminalApiBasePath}/send`, {
          method: "POST",
          body: JSON.stringify({ session, text: initialCommand, enter: true }),
        });
      }

      const tail = await apiRequest<TmuxTailResponse>(
        connection.server.baseUrl,
        connection.server.token,
        `${connection.terminalApiBasePath}/tail?session=${encodeURIComponent(session)}&lines=380`
      );

      const allSessions = prependUnique(session, stateRef.current[serverId]?.allSessions || []);
      const openSessions = prependUnique(session, stateRef.current[serverId]?.openSessions || []);
      dispatch({ type: "SET_SESSIONS", serverId, allSessions, openSessions });
      dispatch({ type: "SET_SEND_MODE", serverId, session, mode: "shell" });
      dispatch({ type: "SET_TAIL", serverId, session, output: tail.output || "" });

      return session;
    },
    []
  );

  const sendCommand = useCallback(
    async (
      serverId: string,
      session: string,
      command: string,
      mode: TerminalSendMode,
      clearDraft: boolean = false
    ) => {
      const connection = stateRef.current[serverId];
      if (!connection || !connection.connected) {
        throw new Error("Connect to a server first.");
      }
      if (connection.localAiSessions.includes(session)) {
        throw new Error("Local AI sessions are handled by the external LLM pipeline.");
      }

      const currentDraft = command.trim();
      if (!currentDraft) {
        return;
      }

      const inFlightKey = `${serverId}::${session}`;
      if (sendInFlightRef.current.has(inFlightKey)) {
        return;
      }

      sendInFlightRef.current.add(inFlightKey);
      dispatch({ type: "SET_SEND_BUSY", serverId, session, busy: true });
      if (clearDraft) {
        dispatch({ type: "SET_DRAFT", serverId, session, text: "" });
      }

      try {
        if (mode === "ai") {
          const data = await apiRequest<CodexMessageResponse>(connection.server.baseUrl, connection.server.token, "/codex/message", {
            method: "POST",
            body: JSON.stringify({ session, message: currentDraft }),
          });
          if (data.tail) {
            dispatch({ type: "SET_TAIL", serverId, session, output: data.tail || "" });
          }
          return;
        }

        if (connection.capabilities.shellRun) {
          const data = await apiRequest<ShellRunResponse>(connection.server.baseUrl, connection.server.token, "/shell/run", {
            method: "POST",
            body: JSON.stringify({
              session,
              command: currentDraft,
              wait_ms: shellRunWaitMs,
              tail_lines: 380,
            }),
          });
          if (data.output !== undefined) {
            dispatch({ type: "SET_TAIL", serverId, session, output: data.output || "" });
          }
          return;
        }

        await apiRequest(connection.server.baseUrl, connection.server.token, `${connection.terminalApiBasePath}/send`, {
          method: "POST",
          body: JSON.stringify({ session, text: currentDraft, enter: true }),
        });
        const tail = await apiRequest<TmuxTailResponse>(
          connection.server.baseUrl,
          connection.server.token,
          `${connection.terminalApiBasePath}/tail?session=${encodeURIComponent(session)}&lines=380`
        );
        if (tail.output !== undefined) {
          dispatch({ type: "SET_TAIL", serverId, session, output: tail.output || "" });
        }
      } catch (error) {
        if (clearDraft) {
          dispatch({ type: "SET_DRAFT", serverId, session, text: currentDraft });
        }
        dispatch({
          type: "SET_ERROR",
          serverId,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      } finally {
        sendInFlightRef.current.delete(inFlightKey);
        dispatch({ type: "SET_SEND_BUSY", serverId, session, busy: false });
      }
    },
    [shellRunWaitMs]
  );

  const stopSession = useCallback(async (serverId: string, session: string) => {
    const connection = stateRef.current[serverId];
    if (!connection || !connection.connected) {
      throw new Error("Connect to a server first.");
    }

    await apiRequest(connection.server.baseUrl, connection.server.token, `${connection.terminalApiBasePath}/ctrl`, {
      method: "POST",
      body: JSON.stringify({ session, key: "C-c" }),
    });
  }, []);

  const sendControlChar = useCallback(async (serverId: string, session: string, controlChar: string) => {
    const connection = stateRef.current[serverId];
    if (!connection || !connection.connected) {
      throw new Error("Connect to a server first.");
    }
    if (!controlChar) {
      return;
    }

    const mappedKey = CONTROL_CHAR_TO_CTRL_KEY[controlChar];
    if (mappedKey) {
      await apiRequest(connection.server.baseUrl, connection.server.token, `${connection.terminalApiBasePath}/ctrl`, {
        method: "POST",
        body: JSON.stringify({ session, key: mappedKey }),
      });
      return;
    }

    try {
      await apiRequest(connection.server.baseUrl, connection.server.token, `${connection.terminalApiBasePath}/input`, {
        method: "POST",
        body: JSON.stringify({ session, data: controlChar }),
      });
    } catch (inputError) {
      try {
        await apiRequest(connection.server.baseUrl, connection.server.token, `${connection.terminalApiBasePath}/send`, {
          method: "POST",
          body: JSON.stringify({ session, text: controlChar, enter: false }),
        });
      } catch {
        throw inputError;
      }
    }
  }, []);

  const openOnMac = useCallback(async (serverId: string, session: string) => {
    const connection = stateRef.current[serverId];
    if (!connection || !connection.connected) {
      throw new Error("Connect to a server first.");
    }

    await apiRequest(connection.server.baseUrl, connection.server.token, "/mac/attach", {
      method: "POST",
      body: JSON.stringify({ session }),
    });
  }, []);

  const toggleSessionVisible = useCallback((serverId: string, session: string) => {
    dispatch({ type: "TOGGLE_SESSION_VISIBLE", serverId, session });
  }, []);

  const removeOpenSession = useCallback((serverId: string, session: string) => {
    dispatch({ type: "REMOVE_OPEN_SESSION", serverId, session });
  }, []);

  const setDraft = useCallback((serverId: string, session: string, text: string) => {
    dispatch({ type: "SET_DRAFT", serverId, session, text });
  }, []);

  const setSessionMode = useCallback((serverId: string, session: string, mode: TerminalSendMode) => {
    const connection = stateRef.current[serverId];
    if (!connection) {
      return;
    }
    if (mode === "shell" && connection.localAiSessions.includes(session)) {
      return;
    }
    dispatch({ type: "SET_SEND_MODE", serverId, session, mode });
  }, []);

  const setDrafts = useCallback((serverId: string, updater: SetStateAction<Record<string, string>>) => {
    const current = stateRef.current[serverId]?.drafts || {};
    const next =
      typeof updater === "function"
        ? (updater as (prevState: Record<string, string>) => Record<string, string>)(current)
        : updater;
    dispatch({ type: "REPLACE_DRAFTS", serverId, drafts: next });
  }, []);

  const setTails = useCallback((serverId: string, updater: SetStateAction<Record<string, string>>) => {
    const current = stateRef.current[serverId]?.tails || {};
    const next =
      typeof updater === "function"
        ? (updater as (prevState: Record<string, string>) => Record<string, string>)(current)
        : updater;
    dispatch({ type: "REPLACE_TAILS", serverId, tails: next });
  }, []);

  const connectAll = useCallback(() => {
    setLifecyclePaused(false);
    Object.values(stateRef.current).forEach((connection) => {
      if (connection.connected) {
        void connectServer(connection.server.id, false);
      }
    });
  }, [connectServer, setLifecyclePaused]);

  const disconnectAll = useCallback(() => {
    setLifecyclePaused(true);
    closeAllStreams();
    Object.keys(stateRef.current).forEach((serverId) => {
      dispatch({ type: "SET_STATUS", serverId, status: "disconnected" });
    });
  }, [closeAllStreams, setLifecyclePaused]);

  const refreshAll = useCallback(async () => {
    const jobs = Object.values(stateRef.current)
      .filter((connection) => connection.connected)
      .map((connection) => refreshSessions(connection.server.id));
    await Promise.all(jobs);
  }, [refreshSessions]);

  useEffect(() => {
    const serverIds = new Set(servers.map((server) => server.id));

    servers.forEach((server) => {
      const fingerprint = serverFingerprint(server);
      const previousFingerprint = serverFingerprintRef.current[server.id];

      dispatch({ type: "UPSERT_SERVER", server });

      if (previousFingerprint && previousFingerprint !== fingerprint) {
        closeAllStreams(server.id);
        dispatch({ type: "RESET_SERVER", serverId: server.id });
        capabilityCacheRef.current.delete(server.id);
        delete autoconnectFingerprintRef.current[server.id];
      }

      serverFingerprintRef.current[server.id] = fingerprint;
    });

    Object.keys(serverFingerprintRef.current).forEach((serverId) => {
      if (!serverIds.has(serverId)) {
        closeAllStreams(serverId);
        capabilityCacheRef.current.delete(serverId);
        delete serverFingerprintRef.current[serverId];
        delete autoconnectFingerprintRef.current[serverId];
        dispatch({ type: "REMOVE_SERVER", serverId });
      }
    });
  }, [closeAllStreams, servers]);

  useEffect(() => {
    if (!enabled) {
      setLifecyclePaused(false);
      closeAllStreams();
      return;
    }
    if (lifecyclePausedRef.current) {
      return;
    }

    Object.values(state).forEach((connection) => {
      const server = connection.server;
      if (!connection.connected) {
        delete autoconnectFingerprintRef.current[server.id];
        return;
      }

      const fingerprint = serverFingerprint(server);
      if (autoconnectFingerprintRef.current[server.id] === fingerprint) {
        return;
      }

      autoconnectFingerprintRef.current[server.id] = fingerprint;
      void connectServer(server.id, true);
    });
  }, [closeAllStreams, connectServer, enabled, setLifecyclePaused, state]);

  useEffect(() => {
    if (!enabled) {
      setLifecyclePaused(false);
      closeAllStreams();
      return;
    }
    if (lifecyclePausedRef.current) {
      return;
    }

    Object.values(state).forEach((connection) => {
      const remoteOpen = connection.openSessions.filter((session) => !connection.localAiSessions.includes(session));

      if (!connection.connected) {
        closeAllStreams(connection.server.id);
        return;
      }

      const active = new Set(remoteOpen);
      const existing = Array.from(wsRefs.current.get(connection.server.id)?.keys() || []);
      existing.forEach((session) => {
        if (!active.has(session)) {
          closeStream(connection.server.id, session);
        }
      });

      remoteOpen.forEach((session) => {
        connectStream(connection.server.id, session);
      });
    });
  }, [closeAllStreams, closeStream, connectStream, enabled, setLifecyclePaused, state]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const interval = setInterval(() => {
      const snapshot = stateRef.current;
      Object.values(snapshot).forEach((connection) => {
        if (!connection.connected) {
          return;
        }

        connection.openSessions
          .filter((session) => !connection.localAiSessions.includes(session))
          .forEach((session) => {
            const live = Boolean(connection.streamLive[session]);
            const status = connection.connectionMeta[session]?.state;
            if (live || status === "connecting" || status === "reconnecting") {
              return;
            }
            void fetchTail(connection.server.id, session, false);
          });
      });
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(interval);
    };
  }, [enabled, fetchTail]);

  const healthScopeKey = useMemo(
    () =>
      Object.values(state)
        .map((connection) => `${connection.server.id}:${connection.connected ? 1 : 0}`)
        .sort()
        .join("|"),
    [state]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let cancelled = false;

    const pingAll = async () => {
      if (healthPingInFlightRef.current) {
        return;
      }
      healthPingInFlightRef.current = true;

      const snapshot = stateRef.current;
      try {
        await Promise.all(
          Object.values(snapshot).map(async (connection) => {
            if (!connection.connected) {
              dispatch({ type: "SET_HEALTH", serverId: connection.server.id, latencyMs: null });
              return;
            }

            const startedAt = Date.now();
            try {
              const response = await fetch(`${normalizeBaseUrl(connection.server.baseUrl)}/health`, {
                method: "GET",
                headers: {
                  Authorization: `Bearer ${connection.server.token}`,
                },
              });

              if (cancelled || !response.ok) {
                return;
              }

              dispatch({
                type: "SET_HEALTH",
                serverId: connection.server.id,
                lastPingAt: Date.now(),
                latencyMs: Date.now() - startedAt,
              });
            } catch {
              if (!cancelled) {
                dispatch({ type: "SET_HEALTH", serverId: connection.server.id, latencyMs: null });
              }
            }
          })
        );
      } finally {
        healthPingInFlightRef.current = false;
      }
    };
    healthPingTriggerRef.current = pingAll;

    void pingAll();
    const interval = setInterval(() => {
      void pingAll();
    }, POOL_HEALTH_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (healthPingTriggerRef.current === pingAll) {
        healthPingTriggerRef.current = null;
      }
      healthPingInFlightRef.current = false;
      clearInterval(interval);
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !healthScopeKey) {
      return;
    }
    const ping = healthPingTriggerRef.current;
    if (ping) {
      void ping();
    }
  }, [enabled, healthScopeKey]);

  useEffect(() => {
    if (initialFocusedServerId && servers.some((server) => server.id === initialFocusedServerId)) {
      setFocusedServerIdState((current) => (current === initialFocusedServerId ? current : initialFocusedServerId));
    }
  }, [initialFocusedServerId, servers]);

  useEffect(() => {
    if (focusedServerId && servers.some((server) => server.id === focusedServerId)) {
      return;
    }

    const fallback =
      (initialFocusedServerId && servers.some((server) => server.id === initialFocusedServerId)
        ? initialFocusedServerId
        : null) ||
      servers[0]?.id ||
      null;
    setFocusedServerIdState(fallback);
  }, [focusedServerId, initialFocusedServerId, servers]);

  useEffect(() => {
    return () => {
      closeAllStreams();
      Array.from(streamRetryTimersRef.current.values()).forEach((group) => {
        group.forEach((timer) => clearTimeout(timer));
      });
      streamRetryTimersRef.current.clear();
      streamRetryCountsRef.current.clear();
    };
  }, [closeAllStreams]);

  const setFocusedServerId = useCallback((serverId: string | null) => {
    if (serverId && !servers.some((server) => server.id === serverId)) {
      return;
    }
    setFocusedServerIdState(serverId);
  }, [servers]);

  const connections = useMemo(() => {
    const ordered = new Map<string, ServerConnection>();
    servers.forEach((server) => {
      const connection = state[server.id];
      if (connection) {
        ordered.set(server.id, connection);
      }
    });
    return ordered;
  }, [servers, state]);

  const focusedConnection = useMemo(
    () => (focusedServerId ? connections.get(focusedServerId) ?? null : null),
    [connections, focusedServerId]
  );

  const allConnectedServers = useMemo(
    () => Object.values(state).filter((connection) => connection.connected).map((connection) => connection.server),
    [state]
  );

  const totalActiveStreams = useMemo(
    () => Object.values(state).reduce((sum, connection) => sum + connection.activeStreamCount, 0),
    [state]
  );

  return {
    connections,
    lifecyclePaused,
    focusedServerId,
    focusedConnection,
    setFocusedServerId,
    refreshSessions,
    reconnectServer,
    reconnectServers,
    createSession,
    createLocalAiSession,
    sendCommand,
    sendControlChar,
    stopSession,
    openOnMac,
    toggleSessionVisible,
    removeOpenSession,
    setDraft,
    setSessionMode,
    setDrafts,
    setTails,
    fetchTail,
    connectStream,
    closeStream,
    closeAllStreams,
    allConnectedServers,
    totalActiveStreams,
    connectAll,
    disconnectAll,
    refreshAll,
  };
}
