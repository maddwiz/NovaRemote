import { useCallback, useMemo } from "react";

import { NovaAgentStatus } from "../types";
import { useNovaAgents } from "./useNovaAgents";
import { useNovaMemory } from "./useNovaMemory";
import { useNovaSpine } from "./useNovaSpine";

type UseNovaAgentRuntimeArgs = {
  serverId: string | null;
  onDispatchCommand: (session: string, command: string) => void;
  resolveDefaultSession?: () => string | null;
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
  preserveGoal?: boolean;
};

type ApproveReadyApprovalsOptions = {
  commandByAgent?: Record<string, string>;
  sessionByAgent?: Record<string, string>;
  defaultSession?: string | null;
  nextStatus?: NovaAgentStatus;
};

type RunMonitoringCycleOptions = {
  intervalMs?: number;
  defaultSession?: string | null;
  autoApproveCapabilities?: string[];
  nowMs?: number;
};

type MonitoringCycleResult = {
  requested: string[];
  approved: string[];
  skipped: string[];
};

const DEFAULT_MONITORING_INTERVAL_MS = 60_000;
const DEFAULT_AUTO_APPROVE_CAPABILITIES = ["auto-approve", "autonomous", "self-approve"];
const DEFAULT_AUTONOMOUS_WORKFLOW_CAPABILITIES = ["autonomous-plan", "goal-sequence", "workflow", "multi-step"];

function supportsAutoApprove(capabilities: string[], autoApproveCapabilities: Set<string>): boolean {
  return capabilities.some((capability) => autoApproveCapabilities.has(capability.trim().toLowerCase()));
}

function parseTimestampMs(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCommandKey(command: string): string {
  return command
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function parseGoalWorkflowCommands(goal: string): string[] {
  const trimmed = goal.trim();
  if (!trimmed) {
    return [];
  }
  const bySeparator = trimmed
    .split(/\s*(?:&&|;|\n)\s*/g)
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (bySeparator.length > 1) {
    return bySeparator;
  }
  return trimmed
    .split(/\s+\bthen\b\s+/gi)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function supportsAutonomousWorkflow(capabilities: string[]): boolean {
  const normalized = new Set(capabilities.map((capability) => capability.trim().toLowerCase()));
  return DEFAULT_AUTONOMOUS_WORKFLOW_CAPABILITIES.some((capability) => normalized.has(capability));
}

export function useNovaAgentRuntime({ serverId, onDispatchCommand, resolveDefaultSession }: UseNovaAgentRuntimeArgs) {
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
  const {
    contexts: spineContexts,
    findContextByAgentId: findSpineContextByAgentId,
    findContextsByQuery: findSpineContextsByQuery,
    totalPendingApprovals: pendingSpineApprovals,
  } = useNovaSpine({
    serverId,
    agents,
    entries: memoryEntries,
  });

  const agentById = useMemo(() => {
    const map = new Map<string, (typeof agents)[number]>();
    agents.forEach((agent) => {
      map.set(agent.agentId, agent);
    });
    return map;
  }, [agents]);

  const latestSessionByAgentId = useMemo(() => {
    const map = new Map<string, { session: string; createdAtMs: number }>();
    memoryEntries.forEach((entry) => {
      const agentId = entry.agentId?.trim() || "";
      const session = entry.session?.trim() || "";
      if (!agentId || !session) {
        return;
      }
      const createdAtMs = parseTimestampMs(entry.createdAt) ?? 0;
      const existing = map.get(agentId);
      if (!existing || createdAtMs >= existing.createdAtMs) {
        map.set(agentId, { session, createdAtMs });
      }
    });
    return new Map(Array.from(map.entries()).map(([agentId, value]) => [agentId, value.session]));
  }, [memoryEntries]);

  const dispatchedCommandKeysByAgentId = useMemo(() => {
    const map = new Map<string, Set<string>>();
    memoryEntries.forEach((entry) => {
      if (entry.kind !== "command_dispatched") {
        return;
      }
      const agentId = entry.agentId?.trim() || "";
      const command = entry.command?.trim() || "";
      if (!agentId || !command) {
        return;
      }
      const key = normalizeCommandKey(command);
      if (!key) {
        return;
      }
      const set = map.get(agentId) || new Set<string>();
      set.add(key);
      map.set(agentId, set);
    });
    return map;
  }, [memoryEntries]);

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
      if (status === "monitoring" && !agent.pendingApproval) {
        const command = agent.currentGoal.trim();
        const session = resolveDefaultSession?.()?.trim() || latestSessionByAgentId.get(agent.agentId)?.trim() || "";
        if (command && session) {
          requestApproval(agentId, {
            summary: `Auto-queued monitoring goal for ${session}`,
            command,
            session,
          });
          addEntry({
            memoryContextId: agent.memoryContextId,
            agentId: agent.agentId,
            kind: "approval_requested",
            summary: `${agent.name} auto-queued monitoring goal`,
            command,
            session,
          });
          return;
        }
      }
      setAgentStatus(agentId, status);
      addEntry({
        memoryContextId: agent.memoryContextId,
        agentId: agent.agentId,
        kind: "note",
        summary: `${agent.name} status set to ${status}`,
      });
    },
    [addEntry, agentById, latestSessionByAgentId, requestApproval, resolveDefaultSession, setAgentStatus]
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

      if (!options?.preserveGoal) {
        setAgentGoal(agentId, command);
      }
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

  const approveReadyApprovals = useCallback(
    (options: ApproveReadyApprovalsOptions = {}): string[] => {
      const approved: string[] = [];
      const commandByAgent = options.commandByAgent || {};
      const sessionByAgent = options.sessionByAgent || {};
      const defaultSession = options.defaultSession?.trim() || "";

      agents.forEach((agent) => {
        if (!agent.pendingApproval) {
          return;
        }
        const command = (commandByAgent[agent.agentId] || agent.pendingApproval.command || "").trim();
        const session = (sessionByAgent[agent.agentId] || agent.pendingApproval.session || defaultSession || "").trim();
        if (!command || !session) {
          return;
        }
        const didApprove = approveAgentApproval(agent.agentId, {
          commandOverride: command,
          sessionOverride: session,
          nextStatus: options.nextStatus,
        });
        if (didApprove) {
          approved.push(agent.agentId);
        }
      });

      return approved;
    },
    [agents, approveAgentApproval]
  );

  const denyAllPendingApprovals = useCallback((): string[] => {
    const denied: string[] = [];
    agents.forEach((agent) => {
      if (!agent.pendingApproval) {
        return;
      }
      const didDeny = denyAgentApproval(agent.agentId);
      if (didDeny) {
        denied.push(agent.agentId);
      }
    });
    return denied;
  }, [agents, denyAgentApproval]);

  const runMonitoringCycle = useCallback(
    (options: RunMonitoringCycleOptions = {}): MonitoringCycleResult => {
      const requested: string[] = [];
      const approved: string[] = [];
      const skipped: string[] = [];
      const defaultSession = options.defaultSession?.trim() || resolveDefaultSession?.()?.trim() || "";
      const intervalMs = Math.max(1_000, Math.floor(options.intervalMs || DEFAULT_MONITORING_INTERVAL_MS));
      const nowMs = options.nowMs ?? Date.now();
      const autoApproveCapabilities = new Set(
        (options.autoApproveCapabilities?.length ? options.autoApproveCapabilities : DEFAULT_AUTO_APPROVE_CAPABILITIES).map((value) =>
          value.trim().toLowerCase()
        )
      );

      agents.forEach((agent) => {
        if (agent.status !== "monitoring") {
          return;
        }
        const goal = agent.currentGoal.trim();
        const agentDefaultSession = defaultSession || latestSessionByAgentId.get(agent.agentId)?.trim() || "";
        if (!goal) {
          skipped.push(agent.agentId);
          return;
        }
        const workflowCommands = supportsAutonomousWorkflow(agent.capabilities) ? parseGoalWorkflowCommands(goal) : [];
        const dispatchedWorkflowCommands = dispatchedCommandKeysByAgentId.get(agent.agentId) || new Set<string>();
        const hasWorkflow = workflowCommands.length > 1;
        const workflowNextIndex = hasWorkflow
          ? workflowCommands.findIndex((command) => !dispatchedWorkflowCommands.has(normalizeCommandKey(command)))
          : -1;
        const nextWorkflowCommand = hasWorkflow && workflowNextIndex >= 0 ? workflowCommands[workflowNextIndex] : goal;
        if (hasWorkflow && workflowNextIndex === -1) {
          setAgentStatus(agent.agentId, "idle");
          addEntry({
            memoryContextId: agent.memoryContextId,
            agentId: agent.agentId,
            kind: "note",
            summary: `${agent.name} autonomous workflow completed`,
            command: goal,
            session: agentDefaultSession || undefined,
          });
          skipped.push(agent.agentId);
          return;
        }

        const canAutoApprove = supportsAutoApprove(agent.capabilities, autoApproveCapabilities);
        const lastActionMs = parseTimestampMs(agent.lastActionAt || agent.updatedAt);
        const cooldownElapsed = lastActionMs === null || nowMs - lastActionMs >= intervalMs;

        if (agent.pendingApproval) {
          if (!canAutoApprove) {
            skipped.push(agent.agentId);
            return;
          }
          const pendingCommand = agent.pendingApproval.command?.trim() || nextWorkflowCommand;
          const pendingSession = agent.pendingApproval.session?.trim() || agentDefaultSession;
          if (!pendingCommand || !pendingSession) {
            skipped.push(agent.agentId);
            return;
          }
          const didApprove = approveAgentApproval(agent.agentId, {
            commandOverride: pendingCommand,
            sessionOverride: pendingSession,
            nextStatus: "monitoring",
            preserveGoal: hasWorkflow,
          });
          if (didApprove) {
            approved.push(agent.agentId);
          } else {
            skipped.push(agent.agentId);
          }
          return;
        }

        if (!cooldownElapsed || !agentDefaultSession) {
          skipped.push(agent.agentId);
          return;
        }

        const didRequest = requestAgentApproval(agent.agentId, {
          summary:
            hasWorkflow && workflowNextIndex >= 0
              ? `Monitoring workflow step ${workflowNextIndex + 1}/${workflowCommands.length} queued for ${agentDefaultSession}`
              : `Monitoring cycle queued for ${agentDefaultSession}`,
          command: nextWorkflowCommand,
          session: agentDefaultSession,
        });
        if (!didRequest) {
          skipped.push(agent.agentId);
          return;
        }
        requested.push(agent.agentId);
        if (!canAutoApprove) {
          return;
        }
        const didApprove = approveAgentApproval(agent.agentId, {
          commandOverride: nextWorkflowCommand,
          sessionOverride: agentDefaultSession,
          nextStatus: "monitoring",
          preserveGoal: hasWorkflow,
        });
        if (didApprove) {
          approved.push(agent.agentId);
        }
      });

      return { requested, approved, skipped };
    },
    [addEntry, agents, approveAgentApproval, dispatchedCommandKeysByAgentId, latestSessionByAgentId, requestAgentApproval, resolveDefaultSession, setAgentStatus]
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
      spineContexts,
      pendingSpineApprovals,
      findSpineContextByAgentId,
      findSpineContextsByQuery,
      addRuntimeAgent,
      removeRuntimeAgent,
      setRuntimeAgentStatus,
      setRuntimeAgentGoal,
      setRuntimeAgentCapabilities,
      requestAgentApproval,
      approveAgentApproval,
      denyAgentApproval,
      approveReadyApprovals,
      denyAllPendingApprovals,
      runMonitoringCycle,
      clearAgentMemory,
    }),
    [
      addRuntimeAgent,
      agents,
      approveAgentApproval,
      clearAgentMemory,
      denyAgentApproval,
      denyAllPendingApprovals,
      loading,
      memoryEntries,
      memoryLoading,
      spineContexts,
      pendingSpineApprovals,
      findSpineContextByAgentId,
      findSpineContextsByQuery,
      removeRuntimeAgent,
      requestAgentApproval,
      approveReadyApprovals,
      runMonitoringCycle,
      setRuntimeAgentCapabilities,
      setRuntimeAgentGoal,
      setRuntimeAgentStatus,
    ]
  );
}
