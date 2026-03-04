import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { useNovaAgents } from "../hooks/useNovaAgents";
import { NovaAgent, NovaAgentStatus } from "../types";
import { styles } from "../theme/styles";

type NovaAgentPanelProps = {
  serverId: string | null;
  serverName: string | null;
  sessions: string[];
  isPro: boolean;
  onShowPaywall: () => void;
  onQueueCommand: (session: string, command: string) => void;
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

function AgentCard({
  agent,
  sessions,
  command,
  goalDraft,
  capabilitiesDraft,
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
}: {
  agent: NovaAgent;
  sessions: string[];
  command: string;
  goalDraft: string;
  capabilitiesDraft: string;
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
}) {
  return (
    <View style={styles.terminalCard}>
      <View style={styles.terminalNameRow}>
        <Text style={styles.terminalName}>{agent.name}</Text>
        <Text style={[styles.modePill, styles.modePillShell]}>{statusLabel(agent.status)}</Text>
      </View>
      <Text style={styles.serverSubtitle}>{`Memory ${agent.memoryContextId}`}</Text>

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
    </View>
  );
}

export function NovaAgentPanel({
  serverId,
  serverName,
  sessions,
  isPro,
  onShowPaywall,
  onQueueCommand,
}: NovaAgentPanelProps) {
  const { agents, loading, addAgent, removeAgent, requestApproval, resolveApproval, setAgentCapabilities, setAgentGoal, setAgentStatus } =
    useNovaAgents({ serverId });

  const [newAgentName, setNewAgentName] = useState<string>("");
  const [newAgentCapabilities, setNewAgentCapabilities] = useState<string>("watch,tool-calling");
  const [commandByAgent, setCommandByAgent] = useState<Record<string, string>>({});
  const [goalDrafts, setGoalDrafts] = useState<Record<string, string>>({});
  const [capabilityDrafts, setCapabilityDrafts] = useState<Record<string, string>>({});
  const [sessionByAgent, setSessionByAgent] = useState<Record<string, string>>({});

  const canAddAgent = isPro || agents.length < 1;

  const defaultSession = useMemo(() => sessions[0] || null, [sessions]);

  const addNewAgent = () => {
    if (!canAddAgent) {
      onShowPaywall();
      return;
    }
    const capabilities = parseCapabilities(newAgentCapabilities);
    const created = addAgent(newAgentName, capabilities);
    if (!created) {
      return;
    }
    setGoalDrafts((prev) => ({ ...prev, [created.agentId]: created.currentGoal }));
    setCapabilityDrafts((prev) => ({ ...prev, [created.agentId]: created.capabilities.join(",") }));
    if (defaultSession) {
      setSessionByAgent((prev) => ({ ...prev, [created.agentId]: defaultSession }));
    }
    setNewAgentName("");
  };

  if (!serverId) {
    return (
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>NovaAdapt Agents (Preview)</Text>
        <Text style={styles.emptyText}>Select a server to manage agents.</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>NovaAdapt Agents (Preview)</Text>
      <Text style={styles.serverSubtitle}>{`${serverName || "Server"} • Agent lifecycle + approval queue groundwork`}</Text>

      <TextInput
        style={styles.input}
        value={newAgentName}
        onChangeText={setNewAgentName}
        placeholder="Agent name (example: Build Watcher)"
        placeholderTextColor="#7f7aa8"
      />
      <TextInput
        style={styles.input}
        value={newAgentCapabilities}
        onChangeText={setNewAgentCapabilities}
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

      {loading ? <Text style={styles.emptyText}>Loading agents...</Text> : null}
      {!loading && agents.length === 0 ? <Text style={styles.emptyText}>No agents yet on this server.</Text> : null}

      {agents.map((agent) => {
        const draftGoal = goalDrafts[agent.agentId] ?? agent.currentGoal;
        const draftCapabilities = capabilityDrafts[agent.agentId] ?? agent.capabilities.join(",");
        const selectedSession = sessionByAgent[agent.agentId] || agent.pendingApproval?.session || defaultSession;
        const command = commandByAgent[agent.agentId] || "";

        return (
          <AgentCard
            key={agent.agentId}
            agent={agent}
            sessions={sessions}
            command={command}
            goalDraft={draftGoal}
            capabilitiesDraft={draftCapabilities}
            selectedSession={selectedSession}
            onCommandChange={(value) => setCommandByAgent((prev) => ({ ...prev, [agent.agentId]: value }))}
            onGoalChange={(value) => setGoalDrafts((prev) => ({ ...prev, [agent.agentId]: value }))}
            onGoalBlur={() => setAgentGoal(agent.agentId, draftGoal)}
            onCapabilitiesChange={(value) => setCapabilityDrafts((prev) => ({ ...prev, [agent.agentId]: value }))}
            onCapabilitiesBlur={() => setAgentCapabilities(agent.agentId, parseCapabilities(draftCapabilities))}
            onSelectSession={(value) => setSessionByAgent((prev) => ({ ...prev, [agent.agentId]: value }))}
            onSetStatus={(status) => setAgentStatus(agent.agentId, status)}
            onRequestApproval={() => {
              if (!selectedSession || !command.trim()) {
                return;
              }
              requestApproval(agent.agentId, {
                summary: `${agent.name} requests command approval`,
                command,
                session: selectedSession,
              });
            }}
            onApprove={() => {
              const pendingCommand = agent.pendingApproval?.command || command;
              const targetSession = agent.pendingApproval?.session || selectedSession;
              if (!targetSession || !pendingCommand.trim()) {
                return;
              }
              setAgentGoal(agent.agentId, pendingCommand);
              onQueueCommand(targetSession, pendingCommand);
              resolveApproval(agent.agentId, true, { nextStatus: "executing" });
              setCommandByAgent((prev) => ({ ...prev, [agent.agentId]: "" }));
            }}
            onDeny={() => {
              resolveApproval(agent.agentId, false, { nextStatus: "idle" });
            }}
            onRemove={() => removeAgent(agent.agentId)}
          />
        );
      })}
    </View>
  );
}
