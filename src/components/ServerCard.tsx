import React from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../theme/styles";
import { ServerProfile } from "../types";

type ServerCardProps = {
  server: ServerProfile;
  isActive: boolean;
  onUse: (serverId: string) => void;
  onEdit: (server: ServerProfile) => void;
  onDelete: (serverId: string) => void;
  onShare: (server: ServerProfile) => void;
};

export function ServerCard({ server, isActive, onUse, onEdit, onDelete, onShare }: ServerCardProps) {
  return (
    <View style={[styles.serverCard, isActive ? styles.serverCardActive : null]}>
      <View style={styles.serverCardHeader}>
        <Text style={styles.serverName}>{server.name}</Text>
        <Text style={styles.serverUrl}>{server.baseUrl}</Text>
        <Text style={styles.emptyText}>{`Backend: ${server.terminalBackend || "auto"}`}</Text>
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
        <Pressable accessibilityRole="button" accessibilityLabel={`Edit server ${server.name}`} style={styles.actionButton} onPress={() => onEdit(server)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Share server ${server.name}`}
          accessibilityHint="Shares server config without token."
          style={styles.actionButton}
          onPress={() => onShare(server)}
        >
          <Text style={styles.actionButtonText}>Share</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Delete server ${server.name}`}
          accessibilityHint="Removes this server profile from the app."
          style={styles.actionDangerButton}
          onPress={() => onDelete(server.id)}
        >
          <Text style={styles.actionDangerText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}
