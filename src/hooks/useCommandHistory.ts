import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { HISTORY_MAX_ITEMS, STORAGE_HISTORY_PREFIX } from "../constants";

function historyKey(serverId: string): string {
  return `${STORAGE_HISTORY_PREFIX}.${serverId}`;
}

type HistoryState = Record<string, string[]>;
type HistoryCursor = Record<string, number>;

export function useCommandHistory(serverId: string | null) {
  const [commandHistory, setCommandHistory] = useState<HistoryState>({});
  const [historyIndex, setHistoryIndex] = useState<HistoryCursor>({});

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!serverId) {
        setCommandHistory({});
        setHistoryIndex({});
        return;
      }

      const raw = await SecureStore.getItemAsync(historyKey(serverId));
      if (!mounted) {
        return;
      }

      if (!raw) {
        setCommandHistory({});
        setHistoryIndex({});
        return;
      }

      try {
        const parsed = JSON.parse(raw) as HistoryState;
        setCommandHistory(parsed);
      } catch {
        setCommandHistory({});
      }
      setHistoryIndex({});
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [serverId]);

  const persist = useCallback(
    async (next: HistoryState) => {
      if (!serverId) {
        return;
      }
      await SecureStore.setItemAsync(historyKey(serverId), JSON.stringify(next));
    },
    [serverId]
  );

  const addCommand = useCallback(
    async (session: string, command: string) => {
      const clean = command.trim();
      if (!clean) {
        return;
      }

      const current = commandHistory[session] || [];
      const deduped = [clean, ...current.filter((entry) => entry !== clean)].slice(0, HISTORY_MAX_ITEMS);
      const next = { ...commandHistory, [session]: deduped };
      setCommandHistory(next);
      setHistoryIndex((prev) => ({ ...prev, [session]: -1 }));
      await persist(next);
    },
    [commandHistory, persist]
  );

  const recallPrev = useCallback(
    (session: string): string | null => {
      const history = commandHistory[session] || [];
      if (history.length === 0) {
        return null;
      }

      const currentIndex = historyIndex[session] ?? -1;
      const nextIndex = Math.min(currentIndex + 1, history.length - 1);
      setHistoryIndex((prev) => ({ ...prev, [session]: nextIndex }));
      return history[nextIndex] ?? null;
    },
    [commandHistory, historyIndex]
  );

  const recallNext = useCallback(
    (session: string): string | null => {
      const history = commandHistory[session] || [];
      if (history.length === 0) {
        return null;
      }

      const currentIndex = historyIndex[session] ?? -1;
      const nextIndex = Math.max(currentIndex - 1, -1);
      setHistoryIndex((prev) => ({ ...prev, [session]: nextIndex }));

      if (nextIndex === -1) {
        return "";
      }

      return history[nextIndex] ?? "";
    },
    [commandHistory, historyIndex]
  );

  const historyCount = useMemo(() => {
    return Object.fromEntries(Object.entries(commandHistory).map(([session, items]) => [session, items.length]));
  }, [commandHistory]);

  return {
    commandHistory,
    historyCount,
    addCommand,
    recallPrev,
    recallNext,
  };
}
