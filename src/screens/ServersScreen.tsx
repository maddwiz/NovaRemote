import React, { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { CWD_PLACEHOLDER, DEFAULT_SERVER_NAME, SERVER_URL_PLACEHOLDER, SSH_HOST_PLACEHOLDER, SSH_USER_PLACEHOLDER } from "../constants";
import { styles } from "../theme/styles";
import { ServerProfile, SharedServerTemplate, TerminalBackendKind, VmType } from "../types";
import { ServerCard } from "../components/ServerCard";
import { useQrSetup } from "../hooks/useQrSetup";
import { QrScannerModal } from "../components/QrScannerModal";
import { useSharedWorkspaces } from "../hooks/useSharedWorkspaces";
import { useVoiceChannels } from "../hooks/useVoiceChannels";
import { getWorkspaceLocalMember, getWorkspacePermissions } from "../workspacePermissions";

type ServersScreenProps = {
  servers: ServerProfile[];
  activeServerId: string | null;
  serverNameInput: string;
  serverUrlInput: string;
  serverTokenInput: string;
  serverCwdInput: string;
  serverBackendInput: TerminalBackendKind;
  serverSshHostInput: string;
  serverSshUserInput: string;
  serverSshPortInput: string;
  serverVmHostInput: string;
  serverVmTypeInput: VmType | "";
  serverVmNameInput: string;
  serverVmIdInput: string;
  serverPortainerUrlInput: string;
  serverProxmoxUrlInput: string;
  serverGrafanaUrlInput: string;
  editingServerId: string | null;
  tokenMasked: boolean;
  isPro: boolean;
  analyticsEnabled: boolean;
  analyticsAnonId: string;
  myReferralCode: string;
  claimedReferralCode: string;
  referralCodeInput: string;
  growthStatus: string;
  sharedTemplatesPayload: string;
  sharedTemplatesStatus: string;
  sharedTemplates: SharedServerTemplate[];
  requireBiometric: boolean;
  requireDangerConfirm: boolean;
  onUseServer: (serverId: string) => void;
  onBeginEditServer: (server: ServerProfile) => void;
  onDeleteServer: (serverId: string) => void;
  onShareServer: (server: ServerProfile) => void;
  onOpenServerSsh: (server: ServerProfile) => void;
  onImportServerConfig: (config: {
    name?: string;
    url?: string;
    token?: string;
    cwd?: string;
    backend?: string;
    vmHost?: string;
    vmType?: string;
    vmName?: string;
    vmId?: string;
    sshHost?: string;
    sshUser?: string;
    sshPort?: string | number;
    portainerUrl?: string;
    proxmoxUrl?: string;
    grafanaUrl?: string;
  }) => void;
  onSetServerName: (value: string) => void;
  onSetServerUrl: (value: string) => void;
  onSetServerToken: (value: string) => void;
  onSetServerCwd: (value: string) => void;
  onSetServerBackend: (value: TerminalBackendKind) => void;
  onSetServerSshHost: (value: string) => void;
  onSetServerSshUser: (value: string) => void;
  onSetServerSshPort: (value: string) => void;
  onSetServerVmHost: (value: string) => void;
  onSetServerVmType: (value: VmType | "") => void;
  onSetServerVmName: (value: string) => void;
  onSetServerVmId: (value: string) => void;
  onSetServerPortainerUrl: (value: string) => void;
  onSetServerProxmoxUrl: (value: string) => void;
  onSetServerGrafanaUrl: (value: string) => void;
  onSetAnalyticsEnabled: (value: boolean) => void;
  onShareReferral: () => void;
  onSetReferralCodeInput: (value: string) => void;
  onClaimReferralCode: () => void;
  onSetSharedTemplatesPayload: (value: string) => void;
  onExportSharedTemplates: () => void;
  onImportSharedTemplates: () => void;
  onApplySharedTemplate: (template: SharedServerTemplate) => void;
  onDeleteSharedTemplate: (templateId: string) => void;
  onShowPaywall: () => void;
  onSetRequireBiometric: (value: boolean) => void;
  onSetRequireDangerConfirm: (value: boolean) => void;
  onToggleTokenMask: () => void;
  onClearForm: () => void;
  onSaveServer: () => void;
  onBackToTerminals: () => void;
};

export function ServersScreen({
  servers,
  activeServerId,
  serverNameInput,
  serverUrlInput,
  serverTokenInput,
  serverCwdInput,
  serverBackendInput,
  serverSshHostInput,
  serverSshUserInput,
  serverSshPortInput,
  serverVmHostInput,
  serverVmTypeInput,
  serverVmNameInput,
  serverVmIdInput,
  serverPortainerUrlInput,
  serverProxmoxUrlInput,
  serverGrafanaUrlInput,
  editingServerId,
  tokenMasked,
  isPro,
  analyticsEnabled,
  analyticsAnonId,
  myReferralCode,
  claimedReferralCode,
  referralCodeInput,
  growthStatus,
  sharedTemplatesPayload,
  sharedTemplatesStatus,
  sharedTemplates,
  requireBiometric,
  requireDangerConfirm,
  onUseServer,
  onBeginEditServer,
  onDeleteServer,
  onShareServer,
  onOpenServerSsh,
  onImportServerConfig,
  onSetServerName,
  onSetServerUrl,
  onSetServerToken,
  onSetServerCwd,
  onSetServerBackend,
  onSetServerSshHost,
  onSetServerSshUser,
  onSetServerSshPort,
  onSetServerVmHost,
  onSetServerVmType,
  onSetServerVmName,
  onSetServerVmId,
  onSetServerPortainerUrl,
  onSetServerProxmoxUrl,
  onSetServerGrafanaUrl,
  onSetAnalyticsEnabled,
  onShareReferral,
  onSetReferralCodeInput,
  onClaimReferralCode,
  onSetSharedTemplatesPayload,
  onExportSharedTemplates,
  onImportSharedTemplates,
  onApplySharedTemplate,
  onDeleteSharedTemplate,
  onShowPaywall,
  onSetRequireBiometric,
  onSetRequireDangerConfirm,
  onToggleTokenMask,
  onClearForm,
  onSaveServer,
  onBackToTerminals,
}: ServersScreenProps) {
  const vmTypes: VmType[] = ["proxmox", "vmware", "hyper-v", "docker", "lxc", "qemu", "virtualbox", "cloud"];
  const [showQrScanner, setShowQrScanner] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string>("");
  const { parseQrPayload } = useQrSetup();
  const {
    workspaces,
    loading: workspacesLoading,
    createWorkspace,
    deleteWorkspace,
    setWorkspaceServers,
    setMemberRole,
  } = useSharedWorkspaces();
  const {
    channels: voiceChannels,
    loading: voiceChannelsLoading,
    createChannel,
    deleteChannel,
    pruneWorkspaceChannels,
    joinChannel,
    leaveChannel,
    toggleMute,
  } = useVoiceChannels();
  const [workspaceNameInput, setWorkspaceNameInput] = useState<string>("");
  const [workspaceServerIds, setWorkspaceServerIds] = useState<string[]>([]);
  const [workspaceChannelInputs, setWorkspaceChannelInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    if (workspaceServerIds.length > 0) {
      return;
    }
    const seedId = activeServerId || servers[0]?.id;
    if (!seedId) {
      return;
    }
    setWorkspaceServerIds([seedId]);
  }, [activeServerId, servers, workspaceServerIds.length]);
  const groupedServers = useMemo(() => {
    const groups = new Map<string, { label: string; servers: ServerProfile[] }>();
    servers.forEach((server) => {
      const vmHost = server.vmHost?.trim() || "";
      const key = vmHost ? `vmhost:${vmHost.toLowerCase()}` : "standalone";
      const label = vmHost || "Standalone";
      const existing = groups.get(key);
      if (existing) {
        existing.servers.push(server);
        return;
      }
      groups.set(key, { label, servers: [server] });
    });

    return Array.from(groups.entries())
      .map(([key, value]) => ({
        key,
        label: value.label,
        servers: value.servers
          .slice()
          .sort((a, b) => {
            const aVm = (a.vmName || a.name).toLowerCase();
            const bVm = (b.vmName || b.name).toLowerCase();
            if (aVm !== bVm) {
              return aVm.localeCompare(bVm);
            }
            return a.name.localeCompare(b.name);
          }),
      }))
      .sort((a, b) => {
        if (a.key === "standalone") {
          return -1;
        }
        if (b.key === "standalone") {
          return 1;
        }
        return a.label.localeCompare(b.label);
      });
  }, [servers]);

  const channelsByWorkspace = useMemo(() => {
    const grouped = new Map<string, typeof voiceChannels>();
    voiceChannels.forEach((channel) => {
      const existing = grouped.get(channel.workspaceId);
      if (existing) {
        existing.push(channel);
        return;
      }
      grouped.set(channel.workspaceId, [channel]);
    });
    return grouped;
  }, [voiceChannels]);

  useEffect(() => {
    if (workspacesLoading || voiceChannelsLoading) {
      return;
    }
    pruneWorkspaceChannels(workspaces.map((workspace) => workspace.id));
  }, [pruneWorkspaceChannels, voiceChannelsLoading, workspaces, workspacesLoading]);

  const toggleWorkspaceServer = (serverId: string) => {
    setWorkspaceServerIds((previous) =>
      previous.includes(serverId) ? previous.filter((id) => id !== serverId) : [...previous, serverId]
    );
  };

  const createTeamWorkspace = () => {
    const created = createWorkspace({
      name: workspaceNameInput,
      serverIds: workspaceServerIds,
    });
    if (!created) {
      return;
    }
    setWorkspaceNameInput("");
    setWorkspaceServerIds(created.serverIds);
  };

  const createWorkspaceChannel = (workspaceId: string) => {
    const value = workspaceChannelInputs[workspaceId] || "";
    const created = createChannel({
      workspaceId,
      name: value,
    });
    if (!created) {
      return;
    }
    setWorkspaceChannelInputs((previous) => ({ ...previous, [workspaceId]: "" }));
  };

  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>Server Profiles</Text>
      {servers.length === 0 ? <Text style={styles.emptyText}>No servers yet.</Text> : null}

      <View style={styles.serverListWrap}>
        {groupedServers.map((group) => (
          <View key={group.key} style={styles.serverCard}>
            <Text style={styles.panelLabel}>{`${group.label} (${group.servers.length})`}</Text>
            <View style={styles.serverListWrap}>
              {group.servers.map((server) => (
                <ServerCard
                  key={server.id}
                  server={server}
                  isActive={server.id === activeServerId}
                  onUse={onUseServer}
                  onEdit={onBeginEditServer}
                  onDelete={onDeleteServer}
                  onShare={onShareServer}
                  onOpenSsh={onOpenServerSsh}
                />
              ))}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Team Workspaces (Preview)</Text>
        <Text style={styles.serverSubtitle}>
          Role-based shared workspace groups for cross-server collaboration channels.
        </Text>
        <TextInput
          style={styles.input}
          value={workspaceNameInput}
          onChangeText={setWorkspaceNameInput}
          placeholder="Workspace name (example: Platform Ops)"
          placeholderTextColor="#7f7aa8"
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {servers.map((server) => {
            const active = workspaceServerIds.includes(server.id);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${active ? "Remove" : "Add"} ${server.name} to workspace`}
                key={`workspace-server-${server.id}`}
                style={[styles.chip, active ? styles.chipActive : null]}
                onPress={() => toggleWorkspaceServer(server.id)}
              >
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{server.name}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Create team workspace"
          style={[styles.buttonPrimary, (!workspaceNameInput.trim() || workspaceServerIds.length === 0) ? styles.buttonDisabled : null]}
          disabled={!workspaceNameInput.trim() || workspaceServerIds.length === 0}
          onPress={createTeamWorkspace}
        >
          <Text style={styles.buttonPrimaryText}>Create Workspace</Text>
        </Pressable>

        {workspacesLoading ? <Text style={styles.emptyText}>Loading workspaces...</Text> : null}
        {!workspacesLoading && workspaces.length === 0 ? (
          <Text style={styles.emptyText}>No workspaces yet. Create one to group team servers.</Text>
        ) : null}
        <View style={styles.serverListWrap}>
          {workspaces.map((workspace) => {
            const localMember = getWorkspaceLocalMember(workspace);
            const permissions = getWorkspacePermissions(workspace);
            const nextRole = localMember?.role === "owner" ? "editor" : localMember?.role === "editor" ? "viewer" : "owner";
            const activeServerIncluded = activeServerId ? workspace.serverIds.includes(activeServerId) : false;
            const workspaceChannels = channelsByWorkspace.get(workspace.id) || [];
            const workspaceChannelInput = workspaceChannelInputs[workspace.id] || "";

            return (
              <View key={workspace.id} style={styles.terminalCard}>
                <Text style={styles.terminalName}>{workspace.name}</Text>
                <Text style={styles.serverSubtitle}>
                  {`${workspace.serverIds.length} servers • ${workspace.members.length} members • ${workspace.channelId}`}
                </Text>
                <Text style={styles.emptyText}>{`Servers: ${workspace.serverIds.join(", ") || "none"}`}</Text>
                <Text style={styles.emptyText}>
                  {`Local role: ${permissions.role} • Updated ${new Date(workspace.updatedAt).toLocaleString()}`}
                </Text>
                <View style={styles.serverCard}>
                  <Text style={styles.panelLabel}>Voice Channels</Text>
                  <Text style={styles.serverSubtitle}>
                    {permissions.canManageChannels
                      ? "Route live team calls per workspace with one active joined channel at a time."
                      : "Viewer role can join channels but cannot create or delete them."}
                  </Text>
                  <View style={styles.rowInlineSpace}>
                    <TextInput
                      style={[styles.input, styles.flexButton]}
                      value={workspaceChannelInput}
                      onChangeText={(value) =>
                        setWorkspaceChannelInputs((previous) => ({
                          ...previous,
                          [workspace.id]: value,
                        }))
                      }
                      placeholder="Channel name (example: Incident Bridge)"
                      placeholderTextColor="#7f7aa8"
                      editable={permissions.canManageChannels}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Create voice channel for ${workspace.name}`}
                      style={[
                        styles.actionButton,
                        (!workspaceChannelInput.trim() || !permissions.canManageChannels) ? styles.buttonDisabled : null,
                      ]}
                      disabled={!workspaceChannelInput.trim() || !permissions.canManageChannels}
                      onPress={() => createWorkspaceChannel(workspace.id)}
                    >
                      <Text style={styles.actionButtonText}>Add</Text>
                    </Pressable>
                  </View>

                  {workspaceChannels.length === 0 ? <Text style={styles.emptyText}>No channels yet.</Text> : null}
                  {workspaceChannels.map((channel) => (
                    <View key={channel.id} style={styles.serverCard}>
                      <View style={styles.terminalNameRow}>
                        <Text style={styles.serverName}>{`# ${channel.name}`}</Text>
                        <Text style={[styles.livePill, channel.joined ? styles.livePillOn : styles.livePillOff]}>
                          {channel.joined ? (channel.muted ? "joined-muted" : "joined") : "idle"}
                        </Text>
                      </View>
                      <Text style={styles.emptyText}>{`Updated ${new Date(channel.updatedAt).toLocaleString()}`}</Text>
                      <View style={styles.actionsWrap}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${channel.joined ? "Leave" : "Join"} voice channel ${channel.name}`}
                          style={[styles.actionButton, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                          disabled={!permissions.canJoinChannels}
                          onPress={() => {
                            if (!permissions.canJoinChannels) {
                              return;
                            }
                            if (channel.joined) {
                              leaveChannel(channel.id);
                              return;
                            }
                            joinChannel(channel.id);
                          }}
                        >
                          <Text style={styles.actionButtonText}>{channel.joined ? "Leave" : "Join"}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`${channel.muted ? "Unmute" : "Mute"} voice channel ${channel.name}`}
                          style={[styles.actionButton, (!channel.joined || !permissions.canJoinChannels) ? styles.buttonDisabled : null]}
                          disabled={!channel.joined || !permissions.canJoinChannels}
                          onPress={() => toggleMute(channel.id)}
                        >
                          <Text style={styles.actionButtonText}>{channel.muted ? "Unmute" : "Mute"}</Text>
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={`Delete voice channel ${channel.name}`}
                          style={[styles.actionDangerButton, !permissions.canManageChannels ? styles.buttonDisabled : null]}
                          disabled={!permissions.canManageChannels}
                          onPress={() => deleteChannel(channel.id)}
                        >
                          <Text style={styles.actionDangerText}>Delete Channel</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>
                <View style={styles.actionsWrap}>
                  {activeServerId ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${activeServerIncluded ? "Remove" : "Add"} active server from workspace`}
                      style={[styles.actionButton, !permissions.canManageWorkspace ? styles.buttonDisabled : null]}
                      disabled={!permissions.canManageWorkspace}
                      onPress={() => {
                        if (!permissions.canManageWorkspace) {
                          return;
                        }
                        const nextServers = activeServerIncluded
                          ? workspace.serverIds.filter((id) => id !== activeServerId)
                          : [...workspace.serverIds, activeServerId];
                        setWorkspaceServers(workspace.id, nextServers);
                      }}
                    >
                      <Text style={styles.actionButtonText}>
                        {activeServerIncluded ? "Remove Active Server" : "Add Active Server"}
                      </Text>
                    </Pressable>
                  ) : null}
                  {localMember ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Cycle local workspace role"
                      style={[styles.actionButton, !permissions.canManageMembers ? styles.buttonDisabled : null]}
                      disabled={!permissions.canManageMembers}
                      onPress={() => setMemberRole(workspace.id, localMember.id, nextRole)}
                    >
                      <Text style={styles.actionButtonText}>{`Role -> ${nextRole}`}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Delete workspace ${workspace.name}`}
                    style={[styles.actionDangerButton, !permissions.canDeleteWorkspace ? styles.buttonDisabled : null]}
                    disabled={!permissions.canDeleteWorkspace}
                    onPress={() => deleteWorkspace(workspace.id)}
                  >
                    <Text style={styles.actionDangerText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      <View style={styles.formDivider} />
      <Text style={styles.panelLabel}>{editingServerId ? "Edit Server" : "Add Server"}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan QR code for server setup"
        style={styles.buttonGhost}
        onPress={() => {
          setQrError("");
          setShowQrScanner(true);
        }}
      >
        <Text style={styles.buttonGhostText}>Scan QR Code</Text>
      </Pressable>
      <Text style={styles.emptyText}>or enter manually</Text>
      <TextInput
        style={styles.input}
        value={serverNameInput}
        autoCapitalize="words"
        autoCorrect={false}
        placeholder={DEFAULT_SERVER_NAME}
        placeholderTextColor="#7f7aa8"
        onChangeText={onSetServerName}
      />
      <TextInput
        style={styles.input}
        value={serverUrlInput}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={SERVER_URL_PLACEHOLDER}
        placeholderTextColor="#7f7aa8"
        onChangeText={onSetServerUrl}
      />
      <TextInput
        style={styles.input}
        value={serverTokenInput}
        secureTextEntry={tokenMasked}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Bearer token"
        placeholderTextColor="#7f7aa8"
        onChangeText={onSetServerToken}
      />
      <TextInput
        style={styles.input}
        value={serverCwdInput}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={CWD_PLACEHOLDER}
        placeholderTextColor="#7f7aa8"
        onChangeText={onSetServerCwd}
      />
      {qrError ? <Text style={styles.emptyText}>{qrError}</Text> : null}

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Direct SSH Fallback (Optional)</Text>
        <Text style={styles.serverSubtitle}>Launches an installed SSH app via `ssh://` when companion APIs are unavailable.</Text>
        <TextInput
          style={styles.input}
          value={serverSshHostInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={SSH_HOST_PLACEHOLDER}
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerSshHost}
        />
        <TextInput
          style={styles.input}
          value={serverSshUserInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={SSH_USER_PLACEHOLDER}
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerSshUser}
        />
        <TextInput
          style={styles.input}
          value={serverSshPortInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          placeholder="22"
          placeholderTextColor="#7f7aa8"
          onChangeText={(value) => onSetServerSshPort(value.replace(/[^0-9]/g, ""))}
        />
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>VM Metadata (Optional)</Text>
        <Text style={styles.serverSubtitle}>Group servers by host and track VM runtime details for orchestration workflows.</Text>
        <TextInput
          style={styles.input}
          value={serverVmHostInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="VM host (example: homelab-r740)"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerVmHost}
        />
        <View style={styles.actionsWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Set VM type to none"
            style={[styles.modeButton, serverVmTypeInput === "" ? styles.modeButtonOn : null]}
            onPress={() => onSetServerVmType("")}
          >
            <Text style={[styles.modeButtonText, serverVmTypeInput === "" ? styles.modeButtonTextOn : null]}>none</Text>
          </Pressable>
          {vmTypes.map((vmType) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Set VM type to ${vmType}`}
              key={vmType}
              style={[styles.modeButton, serverVmTypeInput === vmType ? styles.modeButtonOn : null]}
              onPress={() => onSetServerVmType(vmType)}
            >
              <Text style={[styles.modeButtonText, serverVmTypeInput === vmType ? styles.modeButtonTextOn : null]}>
                {vmType}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={serverVmNameInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="VM name (example: build-runner-01)"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerVmName}
        />
        <TextInput
          style={styles.input}
          value={serverVmIdInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="VM ID (example: 101)"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerVmId}
        />
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Terminal Backend</Text>
        <Text style={styles.serverSubtitle}>Metadata hint for server runtime and future orchestration defaults.</Text>
        <View style={styles.actionsWrap}>
          {(["auto", "tmux", "screen", "zellij", "powershell", "cmd", "pty"] as TerminalBackendKind[]).map((backend) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Set terminal backend to ${backend}`}
              key={backend}
              style={[styles.modeButton, serverBackendInput === backend ? styles.modeButtonOn : null]}
              onPress={() => onSetServerBackend(backend)}
            >
              <Text style={[styles.modeButtonText, serverBackendInput === backend ? styles.modeButtonTextOn : null]}>
                {backend}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Self-Hosted Integrations (Optional)</Text>
        <Text style={styles.serverSubtitle}>Quick-link metadata for tools like Portainer, Proxmox, and Grafana.</Text>
        <TextInput
          style={styles.input}
          value={serverPortainerUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://portainer.example.com"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerPortainerUrl}
        />
        <TextInput
          style={styles.input}
          value={serverProxmoxUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://proxmox.example.com:8006"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerProxmoxUrl}
        />
        <TextInput
          style={styles.input}
          value={serverGrafanaUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://grafana.example.com"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerGrafanaUrl}
        />
      </View>

      <View style={styles.rowInlineSpace}>
        <Pressable accessibilityRole="button" accessibilityLabel={tokenMasked ? "Show server token" : "Hide server token"} style={[styles.buttonGhost, styles.flexButton]} onPress={onToggleTokenMask}>
          <Text style={styles.buttonGhostText}>{tokenMasked ? "Show Token" : "Hide Token"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear server form" style={[styles.buttonGhost, styles.flexButton]} onPress={onClearForm}>
          <Text style={styles.buttonGhostText}>Clear Form</Text>
        </Pressable>
      </View>

      <View style={styles.rowInlineSpace}>
        <Text style={styles.switchLabel}>Require Face ID / Touch ID</Text>
        <Switch
          accessibilityLabel="Require Face ID or Touch ID"
          trackColor={{ false: "#33596c", true: "#0ea8c8" }}
          thumbColor={requireBiometric ? "#d4fdff" : "#d3dee5"}
          value={requireBiometric}
          onValueChange={onSetRequireBiometric}
        />
      </View>

      <View style={styles.rowInlineSpace}>
        <Text style={styles.switchLabel}>Confirm Dangerous Commands</Text>
        <Switch
          accessibilityLabel="Require dangerous command confirmation"
          trackColor={{ false: "#33596c", true: "#0ea8c8" }}
          thumbColor={requireDangerConfirm ? "#d4fdff" : "#d3dee5"}
          value={requireDangerConfirm}
          onValueChange={onSetRequireDangerConfirm}
        />
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Growth / Monetization</Text>
        <Text style={styles.serverSubtitle}>Anonymous analytics + referrals + Pro shared team templates.</Text>

        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Anonymous Analytics</Text>
          <Switch
            accessibilityLabel="Enable anonymous analytics"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={analyticsEnabled ? "#d4fdff" : "#d3dee5"}
            value={analyticsEnabled}
            onValueChange={onSetAnalyticsEnabled}
          />
        </View>
        <Text style={styles.emptyText}>{`Anon ID: ${analyticsAnonId || "initializing..."}`}</Text>

        <Text style={styles.panelLabel}>Referral Program</Text>
        <Text style={styles.emptyText}>{`Your code: ${myReferralCode || "..."}`}</Text>
        {claimedReferralCode ? <Text style={styles.emptyText}>{`Claimed code: ${claimedReferralCode}`}</Text> : null}
        <View style={styles.rowInlineSpace}>
          <Pressable accessibilityRole="button" accessibilityLabel="Share referral link" style={[styles.buttonGhost, styles.flexButton]} onPress={onShareReferral}>
            <Text style={styles.buttonGhostText}>Share Referral Link</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Claim referral code" style={[styles.buttonPrimary, styles.flexButton]} onPress={onClaimReferralCode}>
            <Text style={styles.buttonPrimaryText}>Claim Code</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          value={referralCodeInput}
          onChangeText={onSetReferralCodeInput}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Enter referral code"
          placeholderTextColor="#7f7aa8"
        />

        <Text style={styles.panelLabel}>Team Shared Profiles (Pro)</Text>
        {!isPro ? (
          <View style={styles.rowInlineSpace}>
            <Text style={styles.emptyText}>Upgrade to Pro to unlock team profile sharing.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Upgrade to Pro" style={styles.actionButton} onPress={onShowPaywall}>
              <Text style={styles.actionButtonText}>Upgrade</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.rowInlineSpace}>
              <Pressable accessibilityRole="button" accessibilityLabel="Export current servers as shared templates" style={[styles.buttonGhost, styles.flexButton]} onPress={onExportSharedTemplates}>
                <Text style={styles.buttonGhostText}>Export Team Templates</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Import shared templates from payload" style={[styles.buttonPrimary, styles.flexButton]} onPress={onImportSharedTemplates}>
                <Text style={styles.buttonPrimaryText}>Import Templates</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={sharedTemplatesPayload}
              onChangeText={onSetSharedTemplatesPayload}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Paste shared templates payload JSON"
              placeholderTextColor="#7f7aa8"
              multiline
            />

            {sharedTemplates.length === 0 ? <Text style={styles.emptyText}>No shared templates imported yet.</Text> : null}
            {sharedTemplates.map((template) => (
              <View key={template.id} style={styles.serverCard}>
                <Text style={styles.serverName}>{template.name}</Text>
                <Text style={styles.serverSubtitle}>{template.baseUrl}</Text>
                <Text style={styles.emptyText}>{template.defaultCwd || "(no default cwd)"}</Text>
                <View style={styles.actionsWrap}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Apply shared template ${template.name}`} style={styles.actionButton} onPress={() => onApplySharedTemplate(template)}>
                    <Text style={styles.actionButtonText}>Apply Template</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete shared template ${template.name}`} style={styles.actionDangerButton} onPress={() => onDeleteSharedTemplate(template.id)}>
                    <Text style={styles.actionDangerText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {growthStatus ? <Text style={styles.emptyText}>{growthStatus}</Text> : null}
        {sharedTemplatesStatus ? <Text style={styles.emptyText}>{sharedTemplatesStatus}</Text> : null}
      </View>

      <View style={styles.rowInlineSpace}>
        <Pressable accessibilityRole="button" accessibilityLabel={editingServerId ? "Update server profile" : "Save server profile"} style={[styles.buttonPrimary, styles.flexButton]} onPress={onSaveServer}>
          <Text style={styles.buttonPrimaryText}>{editingServerId ? "Update Server" : "Save Server"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to terminals screen" style={[styles.buttonGhost, styles.flexButton]} onPress={onBackToTerminals}>
          <Text style={styles.buttonGhostText}>Back to Terminal</Text>
        </Pressable>
      </View>

      <QrScannerModal
        visible={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanned={(raw) => {
          const parsed = parseQrPayload(raw);
          if (!parsed) {
            setShowQrScanner(false);
            setQrError("QR code not recognized. Enter server details manually.");
            return;
          }
          setShowQrScanner(false);
          setQrError("");
          onImportServerConfig({
            name: parsed.name,
            url: parsed.url,
            token: parsed.token,
            cwd: parsed.cwd,
            backend: parsed.backend,
            vmHost: parsed.vmHost,
            vmType: parsed.vmType,
            vmName: parsed.vmName,
            vmId: parsed.vmId,
            sshHost: parsed.sshHost,
            sshUser: parsed.sshUser,
            sshPort: parsed.sshPort,
          });
        }}
      />
    </View>
  );
}
