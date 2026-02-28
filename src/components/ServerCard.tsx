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
};

export function ServerCard({ server, isActive, onUse, onEdit, onDelete }: ServerCardProps) {
  return (
    <View style={[styles.serverCard, isActive ? styles.serverCardActive : null]}>
      <View style={styles.serverCardHeader}>
        <Text style={styles.serverName}>{server.name}</Text>
        <Text style={styles.serverUrl}>{server.baseUrl}</Text>
      </View>
      <View style={styles.actionsWrap}>
        <Pressable style={styles.actionButton} onPress={() => onUse(server.id)}>
          <Text style={styles.actionButtonText}>{isActive ? "Active" : "Use"}</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={() => onEdit(server)}>
          <Text style={styles.actionButtonText}>Edit</Text>
        </Pressable>
        <Pressable style={styles.actionDangerButton} onPress={() => onDelete(server.id)}>
          <Text style={styles.actionDangerText}>Delete</Text>
        </Pressable>
      </View>
    </View>
  );
}
