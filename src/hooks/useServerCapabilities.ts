import { useCallback, useEffect, useMemo, useState } from "react";

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
};

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

function pickTerminalApiKind(
  manifest: Record<string, unknown>,
  terminalSessions: boolean,
  tmuxSessions: boolean
): TerminalApiKind {
  const apiHint =
    (readPath(manifest, "terminal.api_kind") as string | undefined) ||
    (readPath(manifest, "terminal_api") as string | undefined) ||
    (readPath(manifest, "capabilities.terminal.api_kind") as string | undefined);

  if (typeof apiHint === "string") {
    const normalized = apiHint.trim().toLowerCase();
    if (normalized === "terminal") {
      return "terminal";
    }
    if (normalized === "tmux") {
      return "tmux";
    }
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

  const refresh = useCallback(async () => {
    if (!activeServer || !connected) {
      setCapabilities(EMPTY_CAPABILITIES);
      setTerminalApiKind("tmux");
      setLastError(null);
      return EMPTY_CAPABILITIES;
    }

    setLoading(true);
    setLastError(null);

    try {
      const baseUrl = activeServer.baseUrl;
      const token = activeServer.token;

      const manifestRoot = await readManifest(baseUrl, token);
      const manifest =
        (readPath(manifestRoot, "capabilities") as Record<string, unknown> | undefined) ||
        (readPath(manifestRoot, "features") as Record<string, unknown> | undefined) ||
        manifestRoot;

      const [tmuxSessions, terminalSessions, filesList, shellRunProbe, macAttachProbe, codexProbe, sysStatsProbe] = await Promise.all([
        endpointExists(baseUrl, token, "/tmux/sessions"),
        endpointExists(baseUrl, token, "/terminal/sessions"),
        endpointExists(baseUrl, token, "/files/list?path=%2F"),
        endpointSupportsAction(baseUrl, token, "/shell/run"),
        endpointSupportsAction(baseUrl, token, "/mac/attach"),
        endpointSupportsAction(baseUrl, token, "/codex/start"),
        endpointExists(baseUrl, token, "/sys/stats"),
      ]);

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

      const terminalAvailable = manifestTerminal ?? (terminalSessions || tmuxSessions);
      const next: ServerCapabilities = {
        terminal: terminalAvailable,
        tmux: manifestTmux ?? tmuxSessions,
        codex: manifestCodex ?? codexProbe,
        files: manifestFiles ?? filesList,
        shellRun: manifestShellRun ?? shellRunProbe,
        macAttach: manifestMacAttach ?? macAttachProbe,
        stream: manifestStream ?? terminalAvailable,
        sysStats: manifestSysStats ?? sysStatsProbe,
      };

      const nextApiKind = pickTerminalApiKind(manifest, terminalSessions, tmuxSessions);
      setCapabilities(next);
      setTerminalApiKind(nextApiKind);
      return next;
    } catch (error) {
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
