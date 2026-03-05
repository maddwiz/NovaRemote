import React, { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { styles } from "../theme/styles";
import { SharedWorkspace, VoiceChannel } from "../types";
import { getWorkspacePermissions } from "../workspacePermissions";

type WorkspaceVoiceChannelsPanelProps = {
  workspaces: SharedWorkspace[];
  channels: VoiceChannel[];
  loading: boolean;
  onCreateChannel: (workspaceId: string, name: string) => VoiceChannel | null;
  onDeleteChannel: (channelId: string) => void;
  onJoinChannel: (channelId: string) => void;
  onLeaveChannel: (channelId: string) => void;
  onToggleMute: (channelId: string) => void;
  onOpenServers: () => void;
};

export function WorkspaceVoiceChannelsPanel({
  workspaces,
  channels,
  loading,
  onCreateChannel,
  onDeleteChannel,
  onJoinChannel,
  onLeaveChannel,
  onToggleMute,
  onOpenServers,
}: WorkspaceVoiceChannelsPanelProps) {
  const [newChannelNamesByWorkspace, setNewChannelNamesByWorkspace] = useState<Record<string, string>>({});
  const voiceChannelsByWorkspace = useMemo(() => {
    const grouped = new Map<string, VoiceChannel[]>();
    channels.forEach((channel) => {
      const existing = grouped.get(channel.workspaceId);
      if (existing) {
        existing.push(channel);
        return;
      }
      grouped.set(channel.workspaceId, [channel]);
    });
    return grouped;
  }, [channels]);

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
      <Text style={styles.panelLabel}>Workspace Voice Channels (Preview)</Text>
      <Text style={styles.serverSubtitle}>
        {loading ? "Loading channel state..." : "Join or mute workspace channels without leaving terminals."}
      </Text>
      {workspaces.length === 0 ? <Text style={styles.emptyText}>No workspaces yet. Create one from the Servers tab.</Text> : null}
      {workspaces.map((workspace) => {
        const workspaceChannels = voiceChannelsByWorkspace.get(workspace.id) || [];
        const joinedChannel = workspaceChannels.find((channel) => channel.joined);
        const permissions = getWorkspacePermissions(workspace);
        const memberSummary = workspace.members
          .map((member) => `${member.name} (${member.role})`)
          .join(", ");

        return (
          <View key={`voice-workspace-${workspace.id}`} style={styles.serverCard}>
            <View style={styles.terminalNameRow}>
              <Text style={styles.terminalName}>{workspace.name}</Text>
              <Text style={[styles.livePill, joinedChannel ? styles.livePillOn : styles.livePillOff]}>
                {joinedChannel ? (joinedChannel.muted ? "MUTED" : "LIVE") : "IDLE"}
              </Text>
            </View>
            <Text style={styles.emptyText}>{`Role: ${permissions.role}`}</Text>
            {memberSummary ? <Text style={styles.emptyText}>{`Members: ${memberSummary}`}</Text> : null}
            {permissions.canManageChannels ? (
              <View style={styles.modeRow}>
                <TextInput
                  accessibilityLabel={`New voice channel for ${workspace.name}`}
                  style={[styles.input, styles.flexButton]}
                  value={newChannelNamesByWorkspace[workspace.id] || ""}
                  onChangeText={(value) => setWorkspaceChannelDraft(workspace.id, value)}
                  placeholder="New channel (e.g. incident)"
                  placeholderTextColor="#7f7aa8"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Create voice channel for ${workspace.name}`}
                  style={[
                    styles.actionButton,
                    !(newChannelNamesByWorkspace[workspace.id] || "").trim() ? styles.buttonDisabled : null,
                  ]}
                  disabled={!(newChannelNamesByWorkspace[workspace.id] || "").trim()}
                  onPress={() => {
                    const draft = (newChannelNamesByWorkspace[workspace.id] || "").trim();
                    if (!draft) {
                      return;
                    }
                    const created = onCreateChannel(workspace.id, draft);
                    if (created) {
                      clearWorkspaceChannelDraft(workspace.id);
                    }
                  }}
                >
                  <Text style={styles.actionButtonText}>Create</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={styles.emptyText}>Only owners or editors can manage channels.</Text>
            )}
            {workspaceChannels.length === 0 ? <Text style={styles.emptyText}>No channels configured.</Text> : null}
            {workspaceChannels.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {workspaceChannels.map((channel) => {
                  const active = channel.joined;
                  const activeParticipants = channel.activeParticipantIds || [];
                  const onlineCount = activeParticipants.length;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${active ? "Leave" : "Join"} voice channel ${channel.name}`}
                      key={channel.id}
                      style={[styles.chip, active ? styles.chipActive : null, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                      disabled={!permissions.canJoinChannels}
                      onPress={() => {
                        if (!permissions.canJoinChannels) {
                          return;
                        }
                        if (active) {
                          onLeaveChannel(channel.id);
                          return;
                        }
                        onJoinChannel(channel.id);
                      }}
                    >
                      <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                        {`#${channel.name}${onlineCount > 0 ? ` • ${onlineCount} online` : ""}${channel.muted ? " (muted)" : ""}`}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            ) : null}
            {joinedChannel?.activeSpeakerId ? (
              <Text style={styles.emptyText}>{`Active speaker: ${joinedChannel.activeSpeakerId}`}</Text>
            ) : null}
            {permissions.canManageChannels && workspaceChannels.length > 0 ? (
              <View style={styles.actionsWrap}>
                {workspaceChannels.map((channel) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete voice channel ${channel.name}`}
                    key={`delete-${channel.id}`}
                    style={styles.actionDangerButton}
                    onPress={() => onDeleteChannel(channel.id)}
                  >
                    <Text style={styles.actionDangerText}>{`Delete #${channel.name}`}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {joinedChannel ? (
              <View style={styles.actionsWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${joinedChannel.muted ? "Unmute" : "Mute"} joined channel ${joinedChannel.name}`}
                  style={[styles.actionButton, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                  disabled={!permissions.canJoinChannels}
                  onPress={() => onToggleMute(joinedChannel.id)}
                >
                  <Text style={styles.actionButtonText}>{joinedChannel.muted ? "Unmute" : "Mute"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Leave joined channel ${joinedChannel.name}`}
                  style={[styles.actionButton, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                  disabled={!permissions.canJoinChannels}
                  onPress={() => onLeaveChannel(joinedChannel.id)}
                >
                  <Text style={styles.actionButtonText}>Leave</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open servers screen to manage workspace channels"
        style={styles.actionButton}
        onPress={onOpenServers}
      >
        <Text style={styles.actionButtonText}>Manage Channels in Servers</Text>
      </Pressable>
    </View>
  );
}
