import React from "react";
import { Modal, Text, View } from "react-native";
import { FeedbackPressable as Pressable } from "./FeedbackPressable";

import { canDeleteServerProfile, canEditServerProfile, isTeamManagedServer } from "../teamServers";
import { styles } from "../theme/styles";
import { ServerProfile } from "../types";

type ServerCardProps = {
  server: ServerProfile;
  isActive: boolean;
  onUse: (serverId: string) => void;
  onEdit: (server: ServerProfile) => void;
  onDelete: (serverId: string) => void;
  onShare: (server: ServerProfile) => void;
  onOpenSsh: (server: ServerProfile) => void;
};

export function ServerCard({ server, isActive, onUse, onEdit, onDelete, onShare, onOpenSsh }: ServerCardProps) {
  const teamManaged = isTeamManagedServer(server);
  const canEdit = canEditServerProfile(server);
  const canDelete = canDeleteServerProfile(server);
  const [showMoreActions, setShowMoreActions] = React.useState<boolean>(false);
  const sshTarget = server.sshHost
    ? `${server.sshUser ? `${server.sshUser}@` : ""}${server.sshHost}${server.sshPort ? `:${server.sshPort}` : ""}`
    : null;
  const vmMeta = [server.vmType, server.vmName || server.vmId].filter(Boolean).join(" • ");
  return (
    <View style={[styles.serverCard, isActive ? styles.serverCardActive : null]}>
      <View style={styles.serverCardHeader}>
        <Text style={styles.serverName}>{server.name}</Text>
        {teamManaged ? (
          <Text style={[styles.modePill, styles.modePillShell]}>{`TEAM ${(server.permissionLevel || "viewer").toUpperCase()}`}</Text>
        ) : null}
        <Text style={styles.serverUrl}>{server.baseUrl}</Text>
        <Text style={styles.emptyText}>{`Backend: ${server.terminalBackend || "auto"}`}</Text>
        {server.vmHost ? <Text style={styles.emptyText}>{`VM Host: ${server.vmHost}`}</Text> : null}
        {vmMeta ? <Text style={styles.emptyText}>{`VM: ${vmMeta}`}</Text> : null}
        {teamManaged ? <Text style={styles.emptyText}>Managed by team admin</Text> : null}
        {sshTarget ? <Text style={styles.emptyText}>{`SSH: ${sshTarget}`}</Text> : null}
      </View>
      <View style={styles.actionsWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isActive ? `Server ${server.name} is active` : `Use server ${server.name}`}
          style={styles.actionButton}
          onPress={() => onUse(server.id)}
        >
          <Text style={styles.actionButtonText}>{isActive ? "Active" : "Use"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open more actions for server ${server.name}`}
          style={styles.actionButton}
          onPress={() => setShowMoreActions(true)}
        >
          <Text style={styles.actionButtonText}>More</Text>
        </Pressable>
      </View>

      <Modal visible={showMoreActions} transparent animationType="fade" onRequestClose={() => setShowMoreActions(false)}>
        <Pressable style={styles.overlayBackdrop} onPress={() => setShowMoreActions(false)}>
          <Pressable
            style={styles.overlayCard}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelLabel}>Server Actions</Text>
            <Text style={styles.serverSubtitle}>{server.name}</Text>
            <View style={styles.actionsWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit server ${server.name}`}
                style={[styles.actionButton, !canEdit ? styles.buttonDisabled : null]}
                onPress={() => {
                  if (!canEdit) {
                    return;
                  }
                  setShowMoreActions(false);
                  onEdit(server);
                }}
                disabled={!canEdit}
              >
                <Text style={styles.actionButtonText}>{canEdit ? "Edit" : "Managed"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Share server ${server.name}`}
                accessibilityHint="Shares server config without token."
                style={styles.actionButton}
                onPress={() => {
                  setShowMoreActions(false);
                  onShare(server);
                }}
              >
                <Text style={styles.actionButtonText}>Share</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Open SSH fallback for ${server.name}`}
                accessibilityHint="Opens this server in an installed SSH app using ssh URL scheme."
                style={[styles.actionButton, !server.sshHost ? styles.buttonDisabled : null]}
                onPress={() => {
                  if (!server.sshHost) {
                    return;
                  }
                  setShowMoreActions(false);
                  onOpenSsh(server);
                }}
                disabled={!server.sshHost}
              >
                <Text style={styles.actionButtonText}>Open SSH</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete server ${server.name}`}
                accessibilityHint="Removes this server profile from the app."
                style={[styles.actionDangerButton, !canDelete ? styles.buttonDisabled : null]}
                onPress={() => {
                  if (!canDelete) {
                    return;
                  }
                  setShowMoreActions(false);
                  onDelete(server.id);
                }}
                disabled={!canDelete}
              >
                <Text style={styles.actionDangerText}>{canDelete ? "Delete" : "Managed"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close server actions"
                style={styles.buttonGhost}
                onPress={() => setShowMoreActions(false)}
              >
                <Text style={styles.buttonGhostText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
