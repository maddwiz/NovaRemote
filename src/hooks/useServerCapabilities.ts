import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { STORAGE_CAPABILITIES_CACHE_PREFIX } from "../constants";
import { normalizeBaseUrl } from "../api/client";
import { ServerCapabilities, ServerProfile, TerminalApiKind } from "../types";

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
};

const CAPABILITY_CACHE_TTL_MS = 45000;
const CAPABILITY_PERSIST_TTL_MS = 300000;

type CachedCapabilities = {
  capabilities: ServerCapabilities;
  terminalApiKind: TerminalApiKind;
  expiresAt: number;
};

const capabilityCache = new Map<string, CachedCapabilities>();

type UseServerCapabilitiesArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
};

type CapabilityManifest = {
  [key: string]: unknown;
};

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

async function readManifest(baseUrl: string, token: string): Promise<CapabilityManifest> {
  const candidates = ["/capabilities", "/health"];
  for (const path of candidates) {
    try {
      const response = await authFetch(baseUrl, token, path, { method: "GET" });
      if (!response.ok) {
        continue;
      }
      const payload = (await response.json()) as CapabilityManifest;
      if (payload && typeof payload === "object") {
        return payload;
      }
    } catch {
      // Continue to next candidate.
    }
  }
  return {};
}

function readTerminalApiHint(manifest: Record<string, unknown>): TerminalApiKind | null {
  const apiHint =
    (readPath(manifest, "terminal.api_kind") as string | undefined) ||
    (readPath(manifest, "terminal_api") as string | undefined) ||
    (readPath(manifest, "capabilities.terminal.api_kind") as string | undefined);

  if (typeof apiHint !== "string") {
    return null;
  }
  const normalized = apiHint.trim().toLowerCase();
  if (normalized === "terminal") {
    return "terminal";
  }
  if (normalized === "tmux") {
    return "tmux";
  }
  return null;
}

function capabilityCacheKey(baseUrl: string, token: string): string {
  return `${normalizeBaseUrl(baseUrl)}::${token}`;
}

function capabilityPersistKey(baseUrl: string): string {
  const encoded = encodeURIComponent(normalizeBaseUrl(baseUrl)).replace(/%/g, "_");
  return `${STORAGE_CAPABILITIES_CACHE_PREFIX}.${encoded}`;
}

function readTerminalApiKind(value: unknown): TerminalApiKind | null {
  if (value === "terminal" || value === "tmux") {
    return value;
  }
  return null;
}

function readPersistedCache(value: string | null): CachedCapabilities | null {
  if (!value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value) as {
      capabilities?: ServerCapabilities;
      terminalApiKind?: unknown;
      expiresAt?: unknown;
    };
    if (!parsed || typeof parsed !== "object" || !parsed.capabilities || typeof parsed.capabilities !== "object") {
      return null;
    }
    const terminalApiKind = readTerminalApiKind(parsed.terminalApiKind);
    const expiresAt = typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0;
    if (!terminalApiKind || !Number.isFinite(expiresAt)) {
      return null;
    }
    return {
      capabilities: parsed.capabilities,
      terminalApiKind,
      expiresAt,
    };
  } catch {
    return null;
  }
}

function pickTerminalApiKind(
  manifest: Record<string, unknown>,
  terminalSessions: boolean,
  tmuxSessions: boolean
): TerminalApiKind {
  const apiHint = readTerminalApiHint(manifest);
  if (apiHint) {
    return apiHint;
  }

  if (terminalSessions) {
    return "terminal";
  }
  if (tmuxSessions) {
    return "tmux";
  }
  return "tmux";
}

export function useServerCapabilities({ activeServer, connected }: UseServerCapabilitiesArgs) {
  const [capabilities, setCapabilities] = useState<ServerCapabilities>(EMPTY_CAPABILITIES);
  const [terminalApiKind, setTerminalApiKind] = useState<TerminalApiKind>("tmux");
  const [loading, setLoading] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async (force: boolean = false) => {
    if (!activeServer || !connected) {
      setCapabilities(EMPTY_CAPABILITIES);
      setTerminalApiKind("tmux");
      setLastError(null);
      return EMPTY_CAPABILITIES;
    }

    setLoading(true);
    setLastError(null);
    let persistedCache: CachedCapabilities | null = null;

    try {
      const baseUrl = activeServer.baseUrl;
      const token = activeServer.token;
      const cacheKey = capabilityCacheKey(baseUrl, token);
      const persistKey = capabilityPersistKey(baseUrl);
      const now = Date.now();
      const cached = capabilityCache.get(cacheKey);
      if (!force && cached && cached.expiresAt > now) {
        setCapabilities(cached.capabilities);
        setTerminalApiKind(cached.terminalApiKind);
        return cached.capabilities;
      }

      let persistedRaw: string | null = null;
      try {
        persistedRaw = await SecureStore.getItemAsync(persistKey);
      } catch {
        persistedRaw = null;
      }
      persistedCache = readPersistedCache(persistedRaw);
      if (!force && persistedCache && persistedCache.expiresAt > now) {
        setCapabilities(persistedCache.capabilities);
        setTerminalApiKind(persistedCache.terminalApiKind);
        capabilityCache.set(cacheKey, {
          ...persistedCache,
          expiresAt: now + CAPABILITY_CACHE_TTL_MS,
        });
        return persistedCache.capabilities;
      }

      const manifestRoot = await readManifest(baseUrl, token);
      const manifest =
        (readPath(manifestRoot, "capabilities") as Record<string, unknown> | undefined) ||
        (readPath(manifestRoot, "features") as Record<string, unknown> | undefined) ||
        manifestRoot;

      const manifestTerminal = readBool(manifest, [
        "terminal.available",
        "terminal",
        "pty.available",
        "tmux.available",
      ]);
      const manifestTmux = readBool(manifest, ["tmux.available", "tmux"]);
      const manifestCodex = readBool(manifest, ["codex.available", "codex", "ai.codex.available"]);
      const manifestFiles = readBool(manifest, ["files.available", "files", "fs.available"]);
      const manifestShellRun = readBool(manifest, [
        "shell.run",
        "shellRun",
        "shell_run",
        "shell.available",
      ]);
      const manifestMacAttach = readBool(manifest, [
        "mac.attach",
        "mac.attach.available",
        "macAttach",
      ]);
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
      const apiHint = readTerminalApiHint(manifest);

      const probeTmuxSessions = manifestTmux === null || (manifestTerminal === null && apiHint === null);
      const probeTerminalSessions = manifestTerminal === null && apiHint === null;
      const [tmuxSessions, terminalSessions, filesList, shellRunProbe, macAttachProbe, codexProbe, sysStatsProbe, procListProbe, collabProbe] = await Promise.all([
        probeTmuxSessions ? endpointExists(baseUrl, token, "/tmux/sessions") : Promise.resolve(false),
        probeTerminalSessions ? endpointExists(baseUrl, token, "/terminal/sessions") : Promise.resolve(false),
        manifestFiles === null ? endpointExists(baseUrl, token, "/files/list?path=%2F") : Promise.resolve(false),
        manifestShellRun === null ? endpointSupportsAction(baseUrl, token, "/shell/run") : Promise.resolve(false),
        manifestMacAttach === null ? endpointSupportsAction(baseUrl, token, "/mac/attach") : Promise.resolve(false),
        manifestCodex === null ? endpointSupportsAction(baseUrl, token, "/codex/start") : Promise.resolve(false),
        manifestSysStats === null ? endpointExists(baseUrl, token, "/sys/stats") : Promise.resolve(false),
        manifestProcesses === null ? endpointExists(baseUrl, token, "/proc/list") : Promise.resolve(false),
        manifestCollaboration === null ? endpointSupportsAction(baseUrl, token, "/collab/presence") : Promise.resolve(false),
      ]);

      const terminalAvailable = manifestTerminal ?? (terminalSessions || tmuxSessions || manifestTmux === true);
      const next: ServerCapabilities = {
        terminal: terminalAvailable,
        tmux: manifestTmux ?? tmuxSessions,
        codex: manifestCodex ?? codexProbe,
        files: manifestFiles ?? filesList,
        shellRun: manifestShellRun ?? shellRunProbe,
        macAttach: manifestMacAttach ?? macAttachProbe,
        stream: manifestStream ?? terminalAvailable,
        sysStats: manifestSysStats ?? sysStatsProbe,
        processes: manifestProcesses ?? procListProbe,
        collaboration: manifestCollaboration ?? collabProbe,
      };

      const nextApiKind = apiHint || pickTerminalApiKind(manifest, terminalSessions, tmuxSessions);
      setCapabilities(next);
      setTerminalApiKind(nextApiKind);
      capabilityCache.set(cacheKey, {
        capabilities: next,
        terminalApiKind: nextApiKind,
        expiresAt: now + CAPABILITY_CACHE_TTL_MS,
      });
      void SecureStore.setItemAsync(
        persistKey,
        JSON.stringify({
          capabilities: next,
          terminalApiKind: nextApiKind,
          expiresAt: now + CAPABILITY_PERSIST_TTL_MS,
        })
      ).catch(() => {});
      return next;
    } catch (error) {
      const cacheKey = capabilityCacheKey(activeServer.baseUrl, activeServer.token);
      const stale = capabilityCache.get(cacheKey) || persistedCache;
      if (stale) {
        setCapabilities(stale.capabilities);
        setTerminalApiKind(stale.terminalApiKind);
        setLastError(error instanceof Error ? error.message : String(error));
        return stale.capabilities;
      }
      setCapabilities(EMPTY_CAPABILITIES);
      setTerminalApiKind("tmux");
      setLastError(error instanceof Error ? error.message : String(error));
      return EMPTY_CAPABILITIES;
    } finally {
      setLoading(false);
    }
  }, [activeServer, connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const supportedFeatures = useMemo(() => {
    const features: string[] = [];
    if (activeServer?.terminalBackend) {
      features.push(`backend:${activeServer.terminalBackend}`);
    }
    if (capabilities.terminal) {
      features.push(`terminal:${terminalApiKind}`);
    }
    if (capabilities.codex) {
      features.push("codex");
    }
    if (capabilities.files) {
      features.push("files");
    }
    if (capabilities.shellRun) {
      features.push("shell-run");
    }
    if (capabilities.macAttach) {
      features.push("mac-attach");
    }
    if (capabilities.stream) {
      features.push("stream");
    }
    if (capabilities.sysStats) {
      features.push("sys-stats");
    }
    if (capabilities.processes) {
      features.push("proc");
    }
    if (capabilities.collaboration) {
      features.push("collab");
    }
    return features.join(", ");
  }, [activeServer?.terminalBackend, capabilities, terminalApiKind]);

  const terminalApiBasePath: "/terminal" | "/tmux" = terminalApiKind === "terminal" ? "/terminal" : "/tmux";

  return {
    capabilities,
    terminalApiKind,
    terminalApiBasePath,
    loading,
    lastError,
    supportedFeatures,
    refresh,
  };
}
