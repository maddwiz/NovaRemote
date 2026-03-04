import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { makeId, STORAGE_NOVA_MEMORY_PREFIX } from "../constants";
import { NovaMemoryEntry, NovaMemoryKind } from "../types";

type UseNovaMemoryArgs = {
  serverId: string | null;
  maxEntries?: number;
};

type AddMemoryEntryInput = {
  memoryContextId: string;
  agentId?: string | null;
  kind: NovaMemoryKind;
  summary: string;
  command?: string;
  session?: string;
};

export type UseNovaMemoryResult = {
  entries: NovaMemoryEntry[];
  loading: boolean;
  addEntry: (input: AddMemoryEntryInput) => NovaMemoryEntry | null;
  clearContext: (memoryContextId: string) => void;
  clearAll: () => void;
};

function makeStorageKey(serverId: string): string {
  return `${STORAGE_NOVA_MEMORY_PREFIX}.${serverId}`;
}

function normalizeMemoryEntry(value: unknown, serverId: string): NovaMemoryEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<NovaMemoryEntry>;
  const memoryContextId = typeof parsed.memoryContextId === "string" ? parsed.memoryContextId.trim() : "";
  const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "";
  const kind = parsed.kind;

  if (!memoryContextId || !summary) {
    return null;
  }

  const validKind: NovaMemoryKind =
    kind === "agent_created" ||
    kind === "goal_updated" ||
    kind === "approval_requested" ||
    kind === "approval_approved" ||
    kind === "approval_denied" ||
    kind === "command_dispatched" ||
    kind === "agent_removed"
      ? kind
      : "note";

  return {
    id: typeof parsed.id === "string" && parsed.id ? parsed.id : makeId(),
    serverId,
    memoryContextId,
    agentId: typeof parsed.agentId === "string" && parsed.agentId ? parsed.agentId : null,
    kind: validKind,
    summary,
    command: typeof parsed.command === "string" ? parsed.command : undefined,
    session: typeof parsed.session === "string" ? parsed.session : undefined,
    createdAt: typeof parsed.createdAt === "string" && parsed.createdAt ? parsed.createdAt : new Date().toISOString(),
  };
}

function sortMemory(entries: NovaMemoryEntry[]): NovaMemoryEntry[] {
  return entries.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function useNovaMemory({ serverId, maxEntries = 300 }: UseNovaMemoryArgs): UseNovaMemoryResult {
  const cap = Math.max(20, Math.min(maxEntries, 2000));
  const [entries, setEntries] = useState<NovaMemoryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const hydratedServerRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!serverId) {
      hydratedServerRef.current = null;
      setEntries([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const key = makeStorageKey(serverId);
    void SecureStore.getItemAsync(key)
      .then((raw) => {
        if (cancelled) {
          return;
        }
        if (!raw) {
          setEntries([]);
          return;
        }
        try {
          const parsed = JSON.parse(raw) as unknown;
          const normalized = Array.isArray(parsed)
            ? sortMemory(parsed.map((entry) => normalizeMemoryEntry(entry, serverId)).filter((entry): entry is NovaMemoryEntry => Boolean(entry))).slice(0, cap)
            : [];
          setEntries(normalized);
        } catch {
          setEntries([]);
        }
      })
      .finally(() => {
        if (cancelled) {
          return;
        }
        hydratedServerRef.current = serverId;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cap, serverId]);

  useEffect(() => {
    if (!serverId || hydratedServerRef.current !== serverId) {
      return;
    }
    const key = makeStorageKey(serverId);
    void SecureStore.setItemAsync(key, JSON.stringify(entries.slice(0, cap))).catch(() => {});
  }, [cap, entries, serverId]);

  const addEntry = useCallback(
    (input: AddMemoryEntryInput): NovaMemoryEntry | null => {
      if (!serverId) {
        return null;
      }
      const summary = input.summary.trim();
      const memoryContextId = input.memoryContextId.trim();
      if (!summary || !memoryContextId) {
        return null;
      }

      const entry: NovaMemoryEntry = {
        id: `memory-${makeId()}`,
        serverId,
        memoryContextId,
        agentId: input.agentId?.trim() || null,
        kind: input.kind,
        summary,
        command: input.command,
        session: input.session,
        createdAt: new Date().toISOString(),
      };

      setEntries((previous) => sortMemory([entry, ...previous]).slice(0, cap));
      return entry;
    },
    [cap, serverId]
  );

  const clearContext = useCallback((memoryContextId: string) => {
    const normalized = memoryContextId.trim();
    if (!normalized) {
      return;
    }
    setEntries((previous) => previous.filter((entry) => entry.memoryContextId !== normalized));
  }, []);

  const clearAll = useCallback(() => {
    setEntries([]);
  }, []);

  return useMemo(
    () => ({
      entries,
      loading,
      addEntry,
      clearContext,
      clearAll,
    }),
    [addEntry, clearAll, clearContext, entries, loading]
  );
}

export const novaMemoryTestUtils = {
  makeStorageKey,
  normalizeMemoryEntry,
};
