import { useMemo } from "react";

import { NovaAgent, NovaMemoryEntry, NovaSpineContext, NovaSpineContextStatus } from "../types";

type UseNovaSpineArgs = {
  serverId: string | null;
  agents: NovaAgent[];
  entries: NovaMemoryEntry[];
  maxRecentEntriesPerContext?: number;
  staleAfterMs?: number;
};

export type UseNovaSpineResult = {
  contexts: NovaSpineContext[];
  contextById: Map<string, NovaSpineContext>;
  findContextByAgentId: (agentId: string) => NovaSpineContext | null;
  findContextsByQuery: (query: string) => NovaSpineContext[];
  totalPendingApprovals: number;
};

function timestampMs(value: string | null | undefined): number {
  if (!value) {
    return 0;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function summarizeContextStatus(
  nowMs: number,
  staleAfterMs: number,
  activeStatus: NovaSpineContext["activeStatus"],
  pendingApprovalCount: number,
  lastUpdatedAt: string | null
): NovaSpineContextStatus {
  if (pendingApprovalCount > 0 || activeStatus === "waiting_approval") {
    return "waiting_approval";
  }
  if (activeStatus === "executing" || activeStatus === "monitoring") {
    return "active";
  }
  if (!lastUpdatedAt) {
    return "idle";
  }
  if (nowMs - timestampMs(lastUpdatedAt) > staleAfterMs) {
    return "stale";
  }
  return "healthy";
}

function deriveActiveStatus(agents: NovaAgent[]): NovaSpineContext["activeStatus"] {
  if (agents.length === 0) {
    return "none";
  }
  const statuses = new Set(agents.map((agent) => agent.status));
  if (statuses.size === 1) {
    return agents[0]?.status || "none";
  }
  return "mixed";
}

export function useNovaSpine({
  serverId,
  agents,
  entries,
  maxRecentEntriesPerContext = 5,
  staleAfterMs = 1000 * 60 * 60 * 24,
}: UseNovaSpineArgs): UseNovaSpineResult {
  const cappedRecent = Math.max(1, Math.min(maxRecentEntriesPerContext, 20));
  const contexts = useMemo(() => {
    if (!serverId) {
      return [] as NovaSpineContext[];
    }
    const nowMs = Date.now();
    const entriesByContext = new Map<string, NovaMemoryEntry[]>();
    const agentsByContext = new Map<string, NovaAgent[]>();

    entries
      .filter((entry) => entry.serverId === serverId)
      .forEach((entry) => {
        const contextId = entry.memoryContextId.trim();
        if (!contextId) {
          return;
        }
        const existing = entriesByContext.get(contextId);
        if (existing) {
          existing.push(entry);
          return;
        }
        entriesByContext.set(contextId, [entry]);
      });

    agents
      .filter((agent) => agent.serverId === serverId)
      .forEach((agent) => {
        const contextId = agent.memoryContextId.trim();
        if (!contextId) {
          return;
        }
        const existing = agentsByContext.get(contextId);
        if (existing) {
          existing.push(agent);
          return;
        }
        agentsByContext.set(contextId, [agent]);
      });

    const contextIds = new Set<string>([...entriesByContext.keys(), ...agentsByContext.keys()]);
    const next = Array.from(contextIds).map((memoryContextId) => {
      const contextEntries = (entriesByContext.get(memoryContextId) || [])
        .slice()
        .sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt));
      const contextAgents = (agentsByContext.get(memoryContextId) || [])
        .slice()
        .sort((a, b) => timestampMs(b.updatedAt) - timestampMs(a.updatedAt));
      const pendingApprovalCount = contextAgents.filter((agent) => agent.pendingApproval !== null).length;
      const activeStatus = deriveActiveStatus(contextAgents);
      const latestAgentTs = contextAgents.reduce((max, agent) => Math.max(max, timestampMs(agent.updatedAt)), 0);
      const latestEntryTs = contextEntries.reduce((max, entry) => Math.max(max, timestampMs(entry.createdAt)), 0);
      const latestTs = Math.max(latestAgentTs, latestEntryTs);
      const lastUpdatedAt = latestTs > 0 ? new Date(latestTs).toISOString() : null;
      const lastSummary =
        contextEntries[0]?.summary?.trim() ||
        (contextAgents[0] ? `${contextAgents[0].name} status ${contextAgents[0].status}` : null);

      return {
        serverId,
        memoryContextId,
        agentIds: contextAgents.map((agent) => agent.agentId),
        agentNames: contextAgents.map((agent) => agent.name),
        activeStatus,
        status: summarizeContextStatus(nowMs, staleAfterMs, activeStatus, pendingApprovalCount, lastUpdatedAt),
        pendingApprovalCount,
        lastUpdatedAt,
        lastSummary: lastSummary || null,
        totalEntries: contextEntries.length,
        recentEntries: contextEntries.slice(0, cappedRecent),
      } satisfies NovaSpineContext;
    });

    return next.sort((a, b) => {
      const delta = timestampMs(b.lastUpdatedAt) - timestampMs(a.lastUpdatedAt);
      if (delta !== 0) {
        return delta;
      }
      return a.memoryContextId.localeCompare(b.memoryContextId);
    });
  }, [agents, cappedRecent, entries, serverId, staleAfterMs]);

  const contextById = useMemo(() => {
    const map = new Map<string, NovaSpineContext>();
    contexts.forEach((context) => {
      map.set(context.memoryContextId, context);
    });
    return map;
  }, [contexts]);

  const contextByAgentId = useMemo(() => {
    const map = new Map<string, NovaSpineContext>();
    contexts.forEach((context) => {
      context.agentIds.forEach((agentId) => {
        map.set(agentId, context);
      });
    });
    return map;
  }, [contexts]);

  const findContextByAgentId = (agentId: string) => contextByAgentId.get(agentId.trim()) || null;

  const findContextsByQuery = (query: string) => {
    const normalized = normalizeToken(query);
    if (!normalized) {
      return contexts;
    }
    return contexts.filter((context) => {
      if (normalizeToken(context.memoryContextId).includes(normalized)) {
        return true;
      }
      if (context.agentNames.some((name) => normalizeToken(name).includes(normalized))) {
        return true;
      }
      if (context.lastSummary && normalizeToken(context.lastSummary).includes(normalized)) {
        return true;
      }
      return false;
    });
  };

  const totalPendingApprovals = contexts.reduce((sum, context) => sum + context.pendingApprovalCount, 0);

  return useMemo(
    () => ({
      contexts,
      contextById,
      findContextByAgentId,
      findContextsByQuery,
      totalPendingApprovals,
    }),
    [contextById, contexts, totalPendingApprovals]
  );
}

export const novaSpineTestUtils = {
  summarizeContextStatus,
  deriveActiveStatus,
  timestampMs,
};
