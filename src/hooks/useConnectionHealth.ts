import { useEffect, useMemo, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import { HEALTH_PING_INTERVAL_MS } from "../constants";
import { HealthMetrics, ServerProfile } from "../types";

type UseConnectionHealthArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
  streamLive: Record<string, boolean>;
  openSessions: string[];
};

export function useConnectionHealth({ activeServer, connected, streamLive, openSessions }: UseConnectionHealthArgs) {
  const [lastPingAt, setLastPingAt] = useState<number | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  useEffect(() => {
    if (!activeServer || !connected) {
      setLastPingAt(null);
      setLatencyMs(null);
      return;
    }

    const server = activeServer;

    let cancelled = false;

    async function ping() {
      const start = Date.now();
      try {
        const response = await fetch(`${normalizeBaseUrl(server.baseUrl)}/health`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${server.token}`,
          },
        });

        if (!response.ok || cancelled) {
          return;
        }

        setLastPingAt(Date.now());
        setLatencyMs(Date.now() - start);
      } catch {
        if (!cancelled) {
          setLatencyMs(null);
        }
      }
    }

    void ping();
    const id = setInterval(() => {
      void ping();
    }, HEALTH_PING_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeServer, connected]);

  const metrics = useMemo<HealthMetrics>(() => {
    const activeStreams = openSessions.filter((session) => Boolean(streamLive[session])).length;
    return {
      lastPingAt,
      latencyMs,
      activeStreams,
      openSessions: openSessions.length,
    };
  }, [lastPingAt, latencyMs, openSessions, streamLive]);

  return metrics;
}
