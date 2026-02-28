import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_SESSION_ALIASES_PREFIX } from "../constants";

function aliasKey(serverId: string) {
  return `${STORAGE_SESSION_ALIASES_PREFIX}.${serverId}`;
}

export function useSessionAliases(serverId: string | null) {
  const [sessionAliases, setSessionAliases] = useState<Record<string, string>>({});

  useEffect(() => {
    let mounted = true;
    async function loadAliases() {
      if (!serverId) {
        setSessionAliases({});
        return;
      }
      const raw = await SecureStore.getItemAsync(aliasKey(serverId));
      if (!mounted) {
        return;
      }
      if (!raw) {
        setSessionAliases({});
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, string>;
        setSessionAliases(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        setSessionAliases({});
      }
    }
    void loadAliases();
    return () => {
      mounted = false;
    };
  }, [serverId]);

  const persist = useCallback(
    async (next: Record<string, string>) => {
      if (!serverId) {
        return;
      }
      await SecureStore.setItemAsync(aliasKey(serverId), JSON.stringify(next));
    },
    [serverId]
  );

  const setAliasForSession = useCallback(
    async (session: string, alias: string) => {
      const key = session.trim();
      if (!key) {
        return;
      }
      const clean = alias.trim();
      const next = { ...sessionAliases };
      if (clean) {
        next[key] = clean;
      } else {
        delete next[key];
      }
      setSessionAliases(next);
      await persist(next);
    },
    [persist, sessionAliases]
  );

  const removeMissingAliases = useCallback(
    async (availableSessions: string[]) => {
      const allowed = new Set(availableSessions);
      const next: Record<string, string> = {};
      Object.entries(sessionAliases).forEach(([session, alias]) => {
        if (allowed.has(session) && alias.trim()) {
          next[session] = alias;
        }
      });
      if (Object.keys(next).length === Object.keys(sessionAliases).length) {
        return;
      }
      setSessionAliases(next);
      await persist(next);
    },
    [persist, sessionAliases]
  );

  return {
    sessionAliases,
    setAliasForSession,
    removeMissingAliases,
  };
}
