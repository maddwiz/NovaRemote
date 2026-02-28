import { useCallback, useEffect, useMemo, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import { ServerCapabilities, ServerProfile } from "../types";

const EMPTY_CAPABILITIES: ServerCapabilities = {
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
  const [loading, setLoading] = useState<boolean>(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!activeServer || !connected) {
      setCapabilities(EMPTY_CAPABILITIES);
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

      const [tmuxSessions, filesList, shellRun, macAttach, codexStart] = await Promise.all([
        endpointExists(baseUrl, token, "/tmux/sessions", { method: "GET" }),
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

      const next: ServerCapabilities = {
        tmux: Boolean(tmuxSessions && (healthTmux !== false)),
        codex: Boolean(codexStart && healthCodex === true),
        files: filesList,
        shellRun,
        macAttach,
        stream: tmuxSessions,
      };

      setCapabilities(next);
      return next;
    } catch (error) {
      setCapabilities(EMPTY_CAPABILITIES);
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
    return Object.entries(capabilities)
      .filter(([, enabled]) => enabled)
      .map(([name]) => name)
      .join(", ");
  }, [capabilities]);

  return {
    capabilities,
    loading,
    lastError,
    supportedFeatures,
    refresh,
  };
}
