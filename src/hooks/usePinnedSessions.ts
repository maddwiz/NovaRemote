import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_PINNED_SESSIONS_PREFIX } from "../constants";

function pinKey(serverId: string) {
  return `${STORAGE_PINNED_SESSIONS_PREFIX}.${serverId}`;
}

export function usePinnedSessions(serverId: string | null) {
  const [pinnedSessions, setPinnedSessions] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    async function loadPins() {
      if (!serverId) {
        setPinnedSessions([]);
        return;
      }
      const raw = await SecureStore.getItemAsync(pinKey(serverId));
      if (!mounted) {
        return;
      }
      if (!raw) {
        setPinnedSessions([]);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as string[];
        setPinnedSessions(Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : []);
      } catch {
        setPinnedSessions([]);
      }
    }
    void loadPins();
    return () => {
      mounted = false;
    };
  }, [serverId]);

  const persist = useCallback(
    async (next: string[]) => {
      if (!serverId) {
        return;
      }
      await SecureStore.setItemAsync(pinKey(serverId), JSON.stringify(next));
    },
    [serverId]
  );

  const togglePinnedSession = useCallback(
    async (session: string) => {
      const normalized = session.trim();
      if (!normalized) {
        return;
      }
      const next = pinnedSessions.includes(normalized)
        ? pinnedSessions.filter((entry) => entry !== normalized)
        : [...pinnedSessions, normalized];
      setPinnedSessions(next);
      await persist(next);
    },
    [persist, pinnedSessions]
  );

  const removeMissingPins = useCallback(
    async (availableSessions: string[]) => {
      const available = new Set(availableSessions);
      const next = pinnedSessions.filter((session) => available.has(session));
      if (next.length === pinnedSessions.length) {
        return;
      }
      setPinnedSessions(next);
      await persist(next);
    },
    [persist, pinnedSessions]
  );

  return {
    pinnedSessions,
    togglePinnedSession,
    removeMissingPins,
  };
}
