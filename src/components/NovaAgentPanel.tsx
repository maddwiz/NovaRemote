import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useNovaAdaptBridge } from "../hooks/useNovaAdaptBridge";
import { useNovaAgentRuntime } from "../hooks/useNovaAgentRuntime";
import {
  NovaAdaptBridgeHealth,
  NovaAdaptBridgeJob,
  NovaAdaptBridgeMemoryStatus,
  NovaAdaptBridgePlan,
  NovaAdaptBridgeWorkflow,
  NovaAgent,
  NovaAgentStatus,
  NovaMemoryEntry,
  NovaSpineContext,
  ServerProfile,
} from "../types";
import { styles } from "../theme/styles";

type NovaAgentPanelProps = {
  server: ServerProfile | null;
  serverId: string | null;
  serverName: string | null;
  sessions: string[];
  isPro: boolean;
  onShowPaywall: () => void;
  onQueueCommand: (session: string, command: string) => void;
  onOpenAgents?: () => void;
  surface?: "preview" | "panel" | "screen";
};

const STATUS_ORDER: NovaAgentStatus[] = ["idle", "monitoring", "executing", "waiting_approval"];

function parseCapabilities(raw: string): string[] {
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function statusLabel(status: NovaAgentStatus): string {
  if (status === "waiting_approval") {
    return "WAITING";
  }
  if (status === "monitoring") {
    return "MONITOR";
  }
  if (status === "executing") {
    return "EXEC";
  }
  return "IDLE";
}

function spineStatusLabel(status: NovaSpineContext["status"]): string {
  if (status === "waiting_approval") {
    return "WAITING";
  }
  if (status === "active") {
    return "ACTIVE";
  }
  if (status === "stale") {
    return "STALE";
  }
  if (status === "healthy") {
    return "HEALTHY";
  }
  return "IDLE";
}

function bridgeStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (!normalized) {
    return "UNKNOWN";
  }
  if (normalized === "pending") {
    return "PENDING";
  }
  if (normalized === "approved") {
    return "APPROVED";
  }
  if (normalized === "executing") {
    return "EXEC";
  }
  if (normalized === "executed") {
    return "DONE";
  }
  if (normalized === "rejected") {
    return "REJECTED";
  }
  if (normalized === "failed") {
    return "FAILED";
  }
  if (normalized === "queued") {
    return "QUEUED";
  }
  if (normalized === "running") {
    return "RUNNING";
  }
  if (normalized === "paused") {
    return "PAUSED";
  }
  return normalized.replace(/_/g, " ").toUpperCase();
}

function modePillForStatus(status: string): object {
  const normalized = status.trim().toLowerCase();
  if (normalized === "failed" || normalized === "rejected") {
    return styles.modePillAi;
  }
  return styles.modePillShell;
}

function formatBridgeDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return null;
  }
  return new Date(timestamp).toLocaleTimeString();
}

function summarizeBridgeHealth(health: NovaAdaptBridgeHealth | null, runtimeAvailable: boolean): string {
  if (!health) {
    return runtimeAvailable ? "Runtime reachable" : "Runtime unavailable";
  }
  const featureCount =
    health.features && typeof health.features === "object"
      ? Object.values(health.features as Record<string, unknown>).filter(Boolean).length
      : 0;
  const memoryBackend =
    health.novaspine && typeof health.novaspine === "object"
      ? String((health.novaspine as Record<string, unknown>).url || "").trim()
      : "";
  const parts = [runtimeAvailable ? "Runtime online" : "Runtime unavailable"];
  if (featureCount > 0) {
    parts.push(`${featureCount} features`);
  }
  if (memoryBackend) {
    parts.push("NovaSpine linked");
  }
  return parts.join(" • ");
}

function summarizeMemoryStatus(memoryStatus: NovaAdaptBridgeMemoryStatus | null): string {
  if (!memoryStatus) {
    return "Memory backend unavailable";
  }
  const backend = typeof memoryStatus.backend === "string" && memoryStatus.backend.trim() ? memoryStatus.backend.trim() : "default";
  const enabled = memoryStatus.enabled === false ? "disabled" : "enabled";
  return `${backend} • ${enabled}`;
}

function canApprovePlan(status: string): boolean {
  return status.trim().toLowerCase() === "pending";
}

function canRejectPlan(status: string): boolean {
  return ["pending", "approved"].includes(status.trim().toLowerCase());
}

function canRetryPlan(status: string): boolean {
  return status.trim().toLowerCase() === "failed";
}

function canUndoPlan(status: string): boolean {
  return ["approved", "executed", "rejected", "failed"].includes(status.trim().toLowerCase());
}

function canResumeWorkflow(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized !== "running" && normalized !== "done";
}

function RemoteBridgeSection({
  loading,
  refreshing,
  supported,
  runtimeAvailable,
  error,
  health,
  memoryStatus,
  plans,
  jobs,
  workflows,
  mutationPlanId,
  mutationWorkflowId,
  onRefresh,
  onApprovePlan,
  onRejectPlan,
  onRetryPlan,
  onUndoPlan,
  onResumeWorkflow,
}: {
  loading: boolean;
  refreshing: boolean;
  supported: boolean;
  runtimeAvailable: boolean;
  error: string | null;
  health: NovaAdaptBridgeHealth | null;
  memoryStatus: NovaAdaptBridgeMemoryStatus | null;
  plans: NovaAdaptBridgePlan[];
  jobs: NovaAdaptBridgeJob[];
  workflows: NovaAdaptBridgeWorkflow[];
  mutationPlanId: string | null;
  mutationWorkflowId: string | null;
  onRefresh: () => void;
  onApprovePlan: (planId: string) => void;
  onRejectPlan: (planId: string) => void;
  onRetryPlan: (planId: string) => void;
  onUndoPlan: (planId: string) => void;
  onResumeWorkflow: (workflowId: string) => void;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.rowInlineSpace}>
        <Text style={styles.panelLabel}>Server Runtime</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh NovaAdapt runtime"
          style={[styles.actionButton, loading || refreshing ? styles.buttonDisabled : null]}
          disabled={loading || refreshing}
          onPress={onRefresh}
        >
          <Text style={styles.actionButtonText}>{loading || refreshing ? "Refreshing..." : "Refresh"}</Text>
        </Pressable>
      </View>
      {!supported ? (
        <Text style={styles.emptyText}>
          {loading ? "Checking server runtime..." : "Server runtime is not enabled on this companion server yet."}
        </Text>
      ) : (
        <>
          <Text style={styles.serverSubtitle}>{summarizeBridgeHealth(health, runtimeAvailable)}</Text>
          <Text style={styles.emptyText}>{`Memory ${summarizeMemoryStatus(memoryStatus)}`}</Text>
          {error ? <Text style={styles.emptyText}>{`Runtime error: ${error}`}</Text> : null}

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Plans</Text>
            {plans.length === 0 ? (
              <Text style={styles.emptyText}>No server plans yet.</Text>
            ) : (
              plans.slice(0, 4).map((plan) => {
                const progressLabel =
                  plan.progressTotal > 0 ? `${plan.progressCompleted}/${plan.progressTotal}` : `${plan.progressCompleted}`;
                const updatedAt = formatBridgeDate(plan.updatedAt || plan.createdAt);
                const busy = mutationPlanId === plan.id;
                return (
                  <View key={`bridge-plan-${plan.id}`} style={styles.terminalCard}>
                    <View style={styles.terminalNameRow}>
                      <Text style={styles.terminalName}>{plan.objective}</Text>
                      <Text style={[styles.modePill, modePillForStatus(plan.status)]}>{bridgeStatusLabel(plan.status)}</Text>
                    </View>
                    <Text style={styles.serverSubtitle}>{`Plan ${plan.id}`}</Text>
                    <Text style={styles.emptyText}>{`Progress ${progressLabel}${updatedAt ? ` • ${updatedAt}` : ""}`}</Text>
                    {plan.executionError ? <Text style={styles.emptyText}>{`Error ${plan.executionError}`}</Text> : null}
                    {plan.rejectReason ? <Text style={styles.emptyText}>{`Rejected ${plan.rejectReason}`}</Text> : null}
                    <View style={styles.actionsWrap}>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Approve plan ${plan.id}`}
                        style={[styles.actionButton, !canApprovePlan(plan.status) || busy ? styles.buttonDisabled : null]}
                        disabled={!canApprovePlan(plan.status) || busy}
                        onPress={() => onApprovePlan(plan.id)}
                      >
                        <Text style={styles.actionButtonText}>Approve</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Retry plan ${plan.id}`}
                        style={[styles.actionButton, !canRetryPlan(plan.status) || busy ? styles.buttonDisabled : null]}
                        disabled={!canRetryPlan(plan.status) || busy}
                        onPress={() => onRetryPlan(plan.id)}
                      >
                        <Text style={styles.actionButtonText}>Retry</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Undo plan ${plan.id}`}
                        style={[styles.actionButton, !canUndoPlan(plan.status) || busy ? styles.buttonDisabled : null]}
                        disabled={!canUndoPlan(plan.status) || busy}
                        onPress={() => onUndoPlan(plan.id)}
                      >
                        <Text style={styles.actionButtonText}>Undo</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Reject plan ${plan.id}`}
                        style={[styles.actionDangerButton, !canRejectPlan(plan.status) || busy ? styles.buttonDisabled : null]}
                        disabled={!canRejectPlan(plan.status) || busy}
                        onPress={() => onRejectPlan(plan.id)}
                      >
                        <Text style={styles.actionDangerText}>Reject</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Workflows</Text>
            {workflows.length === 0 ? (
              <Text style={styles.emptyText}>No server workflows yet.</Text>
            ) : (
              workflows.slice(0, 4).map((workflow) => (
                <View key={`bridge-workflow-${workflow.workflowId}`} style={styles.terminalCard}>
                  <View style={styles.terminalNameRow}>
                    <Text style={styles.terminalName}>{workflow.objective}</Text>
                    <Text style={[styles.modePill, modePillForStatus(workflow.status)]}>{bridgeStatusLabel(workflow.status)}</Text>
                  </View>
                  <Text style={styles.serverSubtitle}>{`Workflow ${workflow.workflowId}`}</Text>
                  <Text style={styles.emptyText}>{formatBridgeDate(workflow.updatedAt) ? `Updated ${formatBridgeDate(workflow.updatedAt)}` : "Awaiting activity"}</Text>
                  {workflow.lastError ? <Text style={styles.emptyText}>{`Error ${workflow.lastError}`}</Text> : null}
                  <View style={styles.actionsWrap}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Resume workflow ${workflow.workflowId}`}
                      style={[
                        styles.actionButton,
                        !canResumeWorkflow(workflow.status) || mutationWorkflowId === workflow.workflowId
                          ? styles.buttonDisabled
                          : null,
                      ]}
                      disabled={!canResumeWorkflow(workflow.status) || mutationWorkflowId === workflow.workflowId}
                      onPress={() => onResumeWorkflow(workflow.workflowId)}
                    >
                      <Text style={styles.actionButtonText}>
                        {mutationWorkflowId === workflow.workflowId ? "Resuming..." : "Resume"}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))
            )}
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Jobs</Text>
            {jobs.length === 0 ? (
              <Text style={styles.emptyText}>No server jobs yet.</Text>
            ) : (
              jobs.slice(0, 4).map((job) => (
                <View key={`bridge-job-${job.id}`} style={styles.terminalCard}>
                  <View style={styles.terminalNameRow}>
                    <Text style={styles.terminalName}>{job.id}</Text>
                    <Text style={[styles.modePill, modePillForStatus(job.status)]}>{bridgeStatusLabel(job.status)}</Text>
                  </View>
                  <Text style={styles.serverSubtitle}>
                    {`Created ${formatBridgeDate(job.createdAt) || "unknown"}${formatBridgeDate(job.finishedAt) ? ` • Finished ${formatBridgeDate(job.finishedAt)}` : ""}`}
                  </Text>
                  {job.error ? <Text style={styles.emptyText}>{`Error ${job.error}`}</Text> : null}
                </View>
              ))
            )}
          </View>
        </>
      )}
    </View>
  );
}

function AgentCard({
  agent,
  sessions,
  command,
  goalDraft,
  capabilitiesDraft,
  memoryEntries,
  spineContext,
  selectedSession,
  onCommandChange,
  onGoalChange,
  onGoalBlur,
  onCapabilitiesChange,
  onCapabilitiesBlur,
  onSelectSession,
  onSetStatus,
  onRequestApproval,
  onApprove,
  onDeny,
  onRemove,
  onClearMemory,
}: {
  agent: NovaAgent;
  sessions: string[];
  command: string;
  goalDraft: string;
  capabilitiesDraft: string;
  memoryEntries: NovaMemoryEntry[];
  spineContext: NovaSpineContext | null;
  selectedSession: string | null;
  onCommandChange: (value: string) => void;
  onGoalChange: (value: string) => void;
  onGoalBlur: () => void;
  onCapabilitiesChange: (value: string) => void;
  onCapabilitiesBlur: () => void;
  onSelectSession: (value: string) => void;
  onSetStatus: (status: NovaAgentStatus) => void;
  onRequestApproval: () => void;
  onApprove: () => void;
  onDeny: () => void;
  onRemove: () => void;
  onClearMemory: () => void;
}) {
  const recentMemory = memoryEntries.slice(0, 4);
  const contextSummary = spineContext
    ? `${spineStatusLabel(spineContext.status)} • events ${spineContext.totalEntries}${spineContext.pendingApprovalCount > 0 ? ` • pending ${spineContext.pendingApprovalCount}` : ""}`
    : "IDLE • events 0";

  return (
    <View style={styles.terminalCard}>
      <View style={styles.terminalNameRow}>
        <Text style={styles.terminalName}>{agent.name}</Text>
        <Text style={[styles.modePill, styles.modePillShell]}>{statusLabel(agent.status)}</Text>
      </View>
      <Text style={styles.serverSubtitle}>{`Memory ${agent.memoryContextId}`}</Text>
      <Text style={styles.emptyText}>{`Context ${contextSummary}`}</Text>
      {spineContext?.lastSummary ? <Text style={styles.emptyText}>{`Last: ${spineContext.lastSummary}`}</Text> : null}

      <TextInput
        style={styles.input}
        value={goalDraft}
        onChangeText={onGoalChange}
        onEndEditing={onGoalBlur}
        placeholder="Current goal"
        placeholderTextColor="#7f7aa8"
      />

      <TextInput
        style={styles.input}
        value={capabilitiesDraft}
        onChangeText={onCapabilitiesChange}
        onEndEditing={onCapabilitiesBlur}
        placeholder="Capabilities (comma separated)"
        placeholderTextColor="#7f7aa8"
        autoCapitalize="none"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {STATUS_ORDER.map((status) => {
          const active = agent.status === status;
          return (
            <Pressable
              key={`${agent.agentId}-status-${status}`}
              accessibilityRole="button"
              accessibilityLabel={`Set ${agent.name} status to ${statusLabel(status)}`}
              style={[styles.chip, active ? styles.chipActive : null]}
              onPress={() => onSetStatus(status)}
            >
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{statusLabel(status)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {sessions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {sessions.map((session) => {
            const active = selectedSession === session;
            return (
              <Pressable
                key={`${agent.agentId}-session-${session}`}
                accessibilityRole="button"
                accessibilityLabel={`Route ${agent.name} to ${session}`}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => onSelectSession(session)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{session}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>Open a terminal session to route agent commands.</Text>
      )}

      <TextInput
        style={styles.input}
        value={command}
        onChangeText={onCommandChange}
        placeholder="Command for approval (example: npm run deploy)"
        placeholderTextColor="#7f7aa8"
      />

      {agent.pendingApproval ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Pending Approval</Text>
          <Text style={styles.serverSubtitle}>{agent.pendingApproval.summary}</Text>
          {agent.pendingApproval.command ? <Text style={styles.emptyText}>{agent.pendingApproval.command}</Text> : null}
          <View style={styles.actionsWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Approve ${agent.name}`}
              style={[styles.actionButton, !selectedSession ? styles.buttonDisabled : null]}
              disabled={!selectedSession}
              onPress={onApprove}
            >
              <Text style={styles.actionButtonText}>Approve + Send</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Deny ${agent.name}`}
              style={styles.actionDangerButton}
              onPress={onDeny}
            >
              <Text style={styles.actionDangerText}>Deny</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.actionsWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Request approval for ${agent.name}`}
            style={[styles.actionButton, !command.trim() || !selectedSession ? styles.buttonDisabled : null]}
            disabled={!command.trim() || !selectedSession}
            onPress={onRequestApproval}
          >
            <Text style={styles.actionButtonText}>Request Approval</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${agent.name}`}
            style={styles.actionDangerButton}
            onPress={onRemove}
          >
            <Text style={styles.actionDangerText}>Remove</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.panel}>
        <View style={styles.terminalNameRow}>
          <Text style={styles.panelLabel}>Memory Timeline</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Clear memory for ${agent.name}`}
            style={[styles.actionButton, memoryEntries.length === 0 ? styles.buttonDisabled : null]}
            disabled={memoryEntries.length === 0}
            onPress={onClearMemory}
          >
            <Text style={styles.actionButtonText}>Clear</Text>
          </Pressable>
        </View>
        {recentMemory.length === 0 ? (
          <Text style={styles.emptyText}>No memory events yet.</Text>
        ) : (
          recentMemory.map((entry) => (
            <Text key={entry.id} style={styles.emptyText}>
              {`${new Date(entry.createdAt).toLocaleTimeString()} • ${entry.summary}`}
            </Text>
          ))
        )}
      </View>
    </View>
  );
}

export function NovaAgentPanel({
  server,
  serverId,
  serverName,
  sessions,
  isPro,
  onShowPaywall,
  onQueueCommand,
  onOpenAgents,
  surface = "preview",
}: NovaAgentPanelProps) {
  const [newAgentName, setNewAgentName] = useState<string>("");
  const [newAgentCapabilities, setNewAgentCapabilities] = useState<string>("watch,tool-calling");
  const [remoteCreateStatus, setRemoteCreateStatus] = useState<string>("");

  const defaultSession = useMemo(() => sessions[0] || null, [sessions]);
  const {
    loading: bridgeLoading,
    refreshing: bridgeRefreshing,
    supported: bridgeSupported,
    runtimeAvailable: bridgeRuntimeAvailable,
    error: bridgeError,
    health: bridgeHealth,
    memoryStatus: bridgeMemoryStatus,
    plans: bridgePlans,
    jobs: bridgeJobs,
    workflows: bridgeWorkflows,
    refresh: refreshBridge,
    createPlan,
    startWorkflow,
    resumeWorkflow,
    approvePlanAsync,
    rejectPlan,
    retryFailedPlanAsync,
    undoPlan,
  } = useNovaAdaptBridge({ server, enabled: Boolean(serverId) });
  const [remoteMutationPlanId, setRemoteMutationPlanId] = useState<string | null>(null);
  const [remoteMutationWorkflowId, setRemoteMutationWorkflowId] = useState<string | null>(null);
  const showLocalPreview =
    surface === "preview" || (surface === "screen" && (!bridgeSupported || !bridgeRuntimeAvailable));
  const showRemoteCreateControls = surface === "screen" && bridgeSupported && bridgeRuntimeAvailable;

  const runRemotePlanAction = useCallback(
    async (planId: string, action: (targetPlanId: string) => Promise<boolean>) => {
      setRemoteMutationPlanId(planId);
      try {
        await action(planId);
      } finally {
        setRemoteMutationPlanId((current) => (current === planId ? null : current));
      }
    },
    []
  );

  const runRemoteWorkflowAction = useCallback(
    async (workflowId: string, action: (targetWorkflowId: string) => Promise<boolean>) => {
      setRemoteMutationWorkflowId(workflowId);
      try {
        await action(workflowId);
      } finally {
        setRemoteMutationWorkflowId((current) => (current === workflowId ? null : current));
      }
    },
    []
  );

  const createRemotePlan = useCallback(async () => {
    const objective = newAgentName.trim();
    if (!objective) {
      return;
    }
    setRemoteCreateStatus("Creating approval plan...");
    try {
      const created = await createPlan(objective, { strategy: "single" });
      if (created) {
        setRemoteCreateStatus(`Created plan ${created.id}`);
        setNewAgentName("");
      } else {
        setRemoteCreateStatus("Plan creation returned no result.");
      }
    } catch (nextError) {
      const detail = nextError instanceof Error ? nextError.message : String(nextError || "Unknown error");
      setRemoteCreateStatus(`Plan creation failed: ${detail}`);
    }
  }, [createPlan, newAgentName]);

  const startRemoteWorkflow = useCallback(async () => {
    const objective = newAgentName.trim();
    if (!objective) {
      return;
    }
    const capabilities = parseCapabilities(newAgentCapabilities);
    setRemoteCreateStatus("Starting server workflow...");
    try {
      const created = await startWorkflow(objective, {
        autoResume: true,
        metadata: capabilities.length > 0 ? { capabilities } : {},
      });
      if (created) {
        setRemoteCreateStatus(`Started workflow ${created.workflowId}`);
        setNewAgentName("");
      } else {
        setRemoteCreateStatus("Workflow creation returned no result.");
      }
    } catch (nextError) {
      const detail = nextError instanceof Error ? nextError.message : String(nextError || "Unknown error");
      setRemoteCreateStatus(`Workflow start failed: ${detail}`);
    }
  }, [newAgentCapabilities, newAgentName, startWorkflow]);

  if (!serverId) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>{surface === "screen" ? "NovaAdapt Agents" : "NovaAdapt Agents (Preview)"}</Text>
        <Text style={styles.emptyText}>Select a server to manage agents.</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>{surface === "screen" ? "NovaAdapt Agents" : "NovaAdapt Agents (Preview)"}</Text>
      <Text style={styles.serverSubtitle}>
        {surface === "screen"
          ? `${serverName || "Server"} • Live runtime, plans, jobs, and workflows`
          : surface === "panel"
            ? `${serverName || "Server"} • Runtime status, plans, and workflows`
            : `${serverName || "Server"} • Agent lifecycle + approval queue groundwork`}
      </Text>

      <RemoteBridgeSection
        loading={bridgeLoading}
        refreshing={bridgeRefreshing}
        supported={bridgeSupported}
        runtimeAvailable={bridgeRuntimeAvailable}
        error={bridgeError}
        health={bridgeHealth}
        memoryStatus={bridgeMemoryStatus}
        plans={bridgePlans}
        jobs={bridgeJobs}
        workflows={bridgeWorkflows}
        mutationPlanId={remoteMutationPlanId}
        mutationWorkflowId={remoteMutationWorkflowId}
        onRefresh={() => {
          void refreshBridge({ quiet: true });
        }}
        onApprovePlan={(planId) => {
          void runRemotePlanAction(planId, approvePlanAsync);
        }}
        onRejectPlan={(planId) => {
          void runRemotePlanAction(planId, (targetPlanId) =>
            rejectPlan(targetPlanId, "Rejected from NovaRemote mobile panel")
          );
        }}
        onRetryPlan={(planId) => {
          void runRemotePlanAction(planId, retryFailedPlanAsync);
        }}
        onUndoPlan={(planId) => {
          void runRemotePlanAction(planId, undoPlan);
        }}
        onResumeWorkflow={(workflowId) => {
          void runRemoteWorkflowAction(workflowId, resumeWorkflow);
        }}
      />

      {showRemoteCreateControls ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Create on Server</Text>
          <Text style={styles.serverSubtitle}>Start a persistent workflow or queue an approval plan directly on NovaAdapt.</Text>
          <TextInput
            style={styles.input}
            value={newAgentName}
            onChangeText={setNewAgentName}
            placeholder="Objective (example: Watch cluster load and notify me)"
            placeholderTextColor="#7f7aa8"
          />
          <TextInput
            style={styles.input}
            value={newAgentCapabilities}
            onChangeText={setNewAgentCapabilities}
            placeholder="Metadata tags (comma separated)"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
          />
          <View style={styles.actionsWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create server approval plan"
              style={[styles.buttonPrimary, !newAgentName.trim() ? styles.buttonDisabled : null]}
              disabled={!newAgentName.trim()}
              onPress={() => {
                void createRemotePlan();
              }}
            >
              <Text style={styles.buttonPrimaryText}>Create Approval Plan</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Start server workflow"
              style={[styles.actionButton, !newAgentName.trim() ? styles.buttonDisabled : null]}
              disabled={!newAgentName.trim()}
              onPress={() => {
                void startRemoteWorkflow();
              }}
            >
              <Text style={styles.actionButtonText}>Start Workflow</Text>
            </Pressable>
          </View>
          {remoteCreateStatus ? <Text style={styles.emptyText}>{remoteCreateStatus}</Text> : null}
        </View>
      ) : null}

      {surface === "panel" && (!bridgeSupported || !bridgeRuntimeAvailable) && typeof onOpenAgents === "function" ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Need Local Controls?</Text>
          <Text style={styles.serverSubtitle}>
            Open the dedicated Agents screen to use the remaining local fallback tools while this server runtime is unavailable.
          </Text>
          <View style={styles.actionsWrap}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open Agents screen"
              style={styles.buttonPrimary}
              onPress={onOpenAgents}
            >
              <Text style={styles.buttonPrimaryText}>Open Agents</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {showLocalPreview ? (
        <LocalPreviewSection
          serverId={serverId}
          sessions={sessions}
          isPro={isPro}
          surface={surface}
          newAgentName={newAgentName}
          newAgentCapabilities={newAgentCapabilities}
          defaultSession={defaultSession}
          onShowPaywall={onShowPaywall}
          onQueueCommand={onQueueCommand}
          onNewAgentNameChange={setNewAgentName}
          onNewAgentCapabilitiesChange={setNewAgentCapabilities}
          onAgentCreated={() => {
            setNewAgentName("");
          }}
        />
      ) : null}
    </View>
  );
}

function LocalPreviewSection({
  serverId,
  sessions,
  isPro,
  surface,
  newAgentName,
  newAgentCapabilities,
  defaultSession,
  onShowPaywall,
  onQueueCommand,
  onNewAgentNameChange,
  onNewAgentCapabilitiesChange,
  onAgentCreated,
}: {
  serverId: string;
  sessions: string[];
  isPro: boolean;
  surface: "preview" | "panel" | "screen";
  newAgentName: string;
  newAgentCapabilities: string;
  defaultSession: string | null;
  onShowPaywall: () => void;
  onQueueCommand: (session: string, command: string) => void;
  onNewAgentNameChange: (value: string) => void;
  onNewAgentCapabilitiesChange: (value: string) => void;
  onAgentCreated: () => void;
}) {
  const resolveDefaultSession = useCallback(() => sessions[0] || null, [sessions]);
  const {
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
    approveReadyApprovals,
    denyAllPendingApprovals,
    runMonitoringCycle,
    clearAgentMemory,
    spineContexts,
    findSpineContextByAgentId,
    pendingSpineApprovals,
  } = useNovaAgentRuntime({
    serverId,
    onDispatchCommand: onQueueCommand,
    resolveDefaultSession,
  });

  const [commandByAgent, setCommandByAgent] = useState<Record<string, string>>({});
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [capabilityDrafts, setCapabilityDrafts] = useState<Record<string, string>>({});
  const [sessionByAgent, setSessionByAgent] = useState<Record<string, string>>({});
  const [monitoringCycleStatus, setMonitoringCycleStatus] = useState<string>("");

  const canAddAgent = isPro || agents.length < 1;
  const pendingAgents = useMemo(() => agents.filter((agent) => agent.pendingApproval !== null), [agents]);
  const monitoringAgents = useMemo(() => agents.filter((agent) => agent.status === "monitoring"), [agents]);

  const addNewAgent = () => {
    if (!canAddAgent) {
      onShowPaywall();
      return;
    }
    const capabilities = parseCapabilities(newAgentCapabilities);
    const created = addRuntimeAgent(newAgentName, capabilities);
    if (!created) {
      return;
    }
    setGoalDrafts((prev) => ({ ...prev, [created.agentId]: created.currentGoal }));
    setCapabilityDrafts((prev) => ({ ...prev, [created.agentId]: created.capabilities.join(",") }));
    if (defaultSession) {
      setSessionByAgent((prev) => ({ ...prev, [created.agentId]: defaultSession }));
    }
    onAgentCreated();
  };

  const approveReadyPending = () => {
    const approvedAgentIds = approveReadyApprovals({
      commandByAgent,
      sessionByAgent,
      defaultSession,
    });
    if (approvedAgentIds.length === 0) {
      return;
    }
    setCommandByAgent((previous) => {
      const next = { ...previous };
      approvedAgentIds.forEach((agentId) => {
        next[agentId] = "";
      });
      return next;
    });
  };

  const denyAllPending = () => {
    denyAllPendingApprovals();
  };

  const runMonitoringNow = () => {
    const cycle = runMonitoringCycle({ defaultSession: defaultSession || undefined });
    if (cycle.requested.length === 0 && cycle.approved.length === 0) {
      setMonitoringCycleStatus("No monitoring updates queued.");
      return;
    }
    setMonitoringCycleStatus(`Queued ${cycle.requested.length} • dispatched ${cycle.approved.length}`);
  };

  return (
    <>
      <TextInput
        style={styles.input}
        value={newAgentName}
        onChangeText={onNewAgentNameChange}
        placeholder="Agent name (example: Build Watcher)"
        placeholderTextColor="#7f7aa8"
      />
      <TextInput
        style={styles.input}
        value={newAgentCapabilities}
        onChangeText={onNewAgentCapabilitiesChange}
        placeholder="Capabilities (comma separated)"
        placeholderTextColor="#7f7aa8"
        autoCapitalize="none"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Add NovaAdapt agent"
        style={[styles.buttonPrimary, (!newAgentName.trim() || !canAddAgent) ? styles.buttonDisabled : null]}
        disabled={!newAgentName.trim()}
        onPress={addNewAgent}
      >
        <Text style={styles.buttonPrimaryText}>{canAddAgent ? "Add Agent" : "Unlock More Agents"}</Text>
      </Pressable>
      {!canAddAgent ? (
        <Text style={styles.emptyText}>Free tier supports one agent per server. Upgrade to add more.</Text>
      ) : null}
      {surface === "screen" ? (
        <Text style={styles.emptyText}>Server runtime unavailable. Local preview fallback is active on this screen.</Text>
      ) : null}

      <View style={styles.actionsWrap}>
        <Text style={styles.serverSubtitle}>{`Pending approvals: ${pendingAgents.length} • NovaSpine ${pendingSpineApprovals}`}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Run monitoring cycle now"
          style={[styles.actionButton, monitoringAgents.length === 0 ? styles.buttonDisabled : null]}
          disabled={monitoringAgents.length === 0}
          onPress={runMonitoringNow}
        >
          <Text style={styles.actionButtonText}>Run Monitoring</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Approve pending agents with ready command and session routes"
          style={[styles.actionButton, pendingAgents.length === 0 ? styles.buttonDisabled : null]}
          disabled={pendingAgents.length === 0}
          onPress={approveReadyPending}
        >
          <Text style={styles.actionButtonText}>Approve Ready</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Deny all pending agent approvals"
          style={[styles.actionDangerButton, pendingAgents.length === 0 ? styles.buttonDisabled : null]}
          disabled={pendingAgents.length === 0}
          onPress={denyAllPending}
        >
          <Text style={styles.actionDangerText}>Deny All</Text>
        </Pressable>
      </View>
      {monitoringCycleStatus ? <Text style={styles.emptyText}>{monitoringCycleStatus}</Text> : null}

      {loading || memoryLoading ? <Text style={styles.emptyText}>Loading agents...</Text> : null}
      {!loading && !memoryLoading && agents.length === 0 ? <Text style={styles.emptyText}>No agents yet on this server.</Text> : null}
      {!loading && !memoryLoading && spineContexts.length > 0 ? (
        <Text style={styles.emptyText}>{`Contexts: ${spineContexts.length}`}</Text>
      ) : null}

      {agents.map((agent) => {
        const draftGoal = goalDrafts[agent.agentId] ?? agent.currentGoal;
        const draftCapabilities = capabilityDrafts[agent.agentId] ?? agent.capabilities.join(",");
        const selectedSession = sessionByAgent[agent.agentId] || agent.pendingApproval?.session || defaultSession;
        const command = commandByAgent[agent.agentId] || "";
        const agentMemory = memoryEntries.filter((entry) => entry.memoryContextId === agent.memoryContextId);
        const spineContext = findSpineContextByAgentId(agent.agentId);

        return (
          <AgentCard
            key={agent.agentId}
            agent={agent}
            sessions={sessions}
            command={command}
            goalDraft={draftGoal}
            capabilitiesDraft={draftCapabilities}
            memoryEntries={agentMemory}
            spineContext={spineContext}
            selectedSession={selectedSession}
            onCommandChange={(value) => setCommandByAgent((prev) => ({ ...prev, [agent.agentId]: value }))}
            onGoalChange={(value) => setGoalDrafts((prev) => ({ ...prev, [agent.agentId]: value }))}
            onGoalBlur={() => {
              setRuntimeAgentGoal(agent.agentId, draftGoal);
            }}
            onCapabilitiesChange={(value) => setCapabilityDrafts((prev) => ({ ...prev, [agent.agentId]: value }))}
            onCapabilitiesBlur={() => setRuntimeAgentCapabilities(agent.agentId, parseCapabilities(draftCapabilities))}
            onSelectSession={(value) => setSessionByAgent((prev) => ({ ...prev, [agent.agentId]: value }))}
            onSetStatus={(status) => setRuntimeAgentStatus(agent.agentId, status)}
            onRequestApproval={() => {
              if (!selectedSession || !command.trim()) {
                return;
              }
              requestAgentApproval(agent.agentId, {
                summary: `${agent.name} requests command approval`,
                command,
                session: selectedSession,
              });
            }}
            onApprove={() => {
              const approved = approveAgentApproval(agent.agentId, {
                commandOverride: command.trim() ? command : undefined,
                sessionOverride: selectedSession || undefined,
                nextStatus: "executing",
              });
              if (approved) {
                setCommandByAgent((prev) => ({ ...prev, [agent.agentId]: "" }));
              }
            }}
            onDeny={() => {
              denyAgentApproval(agent.agentId);
            }}
            onRemove={() => {
              removeRuntimeAgent(agent.agentId);
            }}
            onClearMemory={() => {
              clearAgentMemory(agent.agentId);
            }}
          />
        );
      })}
    </>
  );
}
