import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useAppContext } from "../context/AppContext";
import { styles } from "../theme/styles";
import { VrLayoutPreset } from "../vr/contracts";
import { useVrLiveRuntime } from "../vr/useVrLiveRuntime";
import { buildVrPanelId } from "../vr/useVrWorkspace";

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
  const availablePanels = useMemo(() => {
    const visible = new Set(runtime.workspace.panels.map((panel) => panel.id));
    const next: Array<{ id: string; serverId: string; session: string; label: string }> = [];
    connections.forEach((connection, serverId) => {
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
  }, [connections, runtime.workspace.panels]);
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
    void runtime.sendServerCommand(focusedPanel.serverId, focusedPanel.session, command);
    setCommandInput("");
  }, [commandInput, focusedPanel, runtime]);

  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>VR Command Center (Preview)</Text>
      <Text style={styles.serverSubtitle}>
        {`Focused server ${focusedServerId || "none"} • Panels ${runtime.workspace.panels.length} • Preset ${runtime.workspace.preset}`}
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
            <Text style={styles.emptyText}>All open sessions are already in the workspace.</Text>
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

      <View style={styles.vrRuntimePanelList}>
        {runtime.workspace.panels.map((panel) => {
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
                    void runtime.openServerOnMac(panel.serverId, panel.session);
                  }}
                >
                  <Text style={styles.chipText}>Open Mac</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Interrupt ${panel.sessionLabel}`}
                  style={styles.chip}
                  onPress={() => {
                    void runtime.sendServerControlChar(panel.serverId, panel.session, "C-c");
                  }}
                >
                  <Text style={styles.chipText}>C-c</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Stop ${panel.sessionLabel}`}
                  style={styles.chip}
                  onPress={() => {
                    void runtime.stopServerSession(panel.serverId, panel.session);
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
      </View>
    </View>
  );
}
