import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useAppContext } from "../context/AppContext";
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

export function VrCommandCenterScreen() {
  const {
    connections,
    focusedServerId,
    onReconnectServer,
    onReconnectServers,
    onCreateAgentForServers,
    onSetAgentGoalForServers,
    onQueueAgentCommandForServers,
    onApproveReadyAgentsForServers,
    onDenyAllPendingAgentsForServers,
    onConnectAllServers,
    onDisconnectAllServers,
  } = useAppContext().terminals;
  const [voiceInput, setVoiceInput] = useState<string>("");
  const [commandInput, setCommandInput] = useState<string>("");
  const [agentScope, setAgentScope] = useState<"focused" | "visible" | "all">("visible");
  const [agentNameInput, setAgentNameInput] = useState<string>("");
  const [agentGoalInput, setAgentGoalInput] = useState<string>("");
  const [agentCommandInput, setAgentCommandInput] = useState<string>("");
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const { workspaces: sharedWorkspaces } = useSharedWorkspaces();
  const { channels: voiceChannels, loading: voiceChannelsLoading, joinChannel, leaveChannel, toggleMute } = useVoiceChannels();
  const runtime = useVrLiveRuntime({
    connections,
    maxPanels: 12,
    autoSyncWorkspacePanelStreams: true,
    pauseWorkspaceStreamsOnAppBackground: true,
    onReconnectServer,
    onReconnectServers,
    onCreateAgent: onCreateAgentForServers,
    onSetAgentGoal: onSetAgentGoalForServers,
    onQueueAgentCommand: onQueueAgentCommandForServers,
    onApproveReadyAgents: onApproveReadyAgentsForServers,
    onDenyAllPendingAgents: onDenyAllPendingAgentsForServers,
    onConnectAllServers,
    onDisconnectAllServers,
  });

  const focusedPanel = useMemo(
    () => runtime.workspace.panels.find((panel) => panel.id === runtime.workspace.focusedPanelId) || null,
    [runtime.workspace.focusedPanelId, runtime.workspace.panels]
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
  const visiblePanels = useMemo(() => {
    if (!workspaceScope) {
      return runtime.workspace.panels;
    }
    return runtime.workspace.panels.filter((panel) => workspaceScope.serverIds.has(panel.serverId));
  }, [runtime.workspace.panels, workspaceScope]);
  const availablePanels = useMemo(() => {
    const visible = new Set(runtime.workspace.panels.map((panel) => panel.id));
    const next: Array<{ id: string; serverId: string; session: string; label: string }> = [];
    connections.forEach((connection, serverId) => {
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
  }, [connections, runtime.workspace.panels, workspaceScope]);
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
    void runtime.dispatchVoice(transcript, {
      targetPanelId: runtime.workspace.focusedPanelId,
    });
    setVoiceInput("");
  }, [runtime, voiceInput]);

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
        setAgentStatus("No target servers selected for agent action.");
        return;
      }
      try {
        const changed = await fn(agentTargetServerIds);
        const count = Array.isArray(changed) ? changed.length : 0;
        setAgentStatus(`${label} on ${agentTargetServerIds.length} server(s)${count ? ` • affected ${count}` : ""}.`);
      } catch (error) {
        setAgentStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [agentTargetServerIds]
  );

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
        {agentStatus ? <Text style={styles.emptyText}>{agentStatus}</Text> : null}
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
          onChangeText={setVoiceInput}
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
          return (
            <View key={`vr-workspace-channel-${workspace.id}`} style={styles.vrRuntimePanelCard}>
              <View style={styles.rowInlineSpace}>
                <Text style={styles.serverName}>{workspace.name}</Text>
                <Text style={[styles.livePill, joinedChannel ? styles.livePillOn : styles.livePillOff]}>
                  {joinedChannel ? (joinedChannel.muted ? "MUTED" : "LIVE") : "IDLE"}
                </Text>
              </View>
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
