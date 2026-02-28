import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { STORAGE_SESSION_TAGS_PREFIX } from "../constants";

type SessionTags = Record<string, string[]>;

function tagsKey(serverId: string): string {
  return `${STORAGE_SESSION_TAGS_PREFIX}.${serverId}`;
}

function normalizeTags(raw: string[]): string[] {
  const clean = raw.map((entry) => entry.trim().toLowerCase()).filter(Boolean);
  return Array.from(new Set(clean));
}

export function useSessionTags(serverId: string | null) {
  const [sessionTags, setSessionTags] = useState<SessionTags>({});

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!serverId) {
        setSessionTags({});
        return;
      }

      const raw = await SecureStore.getItemAsync(tagsKey(serverId));
      if (!mounted) {
        return;
      }

      if (!raw) {
        setSessionTags({});
        return;
      }

      try {
        const parsed = JSON.parse(raw) as SessionTags;
        setSessionTags(parsed);
      } catch {
        setSessionTags({});
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [serverId]);

  const persist = useCallback(
    async (next: SessionTags) => {
      setSessionTags(next);
      if (!serverId) {
        return;
      }
      await SecureStore.setItemAsync(tagsKey(serverId), JSON.stringify(next));
    },
    [serverId]
  );

  const setTagsForSession = useCallback(
    async (session: string, tags: string[]) => {
      const normalized = normalizeTags(tags);
      const next = { ...sessionTags, [session]: normalized };
      await persist(next);
    },
    [persist, sessionTags]
  );

  const removeMissingSessions = useCallback(
    async (activeSessions: string[]) => {
      const keep = new Set(activeSessions);
      const next: SessionTags = {};
      Object.entries(sessionTags).forEach(([session, tags]) => {
        if (keep.has(session)) {
          next[session] = tags;
        }
      });

      if (JSON.stringify(next) !== JSON.stringify(sessionTags)) {
        await persist(next);
      }
    },
    [persist, sessionTags]
  );

  const allTags = useMemo(() => {
    const set = new Set<string>();
    Object.values(sessionTags).forEach((tags) => tags.forEach((tag) => set.add(tag)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [sessionTags]);

  return {
    sessionTags,
    allTags,
    setTagsForSession,
    removeMissingSessions,
  };
}
