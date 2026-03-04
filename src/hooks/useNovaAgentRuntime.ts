import { useCallback, useMemo } from "react";

import { NovaAgentStatus } from "../types";
import { useNovaAgents } from "./useNovaAgents";
import { useNovaMemory } from "./useNovaMemory";

type UseNovaAgentRuntimeArgs = {
  serverId: string | null;
  onDispatchCommand: (session: string, command: string) => void;
};

type AgentApprovalRequest = {
  command: string;
  session: string;
  summary?: string;
};

type ApproveAgentOptions = {
  commandOverride?: string;
  sessionOverride?: string;
  nextStatus?: NovaAgentStatus;
};

export function useNovaAgentRuntime({ serverId, onDispatchCommand }: UseNovaAgentRuntimeArgs) {
  const {
    agents,
    loading,
    addAgent,
    removeAgent,
    setAgentStatus,
    setAgentGoal,
    setAgentCapabilities,
    requestApproval,
    resolveApproval,
  } = useNovaAgents({ serverId });
  const { entries: memoryEntries, loading: memoryLoading, addEntry, clearContext } = useNovaMemory({ serverId });

  const agentById = useMemo(() => {
    const map = new Map<string, (typeof agents)[number]>();
    agents.forEach((agent) => {
      map.set(agent.agentId, agent);
    });
    return map;
  }, [agents]);

  const addRuntimeAgent = useCallback(
    (name: string, capabilities: string[] = []) => {
      const created = addAgent(name, capabilities);
      if (!created) {
        return null;
      }
      addEntry({
        memoryContextId: created.memoryContextId,
        agentId: created.agentId,
        kind: "agent_created",
        summary: `${created.name} created`,
      });
      return created;
    },
    [addAgent, addEntry]
  );

  const removeRuntimeAgent = useCallback(
    (agentId: string) => {
      const agent = agentById.get(agentId);
      if (!agent) {
        return;
      }
      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "agent_removed",
        summary: `${agent.name} removed`,
      });
      removeAgent(agentId);
    },
    [addEntry, agentById, removeAgent]
  );

  const setRuntimeAgentStatus = useCallback(
    (agentId: string, status: NovaAgentStatus) => {
      const agent = agentById.get(agentId);
      if (!agent || agent.status === status) {
        return;
      }
      setAgentStatus(agentId, status);
      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "note",
        summary: `${agent.name} status set to ${status}`,
      });
    },
    [addEntry, agentById, setAgentStatus]
  );

  const setRuntimeAgentGoal = useCallback(
    (agentId: string, goal: string) => {
      const agent = agentById.get(agentId);
      if (!agent) {
        return;
      }
      const nextGoal = goal.trim();
      if (nextGoal === agent.currentGoal.trim()) {
        return;
      }
      setAgentGoal(agentId, goal);
      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "goal_updated",
        summary: `${agent.name} goal updated`,
        command: nextGoal || undefined,
      });
    },
    [addEntry, agentById, setAgentGoal]
  );

  const setRuntimeAgentCapabilities = useCallback(
    (agentId: string, capabilities: string[]) => {
      const agent = agentById.get(agentId);
      if (!agent) {
        return;
      }
      setAgentCapabilities(agentId, capabilities);
      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "note",
        summary: `${agent.name} capabilities updated`,
      });
    },
    [addEntry, agentById, setAgentCapabilities]
  );

  const requestAgentApproval = useCallback(
    (agentId: string, request: AgentApprovalRequest): boolean => {
      const agent = agentById.get(agentId);
      const command = request.command.trim();
      const session = request.session.trim();
      if (!agent || !command || !session) {
        return false;
      }
      requestApproval(agentId, {
        summary: request.summary?.trim() || `${agent.name} requests command approval`,
        command,
        session,
      });
      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "approval_requested",
        summary: `${agent.name} requested approval`,
        command,
        session,
      });
      return true;
    },
    [addEntry, agentById, requestApproval]
  );

  const approveAgentApproval = useCallback(
    (agentId: string, options?: ApproveAgentOptions): boolean => {
      const agent = agentById.get(agentId);
      if (!agent) {
        return false;
      }
      const command =
        options?.commandOverride?.trim() ||
        agent.pendingApproval?.command?.trim() ||
        "";
      const session =
        options?.sessionOverride?.trim() ||
        agent.pendingApproval?.session?.trim() ||
        "";
      if (!command || !session) {
        return false;
      }

      setAgentGoal(agentId, command);
      onDispatchCommand(session, command);
      resolveApproval(agentId, true, { nextStatus: options?.nextStatus || "executing" });

      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "approval_approved",
        summary: `${agent.name} approval granted`,
        command,
        session,
      });
      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "command_dispatched",
        summary: `${agent.name} dispatched command`,
        command,
        session,
      });
      return true;
    },
    [addEntry, agentById, onDispatchCommand, resolveApproval, setAgentGoal]
  );

  const denyAgentApproval = useCallback(
    (agentId: string): boolean => {
      const agent = agentById.get(agentId);
      if (!agent) {
        return false;
      }
      resolveApproval(agentId, false, { nextStatus: "idle" });
      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "approval_denied",
        summary: `${agent.name} approval denied`,
        command: agent.pendingApproval?.command,
        session: agent.pendingApproval?.session,
      });
      return true;
    },
    [addEntry, agentById, resolveApproval]
  );

  const clearAgentMemory = useCallback(
    (agentId: string) => {
      const agent = agentById.get(agentId);
      if (!agent) {
        return;
      }
      clearContext(agent.memoryContextId);
    },
    [agentById, clearContext]
  );

  return useMemo(
    () => ({
      agents,
      loading,
      memoryEntries,
      memoryLoading,
      addRuntimeAgent,
      removeRuntimeAgent,
      setRuntimeAgentStatus,
      setRuntimeAgentGoal,
      setRuntimeAgentCapabilities,
      requestAgentApproval,
      approveAgentApproval,
      denyAgentApproval,
      clearAgentMemory,
    }),
    [
      addRuntimeAgent,
      agents,
      approveAgentApproval,
      clearAgentMemory,
      denyAgentApproval,
      loading,
      memoryEntries,
      memoryLoading,
      removeRuntimeAgent,
      requestAgentApproval,
      setRuntimeAgentCapabilities,
      setRuntimeAgentGoal,
      setRuntimeAgentStatus,
    ]
  );
}

