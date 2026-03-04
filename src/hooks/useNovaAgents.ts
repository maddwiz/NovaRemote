import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { makeId, STORAGE_NOVA_AGENTS_PREFIX } from "../constants";
import { NovaAgent, NovaAgentPendingApproval, NovaAgentStatus } from "../types";

type UseNovaAgentsArgs = {
  serverId: string | null;
};

type ResolveApprovalOptions = {
  nextStatus?: NovaAgentStatus;
};

type ApprovalRequest = Omit<NovaAgentPendingApproval, "requestedAt">;

export type UseNovaAgentsResult = {
  agents: NovaAgent[];
  loading: boolean;
  addAgent: (name: string, capabilities?: string[]) => NovaAgent | null;
  removeAgent: (agentId: string) => void;
  setAgentStatus: (agentId: string, status: NovaAgentStatus) => void;
  setAgentGoal: (agentId: string, goal: string) => void;
  setAgentCapabilities: (agentId: string, capabilities: string[]) => void;
  requestApproval: (agentId: string, request: ApprovalRequest) => void;
  resolveApproval: (agentId: string, approved: boolean, options?: ResolveApprovalOptions) => void;
  upsertAgent: (agent: NovaAgent) => void;
};

function makeStorageKey(serverId: string): string {
  return `${STORAGE_NOVA_AGENTS_PREFIX}.${serverId}`;
}

function uniqueCapabilities(input: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  input
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .forEach((entry) => {
      if (seen.has(entry)) {
        return;
      }
      seen.add(entry);
      next.push(entry);
    });
  return next;
}

function asIso(value: unknown): string {
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return new Date().toISOString();
}

function normalizeAgent(value: unknown, serverId: string): NovaAgent | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<NovaAgent>;
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const agentId = typeof parsed.agentId === "string" && parsed.agentId.trim() ? parsed.agentId.trim() : makeId();
  const statusValue = parsed.status;
  const status: NovaAgentStatus =
    statusValue === "monitoring" || statusValue === "executing" || statusValue === "waiting_approval" ? statusValue : "idle";

  if (!name) {
    return null;
  }

  const pendingApproval =
    parsed.pendingApproval && typeof parsed.pendingApproval === "object"
      ? {
          requestedAt: asIso((parsed.pendingApproval as Partial<NovaAgentPendingApproval>).requestedAt),
          summary: typeof (parsed.pendingApproval as Partial<NovaAgentPendingApproval>).summary === "string"
            ? (parsed.pendingApproval as Partial<NovaAgentPendingApproval>).summary || "Pending approval"
            : "Pending approval",
          command:
            typeof (parsed.pendingApproval as Partial<NovaAgentPendingApproval>).command === "string"
              ? (parsed.pendingApproval as Partial<NovaAgentPendingApproval>).command
              : undefined,
          session:
            typeof (parsed.pendingApproval as Partial<NovaAgentPendingApproval>).session === "string"
              ? (parsed.pendingApproval as Partial<NovaAgentPendingApproval>).session
              : undefined,
        }
      : null;

  return {
    serverId,
    agentId,
    name,
    status,
    currentGoal: typeof parsed.currentGoal === "string" ? parsed.currentGoal : "",
    memoryContextId:
      typeof parsed.memoryContextId === "string" && parsed.memoryContextId.trim()
        ? parsed.memoryContextId
        : `memory-${makeId()}`,
    capabilities: uniqueCapabilities(Array.isArray(parsed.capabilities) ? parsed.capabilities : []),
    pendingApproval,
    updatedAt: asIso(parsed.updatedAt),
    lastActionAt: typeof parsed.lastActionAt === "string" ? parsed.lastActionAt : null,
  };
}

function sortAgents(agents: NovaAgent[]): NovaAgent[] {
  return agents.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function mutateAgentList(
  agents: NovaAgent[],
  agentId: string,
  updater: (agent: NovaAgent) => NovaAgent
): NovaAgent[] {
  let changed = false;
  const next = agents.map((agent) => {
    if (agent.agentId !== agentId) {
      return agent;
    }
    changed = true;
    return updater(agent);
  });
  return changed ? sortAgents(next) : agents;
}

function withTimestamp(agent: NovaAgent, next: Partial<NovaAgent>): NovaAgent {
  return {
    ...agent,
    ...next,
    updatedAt: new Date().toISOString(),
  };
}

export function useNovaAgents({ serverId }: UseNovaAgentsArgs): UseNovaAgentsResult {
  const [agents, setAgents] = useState<NovaAgent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const hydratedServerRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!serverId) {
      hydratedServerRef.current = null;
      setAgents([]);
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
          setAgents([]);
          return;
        }
        try {
          const parsed = JSON.parse(raw) as unknown;
          const normalized = Array.isArray(parsed)
            ? sortAgents(parsed.map((entry) => normalizeAgent(entry, serverId)).filter((entry): entry is NovaAgent => Boolean(entry)))
            : [];
          setAgents(normalized);
        } catch {
          setAgents([]);
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
  }, [serverId]);

  useEffect(() => {
    if (!serverId || hydratedServerRef.current !== serverId) {
      return;
    }
    const key = makeStorageKey(serverId);
    void SecureStore.setItemAsync(key, JSON.stringify(agents)).catch(() => {});
  }, [agents, serverId]);

  const addAgent = useCallback((name: string, capabilities: string[] = []): NovaAgent | null => {
    if (!serverId) {
      return null;
    }
    const trimmed = name.trim();
    if (!trimmed) {
      return null;
    }
    const now = new Date().toISOString();
    const agent: NovaAgent = {
      serverId,
      agentId: `agent-${makeId()}`,
      name: trimmed,
      status: "idle",
      currentGoal: "",
      memoryContextId: `memory-${makeId()}`,
      capabilities: uniqueCapabilities(capabilities),
      pendingApproval: null,
      updatedAt: now,
      lastActionAt: null,
    };

    setAgents((prev) => sortAgents([agent, ...prev]));
    return agent;
  }, [serverId]);

  const removeAgent = useCallback((agentId: string) => {
    setAgents((prev) => prev.filter((agent) => agent.agentId !== agentId));
  }, []);

  const setAgentStatus = useCallback((agentId: string, status: NovaAgentStatus) => {
    setAgents((prev) =>
      mutateAgentList(prev, agentId, (agent) =>
        withTimestamp(agent, {
          status,
          lastActionAt: new Date().toISOString(),
          pendingApproval: status === "waiting_approval" ? agent.pendingApproval : null,
        })
      )
    );
  }, []);

  const setAgentGoal = useCallback((agentId: string, goal: string) => {
    setAgents((prev) =>
      mutateAgentList(prev, agentId, (agent) =>
        withTimestamp(agent, {
          currentGoal: goal,
          lastActionAt: new Date().toISOString(),
        })
      )
    );
  }, []);

  const setAgentCapabilities = useCallback((agentId: string, capabilities: string[]) => {
    setAgents((prev) =>
      mutateAgentList(prev, agentId, (agent) =>
        withTimestamp(agent, {
          capabilities: uniqueCapabilities(capabilities),
          lastActionAt: new Date().toISOString(),
        })
      )
    );
  }, []);

  const requestApproval = useCallback((agentId: string, request: ApprovalRequest) => {
    setAgents((prev) =>
      mutateAgentList(prev, agentId, (agent) =>
        withTimestamp(agent, {
          status: "waiting_approval",
          pendingApproval: {
            requestedAt: new Date().toISOString(),
            summary: request.summary || "Pending approval",
            command: request.command,
            session: request.session,
          },
          lastActionAt: new Date().toISOString(),
        })
      )
    );
  }, []);

  const resolveApproval = useCallback((agentId: string, approved: boolean, options?: ResolveApprovalOptions) => {
    setAgents((prev) =>
      mutateAgentList(prev, agentId, (agent) => {
        const nextStatus: NovaAgentStatus = approved ? options?.nextStatus || "executing" : "idle";
        return withTimestamp(agent, {
          status: nextStatus,
          pendingApproval: null,
          lastActionAt: new Date().toISOString(),
        });
      })
    );
  }, []);

  const upsertAgent = useCallback((agent: NovaAgent) => {
    if (!serverId || agent.serverId !== serverId) {
      return;
    }
    setAgents((prev) => {
      const next = prev.filter((entry) => entry.agentId !== agent.agentId);
      next.unshift({
        ...agent,
        serverId,
        updatedAt: agent.updatedAt || new Date().toISOString(),
      });
      return sortAgents(next);
    });
  }, [serverId]);

  return useMemo(
    () => ({
      agents,
      loading,
      addAgent,
      removeAgent,
      setAgentStatus,
      setAgentGoal,
      setAgentCapabilities,
      requestApproval,
      resolveApproval,
      upsertAgent,
    }),
    [agents, loading, addAgent, removeAgent, resolveApproval, requestApproval, setAgentCapabilities, setAgentGoal, setAgentStatus, upsertAgent]
  );
}

export const novaAgentsTestUtils = {
  uniqueCapabilities,
  normalizeAgent,
  makeStorageKey,
};
