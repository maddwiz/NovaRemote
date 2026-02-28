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
};

type UseServerCapabilitiesArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
};

async function endpointExists(baseUrl: string, token: string, path: string, init: RequestInit): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });

    return response.status !== 404;
  } catch {
    return false;
  }
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

      let healthTmux: boolean | null = null;
      let healthCodex: boolean | null = null;

      try {
        const health = await fetch(`${normalizeBaseUrl(baseUrl)}/health`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (health.ok) {
          const payload = (await health.json()) as {
            tmux?: { available?: boolean };
            codex?: { available?: boolean };
          };
          healthTmux = payload.tmux?.available ?? null;
          healthCodex = payload.codex?.available ?? null;
        }
      } catch {
        // Health probe is optional; endpoint probes below are authoritative fallback.
      }

      const [tmuxSessions, terminalSessions, filesList, shellRun, macAttach, codexStart] = await Promise.all([
        endpointExists(baseUrl, token, "/tmux/sessions", { method: "GET" }),
        endpointExists(baseUrl, token, "/terminal/sessions", { method: "GET" }),
        endpointExists(baseUrl, token, "/files/list?path=%2F", { method: "GET" }),
        endpointExists(baseUrl, token, "/shell/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
        endpointExists(baseUrl, token, "/mac/attach", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
        endpointExists(baseUrl, token, "/codex/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        }),
      ]);

      const terminalAvailable = tmuxSessions || terminalSessions;
      const nextTerminalApiKind: TerminalApiKind = terminalSessions ? "terminal" : "tmux";
      const next: ServerCapabilities = {
        terminal: terminalAvailable,
        tmux: Boolean(tmuxSessions && (healthTmux !== false)),
        codex: Boolean(codexStart && healthCodex !== false),
        files: filesList,
        shellRun,
        macAttach,
        stream: terminalAvailable,
      };

      setCapabilities(next);
      setTerminalApiKind(nextTerminalApiKind);
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
    if (capabilities.tmux && terminalApiKind !== "tmux") {
      features.push("tmux-compat");
    }
    return features.join(", ");
  }, [capabilities, terminalApiKind]);

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
