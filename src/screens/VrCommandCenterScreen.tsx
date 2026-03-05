import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useAppContext } from "../context/AppContext";
import { resolveGlassesScopeRoute } from "../glassesScopeRouting";
import { useSharedWorkspaces } from "../hooks/useSharedWorkspaces";
import { useVoiceChannels } from "../hooks/useVoiceChannels";
import { styles } from "../theme/styles";
import { VrLayoutPreset } from "../vr/contracts";
import { useVrLiveRuntime } from "../vr/useVrLiveRuntime";
import { buildVrPanelId } from "../vr/useVrWorkspace";
import { getWorkspacePermissions } from "../workspacePermissions";

const VR_PRESETS: VrLayoutPreset[] = ["arc", "grid", "stacked", "cockpit", "custom"];

function transformLabel(panel: {
  transform: {
    x: number;
    y: number;
    z: number;
    yaw: number;
  };
}): string {
  const x = panel.transform.x.toFixed(2);
  const y = panel.transform.y.toFixed(2);
  const z = panel.transform.z.toFixed(2);
  const yaw = panel.transform.yaw.toFixed(1);
  return `x ${x} • y ${y} • z ${z} • yaw ${yaw}`;
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function VrCommandCenterScreen() {
  const {
    connections,
    focusedServerId,
    onReconnectServer,
    onReconnectServers,
    onShareServerSessionLive,
    onCreateAgentForServers,
    onRemoveAgentForServers,
    onSetAgentStatusForServers,
    onSetAgentGoalForServers,
    onQueueAgentCommandForServers,
    onApproveReadyAgentsForServers,
    onDenyAllPendingAgentsForServers,
    onConnectAllServers,
    onDisconnectAllServers,
  } = useAppContext().terminals;
  const [voiceInput, setVoiceInput] = useState<string>("");
  const [voiceStatus, setVoiceStatus] = useState<string | null>(null);
  const [commandInput, setCommandInput] = useState<string>("");
  const [activeVmHostScope, setActiveVmHostScope] = useState<string | null>(null);
  const [agentScope, setAgentScope] = useState<"focused" | "visible" | "all">("visible");
  const [agentNameInput, setAgentNameInput] = useState<string>("");
  const [agentGoalInput, setAgentGoalInput] = useState<string>("");
  const [agentCommandInput, setAgentCommandInput] = useState<string>("");
  const [agentLifecycleStatus, setAgentLifecycleStatus] = useState<"idle" | "monitoring" | "executing" | "waiting_approval">(
    "monitoring"
  );
  const [agentStatusMessage, setAgentStatusMessage] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const { workspaces: sharedWorkspaces } = useSharedWorkspaces();
  const [newChannelNamesByWorkspace, setNewChannelNamesByWorkspace] = useState<Record<string, string>>({});
  const {
    channels: voiceChannels,
    loading: voiceChannelsLoading,
    createChannel,
    deleteChannel,
    joinChannel,
    leaveChannel,
    toggleMute,
  } = useVoiceChannels();
  const vmHostScopeOptions = useMemo(() => {
    const labels = new Map<string, string>();
    let hasUnassigned = false;
    connections.forEach((connection) => {
      const host = (connection.server.vmHost || "").trim();
      if (!host) {
        hasUnassigned = true;
        return;
      }
      labels.set(host.toLowerCase(), host);
    });
    const options = Array.from(labels.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (hasUnassigned) {
      options.push({ key: "__none__", label: "Standalone" });
    }
    return options;
  }, [connections]);
  const matchesVmHostScope = useCallback(
    (serverId: string) => {
      if (!activeVmHostScope) {
        return true;
      }
      const connection = connections.get(serverId);
      const host = (connection?.server.vmHost || "").trim().toLowerCase();
      if (activeVmHostScope === "__none__") {
        return !host;
      }
      return host === activeVmHostScope;
    },
    [activeVmHostScope, connections]
  );
  const workspaceScope = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    const workspace = sharedWorkspaces.find((entry) => entry.id === activeWorkspaceId);
    if (!workspace) {
      return null;
    }
    return {
      id: workspace.id,
      name: workspace.name,
      serverIds: new Set(workspace.serverIds),
    };
  }, [activeWorkspaceId, sharedWorkspaces]);
  const scopedAutoSyncPanelIds = useMemo(() => {
    const next: string[] = [];
    connections.forEach((connection, serverId) => {
      if (!matchesVmHostScope(serverId)) {
        return;
      }
      if (workspaceScope && !workspaceScope.serverIds.has(serverId)) {
        return;
      }
      connection.openSessions.forEach((session) => {
        next.push(buildVrPanelId(serverId, session));
      });
    });
    return next;
  }, [connections, matchesVmHostScope, workspaceScope]);
  const runtime = useVrLiveRuntime({
    connections,
    maxPanels: 12,
    autoSyncWorkspacePanelStreams: true,
    autoSyncWorkspacePanelIds: scopedAutoSyncPanelIds,
    pauseWorkspaceStreamsOnAppBackground: true,
    onReconnectServer,
    onReconnectServers,
    onCreateAgent: onCreateAgentForServers,
    onRemoveAgent: onRemoveAgentForServers,
    onSetAgentStatus: onSetAgentStatusForServers,
    onSetAgentGoal: onSetAgentGoalForServers,
    onQueueAgentCommand: onQueueAgentCommandForServers,
    onApproveReadyAgents: onApproveReadyAgentsForServers,
    onDenyAllPendingAgents: onDenyAllPendingAgentsForServers,
    onConnectAllServers,
    onDisconnectAllServers,
    onShareLive: onShareServerSessionLive,
  });
  const focusedPanel = useMemo(
    () => runtime.workspace.panels.find((panel) => panel.id === runtime.workspace.focusedPanelId) || null,
    [runtime.workspace.focusedPanelId, runtime.workspace.panels]
  );
  const visiblePanels = useMemo(() => {
    return runtime.workspace.panels.filter((panel) => {
      if (!matchesVmHostScope(panel.serverId)) {
        return false;
      }
      if (!workspaceScope) {
        return true;
      }
      return workspaceScope.serverIds.has(panel.serverId);
    });
  }, [matchesVmHostScope, runtime.workspace.panels, workspaceScope]);
  const availablePanels = useMemo(() => {
    const visible = new Set(runtime.workspace.panels.map((panel) => panel.id));
    const next: Array<{ id: string; serverId: string; session: string; label: string }> = [];
    connections.forEach((connection, serverId) => {
      if (!matchesVmHostScope(serverId)) {
        return;
      }
      if (workspaceScope && !workspaceScope.serverIds.has(serverId)) {
        return;
      }
      connection.openSessions.forEach((session) => {
        const id = buildVrPanelId(serverId, session);
        if (visible.has(id)) {
          return;
        }
        next.push({
          id,
          serverId,
          session,
          label: `${connection.server.name} · ${session}`,
        });
      });
    });
    return next;
  }, [connections, matchesVmHostScope, runtime.workspace.panels, workspaceScope]);
  const voiceChannelsByWorkspace = useMemo(() => {
    const grouped = new Map<string, typeof voiceChannels>();
    voiceChannels.forEach((channel) => {
      const current = grouped.get(channel.workspaceId);
      if (current) {
        current.push(channel);
      } else {
        grouped.set(channel.workspaceId, [channel]);
      }
    });
    return grouped;
  }, [voiceChannels]);
  const workspaceById = useMemo(() => {
    return new Map(sharedWorkspaces.map((workspace) => [workspace.id, workspace]));
  }, [sharedWorkspaces]);
  const [snapshot, setSnapshot] = useState(() => runtime.getStreamPoolSnapshot());

  useEffect(() => {
    setSnapshot(runtime.getStreamPoolSnapshot());
    const timer = setInterval(() => {
      setSnapshot(runtime.getStreamPoolSnapshot());
    }, 1000);
    return () => {
      clearInterval(timer);
    };
  }, [runtime.getStreamPoolSnapshot]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    if (!sharedWorkspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      setActiveWorkspaceId(null);
    }
  }, [activeWorkspaceId, sharedWorkspaces]);

  useEffect(() => {
    if (!activeVmHostScope) {
      return;
    }
    if (!vmHostScopeOptions.some((option) => option.key === activeVmHostScope)) {
      setActiveVmHostScope(null);
    }
  }, [activeVmHostScope, vmHostScopeOptions]);

  const agentTargetServerIds = useMemo(() => {
    if (agentScope === "all") {
      return Array.from(connections.keys());
    }
    if (agentScope === "focused") {
      if (focusedPanel?.serverId) {
        return [focusedPanel.serverId];
      }
      if (focusedServerId) {
        return [focusedServerId];
      }
      return [];
    }
    return Array.from(new Set(visiblePanels.map((panel) => panel.serverId)));
  }, [agentScope, connections, focusedPanel?.serverId, focusedServerId, visiblePanels]);

  const sendVoiceInput = useCallback(() => {
    const transcript = voiceInput.trim();
    if (!transcript) {
      return;
    }
    const scopeRoute = resolveGlassesScopeRoute({
      transcript,
      workspaces: sharedWorkspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
      vmHostScopeOptions,
    });
    if (scopeRoute.kind === "set_workspace_scope") {
      setActiveWorkspaceId(scopeRoute.workspaceId);
      const label = scopeRoute.workspaceId ? workspaceById.get(scopeRoute.workspaceId)?.name || "selected workspace" : "all servers";
      setVoiceStatus(`Scoped workspace to ${label}.`);
      setVoiceInput("");
      return;
    }
    if (scopeRoute.kind === "set_vm_host_scope") {
      setActiveVmHostScope(scopeRoute.vmHostScope);
      const label = scopeRoute.vmHostScope
        ? vmHostScopeOptions.find((option) => option.key === scopeRoute.vmHostScope)?.label || scopeRoute.vmHostScope
        : "all hosts";
      setVoiceStatus(`Scoped VM host to ${label}.`);
      setVoiceInput("");
      return;
    }

    const manageChannelMatch = transcript.match(
      /^(create|add|delete|remove)\s+(?:vr\s+)?(?:voice\s+)?channel\s+(.+?)(?:\s+in\s+(.+))?$/i
    );
    if (manageChannelMatch) {
      const action = (manageChannelMatch[1] || "").toLowerCase();
      const channelName = (manageChannelMatch[2] || "").trim();
      const requestedWorkspaceLabel = normalizeToken(manageChannelMatch[3] || "");
      const requestedWorkspace =
        requestedWorkspaceLabel.length > 0
          ? sharedWorkspaces.find((workspace) => {
              const normalizedName = normalizeToken(workspace.name);
              return (
                normalizedName === requestedWorkspaceLabel ||
                normalizedName.includes(requestedWorkspaceLabel) ||
                requestedWorkspaceLabel.includes(normalizedName)
              );
            }) || null
          : null;
      const targetWorkspace =
        requestedWorkspace ||
        (activeWorkspaceId ? workspaceById.get(activeWorkspaceId) || null : null) ||
        (sharedWorkspaces.length === 1 ? sharedWorkspaces[0] : null);
      if (!targetWorkspace) {
        setVoiceStatus(
          sharedWorkspaces.length > 1
            ? "Specify a workspace or scope to one workspace before channel management."
            : "No workspace available for channel management."
        );
        setVoiceInput("");
        return;
      }

      const permissions = getWorkspacePermissions(targetWorkspace);
      if (!permissions.canManageChannels) {
        setVoiceStatus(`Channel management is blocked for ${targetWorkspace.name}.`);
        setVoiceInput("");
        return;
      }

      if (action === "create" || action === "add") {
        const existing = voiceChannels.find(
          (channel) =>
            channel.workspaceId === targetWorkspace.id &&
            normalizeToken(channel.name) === normalizeToken(channelName)
        );
        if (existing) {
          setVoiceStatus(`#${existing.name} already exists in ${targetWorkspace.name}.`);
          setVoiceInput("");
          return;
        }
        createChannel({
          workspaceId: targetWorkspace.id,
          name: channelName,
        });
        setVoiceStatus(`Created #${channelName} in ${targetWorkspace.name}`);
        setVoiceInput("");
        return;
      }

      const channelToDelete = voiceChannels.find(
        (channel) =>
          channel.workspaceId === targetWorkspace.id &&
          (normalizeToken(channel.name) === normalizeToken(channelName) ||
            normalizeToken(channel.name).includes(normalizeToken(channelName)) ||
            normalizeToken(channelName).includes(normalizeToken(channel.name)))
      );
      if (!channelToDelete) {
        setVoiceStatus(`No channel named "${channelName}" found in ${targetWorkspace.name}.`);
        setVoiceInput("");
        return;
      }
      deleteChannel(channelToDelete.id);
      setVoiceStatus(`Deleted #${channelToDelete.name} from ${targetWorkspace.name}`);
      setVoiceInput("");
      return;
    }

    const channelMatch = transcript.match(/^(join|leave|mute|unmute)\s+(?:vr\s+)?(?:voice\s+)?channel(?:\s+(.+))?$/i);
    if (channelMatch) {
      const action = (channelMatch[1] || "").toLowerCase();
      const targetName = normalizeToken(channelMatch[2] || "");
      const scopedChannels = activeWorkspaceId
        ? voiceChannels.filter((channel) => channel.workspaceId === activeWorkspaceId)
        : voiceChannels;
      const candidates = scopedChannels.length > 0 ? scopedChannels : voiceChannels;
      const joinedChannels = candidates.filter((channel) => channel.joined);
      const resolveChannel = () => {
        if (targetName) {
          const exact = candidates.find((channel) => normalizeToken(channel.name) === targetName);
          if (exact) {
            return exact;
          }
          return (
            candidates.find((channel) => normalizeToken(channel.name).includes(targetName)) ||
            candidates.find((channel) => targetName.includes(normalizeToken(channel.name))) ||
            null
          );
        }
        if (action === "join") {
          return candidates[0] || null;
        }
        return joinedChannels[0] || null;
      };

      const target = resolveChannel();
      if (!target) {
        setVoiceStatus(targetName ? `No channel found for "${targetName}".` : "No matching channel available.");
        setVoiceInput("");
        return;
      }
      const workspace = workspaceById.get(target.workspaceId);
      if (workspace && !getWorkspacePermissions(workspace).canJoinChannels) {
        setVoiceStatus(`Channel access blocked for ${workspace.name}.`);
        setVoiceInput("");
        return;
      }

      if (action === "join") {
        joinChannel(target.id);
        setVoiceStatus(`Joined #${target.name}`);
      } else if (action === "leave") {
        leaveChannel(target.id);
        setVoiceStatus(`Left #${target.name}`);
      } else if (action === "mute") {
        if (!target.muted) {
          toggleMute(target.id);
        }
        setVoiceStatus(`Muted #${target.name}`);
      } else if (action === "unmute") {
        if (target.muted) {
          toggleMute(target.id);
        }
        setVoiceStatus(`Unmuted #${target.name}`);
      }
      setVoiceInput("");
      return;
    }

    setVoiceStatus(null);
    void runtime.dispatchVoice(transcript, {
      targetPanelId: runtime.workspace.focusedPanelId,
    });
    setVoiceInput("");
  }, [
    activeWorkspaceId,
    createChannel,
    deleteChannel,
    joinChannel,
    leaveChannel,
    runtime,
    sharedWorkspaces,
    toggleMute,
    voiceChannels,
    voiceInput,
    vmHostScopeOptions,
    workspaceById,
  ]);

  const sendFocusedCommand = useCallback(() => {
    const command = commandInput.trim();
    if (!command || !focusedPanel) {
      return;
    }
    void runtime.dispatchVoice(command, {
      targetPanelId: focusedPanel.id,
    });
    setCommandInput("");
  }, [commandInput, focusedPanel, runtime]);

  const runAgentAction = useCallback(
    async (
      label: string,
      fn: (serverIds: string[]) => Promise<string[]>
    ) => {
      if (agentTargetServerIds.length === 0) {
        setAgentStatusMessage("No target servers selected for agent action.");
        return;
      }
      try {
        const changed = await fn(agentTargetServerIds);
        const count = Array.isArray(changed) ? changed.length : 0;
        setAgentStatusMessage(`${label} on ${agentTargetServerIds.length} server(s)${count ? ` • affected ${count}` : ""}.`);
      } catch (error) {
        setAgentStatusMessage(error instanceof Error ? error.message : String(error));
      }
    },
    [agentTargetServerIds]
  );

  const setWorkspaceChannelDraft = useCallback((workspaceId: string, value: string) => {
    setNewChannelNamesByWorkspace((previous) => ({
      ...previous,
      [workspaceId]: value,
    }));
  }, []);

  const clearWorkspaceChannelDraft = useCallback((workspaceId: string) => {
    setNewChannelNamesByWorkspace((previous) => {
      if (!(workspaceId in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[workspaceId];
      return next;
    });
  }, []);

  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>VR Command Center (Preview)</Text>
      <Text style={styles.serverSubtitle}>
        {`Focused server ${focusedServerId || "none"} • Panels ${visiblePanels.length}/${runtime.workspace.panels.length} • Preset ${runtime.workspace.preset}`}
      </Text>

      <View style={styles.vrRuntimeStatsRow}>
        <Text style={[styles.livePill, snapshot.paused ? styles.livePillWarn : styles.livePillOn]}>
          {snapshot.paused ? "PAUSED" : "LIVE"}
        </Text>
        <Text style={styles.livePill}>{`Tracked ${snapshot.tracked}`}</Text>
        <Text style={styles.livePill}>{`Active ${snapshot.active}`}</Text>
        <Text style={styles.livePill}>{`Managed ${snapshot.managed}`}</Text>
      </View>

      <View style={styles.vrRuntimeActionRow}>
        {VR_PRESETS.map((preset) => (
          <Pressable
            key={`vr-preset-${preset}`}
            accessibilityRole="button"
            accessibilityLabel={`Set VR layout preset to ${preset}`}
            style={[styles.chip, runtime.workspace.preset === preset ? styles.chipActive : null]}
            onPress={() => runtime.workspace.setPreset(preset)}
          >
            <Text style={[styles.chipText, runtime.workspace.preset === preset ? styles.chipTextActive : null]}>
              {preset.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.vrRuntimeInputCard}>
        <Text style={styles.serverSubtitle}>Workspace scope</Text>
        <View style={styles.vrRuntimeActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show VR panels for all servers"
            style={[styles.chip, activeWorkspaceId === null ? styles.chipActive : null]}
            onPress={() => setActiveWorkspaceId(null)}
          >
            <Text style={[styles.chipText, activeWorkspaceId === null ? styles.chipTextActive : null]}>All servers</Text>
          </Pressable>
          {sharedWorkspaces.map((workspace) => (
            <Pressable
              key={`vr-scope-${workspace.id}`}
              accessibilityRole="button"
              accessibilityLabel={`Scope VR panels to workspace ${workspace.name}`}
              style={[styles.chip, activeWorkspaceId === workspace.id ? styles.chipActive : null]}
              onPress={() => setActiveWorkspaceId(workspace.id)}
            >
              <Text style={[styles.chipText, activeWorkspaceId === workspace.id ? styles.chipTextActive : null]}>
                {workspace.name}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.vrRuntimeInputCard}>
        <Text style={styles.serverSubtitle}>VM host scope</Text>
        <View style={styles.vrRuntimeActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show VR panels for all VM hosts"
            style={[styles.chip, activeVmHostScope === null ? styles.chipActive : null]}
            onPress={() => setActiveVmHostScope(null)}
          >
            <Text style={[styles.chipText, activeVmHostScope === null ? styles.chipTextActive : null]}>All hosts</Text>
          </Pressable>
          {vmHostScopeOptions.map((option) => (
            <Pressable
              key={`vr-vmhost-${option.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Scope VR panels to VM host ${option.label}`}
              style={[styles.chip, activeVmHostScope === option.key ? styles.chipActive : null]}
              onPress={() => setActiveVmHostScope(option.key)}
            >
              <Text style={[styles.chipText, activeVmHostScope === option.key ? styles.chipTextActive : null]}>
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.vrRuntimeInputCard}>
        <Text style={styles.serverSubtitle}>NovaAdapt agent controls</Text>
        <Text style={styles.emptyText}>{`Targets ${agentTargetServerIds.length} server(s)`}</Text>
        <View style={styles.vrRuntimeActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Target focused server for VR agent actions"
            style={[styles.chip, agentScope === "focused" ? styles.chipActive : null]}
            onPress={() => setAgentScope("focused")}
          >
            <Text style={[styles.chipText, agentScope === "focused" ? styles.chipTextActive : null]}>Focused</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Target visible panel servers for VR agent actions"
            style={[styles.chip, agentScope === "visible" ? styles.chipActive : null]}
            onPress={() => setAgentScope("visible")}
          >
            <Text style={[styles.chipText, agentScope === "visible" ? styles.chipTextActive : null]}>Visible</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Target all servers for VR agent actions"
            style={[styles.chip, agentScope === "all" ? styles.chipActive : null]}
            onPress={() => setAgentScope("all")}
          >
            <Text style={[styles.chipText, agentScope === "all" ? styles.chipTextActive : null]}>All</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="VR agent name"
          value={agentNameInput}
          onChangeText={setAgentNameInput}
          style={styles.input}
          placeholder="Agent name (example: Build Watcher)"
          placeholderTextColor="#7f7aa8"
        />
        <TextInput
          accessibilityLabel="VR agent goal"
          value={agentGoalInput}
          onChangeText={setAgentGoalInput}
          style={styles.input}
          placeholder="Goal (example: keep deploy green)"
          placeholderTextColor="#7f7aa8"
        />
        <TextInput
          accessibilityLabel="VR agent command"
          value={agentCommandInput}
          onChangeText={setAgentCommandInput}
          style={styles.input}
          placeholder="Command (example: npm run deploy)"
          placeholderTextColor="#7f7aa8"
        />
        <View style={styles.chipRow}>
          {[
            { key: "idle", label: "Idle" },
            { key: "monitoring", label: "Monitor" },
            { key: "executing", label: "Execute" },
            { key: "waiting_approval", label: "Wait Approval" },
          ].map((entry) => (
            <Pressable
              key={`vr-agent-status-${entry.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Set VR agent status target ${entry.label}`}
              style={[styles.chip, agentLifecycleStatus === entry.key ? styles.chipActive : null]}
              onPress={() => {
                setAgentLifecycleStatus(entry.key as "idle" | "monitoring" | "executing" | "waiting_approval");
              }}
            >
              <Text style={[styles.chipText, agentLifecycleStatus === entry.key ? styles.chipTextActive : null]}>
                {entry.label}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.vrRuntimeActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Create VR agent"
            style={[
              styles.actionButton,
              !agentNameInput.trim() || agentTargetServerIds.length === 0 ? styles.buttonDisabled : null,
            ]}
            disabled={!agentNameInput.trim() || agentTargetServerIds.length === 0}
            onPress={() => {
              void runAgentAction("Created agent", (serverIds) =>
                onCreateAgentForServers(serverIds, agentNameInput.trim())
              );
            }}
          >
            <Text style={styles.actionButtonText}>Create</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set VR agent goal"
            style={[
              styles.actionButton,
              !agentNameInput.trim() || !agentGoalInput.trim() || agentTargetServerIds.length === 0
                ? styles.buttonDisabled
                : null,
            ]}
            disabled={!agentNameInput.trim() || !agentGoalInput.trim() || agentTargetServerIds.length === 0}
            onPress={() => {
              void runAgentAction("Updated agent goal", (serverIds) =>
                onSetAgentGoalForServers(serverIds, agentNameInput.trim(), agentGoalInput.trim())
              );
            }}
          >
            <Text style={styles.actionButtonText}>Goal</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set VR agent status"
            style={[
              styles.actionButton,
              !agentNameInput.trim() || agentTargetServerIds.length === 0 || !onSetAgentStatusForServers
                ? styles.buttonDisabled
                : null,
            ]}
            disabled={!agentNameInput.trim() || agentTargetServerIds.length === 0 || !onSetAgentStatusForServers}
            onPress={() => {
              if (!onSetAgentStatusForServers) {
                return;
              }
              void runAgentAction("Updated agent status", (serverIds) =>
                onSetAgentStatusForServers(serverIds, agentNameInput.trim(), agentLifecycleStatus)
              );
            }}
          >
            <Text style={styles.actionButtonText}>Status</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove VR agent"
            style={[
              styles.actionButton,
              !agentNameInput.trim() || agentTargetServerIds.length === 0 || !onRemoveAgentForServers
                ? styles.buttonDisabled
                : null,
            ]}
            disabled={!agentNameInput.trim() || agentTargetServerIds.length === 0 || !onRemoveAgentForServers}
            onPress={() => {
              if (!onRemoveAgentForServers) {
                return;
              }
              void runAgentAction("Removed agent", (serverIds) =>
                onRemoveAgentForServers(serverIds, agentNameInput.trim())
              );
            }}
          >
            <Text style={styles.actionButtonText}>Remove</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Queue VR agent command"
            style={[
              styles.actionButton,
              !agentNameInput.trim() || !agentCommandInput.trim() || agentTargetServerIds.length === 0
                ? styles.buttonDisabled
                : null,
            ]}
            disabled={!agentNameInput.trim() || !agentCommandInput.trim() || agentTargetServerIds.length === 0}
            onPress={() => {
              void runAgentAction("Queued agent command", (serverIds) =>
                onQueueAgentCommandForServers(serverIds, agentNameInput.trim(), agentCommandInput.trim())
              );
            }}
          >
            <Text style={styles.actionButtonText}>Queue</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Approve VR ready agents"
            style={[styles.actionButton, agentTargetServerIds.length === 0 ? styles.buttonDisabled : null]}
            disabled={agentTargetServerIds.length === 0}
            onPress={() => {
              void runAgentAction("Approved ready agents", (serverIds) =>
                onApproveReadyAgentsForServers(serverIds)
              );
            }}
          >
            <Text style={styles.actionButtonText}>Approve</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Deny VR pending agents"
            style={[styles.actionButton, agentTargetServerIds.length === 0 ? styles.buttonDisabled : null]}
            disabled={agentTargetServerIds.length === 0}
            onPress={() => {
              void runAgentAction("Denied pending agents", (serverIds) =>
                onDenyAllPendingAgentsForServers(serverIds)
              );
            }}
          >
            <Text style={styles.actionButtonText}>Deny</Text>
          </Pressable>
        </View>
        {agentStatusMessage ? <Text style={styles.emptyText}>{agentStatusMessage}</Text> : null}
      </View>

      <View style={styles.vrRuntimeActionRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rotate workspace left"
          style={styles.actionButton}
          onPress={() => runtime.workspace.rotateWorkspace("left")}
        >
          <Text style={styles.actionButtonText}>Rotate Left</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Rotate workspace right"
          style={styles.actionButton}
          onPress={() => runtime.workspace.rotateWorkspace("right")}
        >
          <Text style={styles.actionButtonText}>Rotate Right</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Toggle overview mode"
          style={styles.actionButton}
          onPress={() => runtime.workspace.setOverviewMode(!runtime.workspace.overviewMode)}
        >
          <Text style={styles.actionButtonText}>{runtime.workspace.overviewMode ? "Focus Mode" : "Overview"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Pause VR stream pool"
          style={styles.actionButton}
          onPress={runtime.pauseServerStreams}
        >
          <Text style={styles.actionButtonText}>Pause Streams</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Resume VR stream pool"
          style={styles.actionButton}
          onPress={runtime.resumeServerStreams}
        >
          <Text style={styles.actionButtonText}>Resume Streams</Text>
        </Pressable>
      </View>

      <View style={styles.vrRuntimeInputCard}>
        <Text style={styles.serverSubtitle}>Voice routing to focused panel</Text>
        <TextInput
          accessibilityLabel="VR voice command"
          value={voiceInput}
          onChangeText={(value) => {
            setVoiceInput(value);
            if (voiceStatus) {
              setVoiceStatus(null);
            }
          }}
          style={styles.input}
          placeholder="Example: send to DGX: npm run build"
          placeholderTextColor="#7f7aa8"
        />
        <View style={styles.vrRuntimeActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Dispatch voice command"
            style={[styles.buttonPrimary, !voiceInput.trim() ? styles.buttonDisabled : null]}
            onPress={sendVoiceInput}
            disabled={!voiceInput.trim()}
          >
            <Text style={styles.buttonPrimaryText}>Dispatch Voice</Text>
          </Pressable>
        </View>
        {voiceStatus ? <Text style={styles.emptyText}>{voiceStatus}</Text> : null}
      </View>

      <View style={styles.vrRuntimeInputCard}>
        <Text style={styles.serverSubtitle}>Direct command to focused panel</Text>
        <TextInput
          accessibilityLabel="VR focused panel command"
          value={commandInput}
          onChangeText={setCommandInput}
          style={styles.input}
          placeholder="Command for focused panel"
          placeholderTextColor="#7f7aa8"
        />
        <View style={styles.vrRuntimeActionRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send command to focused panel"
            style={[styles.buttonPrimary, !commandInput.trim() || !focusedPanel ? styles.buttonDisabled : null]}
            onPress={sendFocusedCommand}
            disabled={!commandInput.trim() || !focusedPanel}
          >
            <Text style={styles.buttonPrimaryText}>Send To Focused</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.vrRuntimeInputCard}>
        <Text style={styles.serverSubtitle}>Panel pool</Text>
        <View style={styles.vrRuntimeActionRow}>
          {availablePanels.length === 0 ? (
            <Text style={styles.emptyText}>
              {workspaceScope
                ? `No additional open sessions for ${workspaceScope.name}.`
                : "All open sessions are already in the workspace."}
            </Text>
          ) : (
            availablePanels.map((entry) => (
              <Pressable
                key={`vr-add-${entry.id}`}
                accessibilityRole="button"
                accessibilityLabel={`Add panel ${entry.label}`}
                style={styles.chip}
                onPress={() => runtime.workspace.addPanel(entry.serverId, entry.session)}
              >
                <Text style={styles.chipText}>{`+ ${entry.label}`}</Text>
              </Pressable>
            ))
          )}
        </View>
      </View>

      {runtime.hudStatus ? (
        <View style={styles.vrRuntimeHudStatus}>
          <Text style={styles.serverSubtitle}>{runtime.hudStatus.message}</Text>
        </View>
      ) : null}

      <View style={styles.vrRuntimeInputCard}>
        <Text style={styles.serverSubtitle}>Workspace voice channels</Text>
        <Text style={styles.emptyText}>
          {voiceChannelsLoading ? "Loading channel state..." : "Join, leave, and mute workspace channels in VR mode."}
        </Text>
        {sharedWorkspaces.length === 0 ? (
          <Text style={styles.emptyText}>No workspaces found. Create one from the Servers tab.</Text>
        ) : null}
        {sharedWorkspaces.map((workspace) => {
          const workspaceChannels = voiceChannelsByWorkspace.get(workspace.id) || [];
          const joinedChannel = workspaceChannels.find((channel) => channel.joined);
          const permissions = getWorkspacePermissions(workspace);
          const localMember = workspace.members.find((member) => member.id === "local-user") || workspace.members[0] || null;
          const localRoleLabel = localMember ? `${localMember.name} (${localMember.role})` : "No local workspace role";
          const draftChannelName = newChannelNamesByWorkspace[workspace.id] || "";
          return (
            <View key={`vr-workspace-channel-${workspace.id}`} style={styles.vrRuntimePanelCard}>
              <View style={styles.rowInlineSpace}>
                <Text style={styles.serverName}>{workspace.name}</Text>
                <Text style={[styles.livePill, joinedChannel ? styles.livePillOn : styles.livePillOff]}>
                  {joinedChannel ? (joinedChannel.muted ? "MUTED" : "LIVE") : "IDLE"}
                </Text>
              </View>
              <Text style={styles.emptyText}>{`${workspace.members.length} member${workspace.members.length === 1 ? "" : "s"} • Local ${localRoleLabel}`}</Text>
              {workspace.members.length > 0 ? (
                <View style={styles.vrRuntimeActionRow}>
                  {workspace.members.map((member) => {
                    const memberStyle = member.role === "owner" ? styles.livePillOn : member.role === "editor" ? styles.livePillWarn : styles.livePillOff;
                    return (
                      <Text key={`vr-workspace-member-${workspace.id}-${member.id}`} style={[styles.livePill, memberStyle]}>
                        {`${member.name} • ${member.role}`}
                      </Text>
                    );
                  })}
                </View>
              ) : null}
              {permissions.canManageChannels ? (
                <View style={styles.vrRuntimeActionRow}>
                  <TextInput
                    accessibilityLabel={`New VR voice channel for ${workspace.name}`}
                    value={draftChannelName}
                    onChangeText={(value) => setWorkspaceChannelDraft(workspace.id, value)}
                    style={styles.input}
                    placeholder="New channel name"
                    placeholderTextColor="#7f7aa8"
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Create VR voice channel for ${workspace.name}`}
                    style={[
                      styles.actionButton,
                      !draftChannelName.trim() ? styles.buttonDisabled : null,
                    ]}
                    disabled={!draftChannelName.trim()}
                    onPress={() => {
                      const created = createChannel({
                        workspaceId: workspace.id,
                        name: draftChannelName,
                      });
                      if (created) {
                        clearWorkspaceChannelDraft(workspace.id);
                      }
                    }}
                  >
                    <Text style={styles.actionButtonText}>Create Channel</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.emptyText}>Only owners or editors can manage channels.</Text>
              )}
              {workspaceChannels.length === 0 ? <Text style={styles.emptyText}>No channels configured.</Text> : null}
              {workspaceChannels.length > 0 ? (
                <View style={styles.vrRuntimeActionRow}>
                  {workspaceChannels.map((channel) => {
                    const active = channel.joined;
                    return (
                      <Pressable
                        key={`vr-channel-${channel.id}`}
                        accessibilityRole="button"
                        accessibilityLabel={`${active ? "Leave" : "Join"} VR voice channel ${channel.name}`}
                        style={[
                          styles.chip,
                          active ? styles.chipActive : null,
                          !permissions.canJoinChannels ? styles.buttonDisabled : null,
                        ]}
                        disabled={!permissions.canJoinChannels}
                        onPress={() => {
                          if (!permissions.canJoinChannels) {
                            return;
                          }
                          if (active) {
                            leaveChannel(channel.id);
                            return;
                          }
                          joinChannel(channel.id);
                        }}
                      >
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                          {`#${channel.name}${channel.muted ? " (muted)" : ""}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              {permissions.canManageChannels && workspaceChannels.length > 0 ? (
                <View style={styles.vrRuntimeActionRow}>
                  {workspaceChannels.map((channel) => (
                    <Pressable
                      key={`vr-channel-delete-${channel.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete VR voice channel ${channel.name}`}
                      style={styles.actionDangerButton}
                      onPress={() => deleteChannel(channel.id)}
                    >
                      <Text style={styles.actionDangerText}>{`Delete #${channel.name}`}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {joinedChannel ? (
                <View style={styles.vrRuntimeActionRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${joinedChannel.muted ? "Unmute" : "Mute"} VR joined channel ${joinedChannel.name}`}
                    style={[styles.actionButton, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                    disabled={!permissions.canJoinChannels}
                    onPress={() => toggleMute(joinedChannel.id)}
                  >
                    <Text style={styles.actionButtonText}>{joinedChannel.muted ? "Unmute" : "Mute"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Leave VR joined channel ${joinedChannel.name}`}
                    style={[styles.actionButton, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                    disabled={!permissions.canJoinChannels}
                    onPress={() => leaveChannel(joinedChannel.id)}
                  >
                    <Text style={styles.actionButtonText}>Leave</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>

      <View style={styles.vrRuntimePanelList}>
        {visiblePanels.map((panel) => {
          const focused = panel.id === runtime.workspace.focusedPanelId;
          const outputPreview = panel.output.trim() || "Waiting for terminal output...";
          const panelConnection = connections.get(panel.serverId);
          const canShareLive =
            Boolean(panelConnection?.capabilities.spectate) &&
            !Boolean(panelConnection?.localAiSessions.includes(panel.session));
          return (
            <View
              key={panel.id}
              style={[styles.vrRuntimePanelCard, focused ? styles.vrRuntimePanelCardFocused : null]}
            >
              <View style={styles.rowInlineSpace}>
                <View style={styles.flexButton}>
                  <Text style={styles.serverName}>{`${panel.serverName} · ${panel.sessionLabel}`}</Text>
                  <Text style={styles.serverSubtitle}>{transformLabel(panel)}</Text>
                </View>
                <Text style={styles.livePill}>{panel.connected ? "Connected" : "Offline"}</Text>
              </View>

              <View style={styles.vrRuntimeActionRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Focus panel ${panel.sessionLabel}`}
                  style={[styles.chip, focused ? styles.chipActive : null]}
                  onPress={() => runtime.workspace.focusPanel(panel.id)}
                >
                  <Text style={[styles.chipText, focused ? styles.chipTextActive : null]}>
                    {focused ? "Focused" : "Focus"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle pin for ${panel.sessionLabel}`}
                  style={[styles.chip, panel.pinned ? styles.chipActive : null]}
                  onPress={() => runtime.workspace.togglePinPanel(panel.id)}
                >
                  <Text style={[styles.chipText, panel.pinned ? styles.chipTextActive : null]}>
                    {panel.pinned ? "Pinned" : "Pin"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Toggle mini mode for ${panel.sessionLabel}`}
                  style={[styles.chip, panel.mini ? styles.chipActive : null]}
                  onPress={() => runtime.workspace.toggleMiniPanel(panel.id)}
                >
                  <Text style={[styles.chipText, panel.mini ? styles.chipTextActive : null]}>
                    {panel.mini ? "Mini" : "Expand"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${panel.sessionLabel} on Mac`}
                  style={styles.chip}
                  onPress={() => {
                    void runtime.dispatchVoice("open on mac", { targetPanelId: panel.id });
                  }}
                >
                  <Text style={styles.chipText}>Open Mac</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Share live ${panel.sessionLabel}`}
                  style={[styles.chip, !canShareLive ? styles.buttonDisabled : null]}
                  disabled={!canShareLive}
                  onPress={() => {
                    void runtime.dispatchVoice("share live", { targetPanelId: panel.id });
                  }}
                >
                  <Text style={styles.chipText}>Share Live</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Interrupt ${panel.sessionLabel}`}
                  style={styles.chip}
                  onPress={() => {
                    void runtime.dispatchVoice("interrupt", { targetPanelId: panel.id });
                  }}
                >
                  <Text style={styles.chipText}>C-c</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Stop ${panel.sessionLabel}`}
                  style={styles.chip}
                  onPress={() => {
                    void runtime.dispatchVoice("stop session", { targetPanelId: panel.id });
                  }}
                >
                  <Text style={styles.chipText}>Stop</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove panel ${panel.sessionLabel}`}
                  style={styles.chip}
                  onPress={() => runtime.workspace.removePanel(panel.id)}
                >
                  <Text style={styles.chipText}>Remove</Text>
                </Pressable>
              </View>

              <Text style={styles.vrRuntimePanelOutput} numberOfLines={8}>
                {outputPreview}
              </Text>
            </View>
          );
        })}
        {visiblePanels.length === 0 ? (
          <Text style={styles.emptyText}>
            {workspaceScope
              ? `No workspace panels visible for ${workspaceScope.name}.`
              : "No workspace panels are currently visible."}
          </Text>
        ) : null}
      </View>
    </View>
  );
}
