import React from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { deriveServerRailStatus } from "../serverRailStatus";
import { buildServerSwitcherMenuActions, formatServerDetails, groupServersByVmHost } from "../serverSwitcherRailModel";
import { styles } from "../theme/styles";
import { ServerConnection, ServerProfile } from "../types";

type ServerSwitcherRailProps = {
  servers: ServerProfile[];
  connections: Map<string, ServerConnection>;
  focusedServerId: string | null;
  onFocusServer: (serverId: string) => void;
  onReconnectServer?: (serverId: string) => void;
  onEditServer?: (serverId: string) => void;
  onAddServer: () => void;
  unreadServers: Set<string>;
};

function dotStyleForServer(server: ServerProfile, connection: ServerConnection | undefined) {
  const status = deriveServerRailStatus(server, connection);
  if (status === "inactive") {
    return styles.serverRailDotInactive;
  }
  if (status === "connected") {
    return styles.serverRailDotConnected;
  }
  if (status === "connecting") {
    return styles.serverRailDotConnecting;
  }
  return styles.serverRailDotDisconnected;
}

export function ServerSwitcherRail({
  servers,
  connections,
  focusedServerId,
  onFocusServer,
  onReconnectServer,
  onEditServer,
  onAddServer,
  unreadServers,
}: ServerSwitcherRailProps) {
  const groupedServers = React.useMemo(() => groupServersByVmHost(servers), [servers]);

  return (
    <View style={styles.serverRail}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {groupedServers.map((group) => (
          <View key={group.key} style={styles.serverRailGroup}>
            <Text style={styles.serverRailGroupLabel}>{group.label}</Text>
            {group.servers.map((server) => {
              const connection = connections.get(server.id);
              const focused = focusedServerId === server.id;
              const unread = unreadServers.has(server.id);
              const activeSessions = connection?.openSessions.length || 0;

              return (
                <Pressable
                  key={server.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Switch to ${server.name}`}
                  style={[styles.serverRailChip, focused ? styles.serverRailChipFocused : null]}
                  onPress={() => onFocusServer(server.id)}
                  onLongPress={() => {
                    Alert.alert(
                      server.name,
                      "Connection options",
                      buildServerSwitcherMenuActions({
                        onReconnect: () => (onReconnectServer ? onReconnectServer(server.id) : onFocusServer(server.id)),
                        onViewDetails: () => {
                          onFocusServer(server.id);
                          Alert.alert(`${server.name} details`, formatServerDetails(server, connection));
                        },
                        onEditServer: () => (onEditServer ? onEditServer(server.id) : onAddServer()),
                      })
                    );
                  }}
                >
                  <View style={[styles.serverRailDot, dotStyleForServer(server, connection)]} />
                  <Text style={styles.serverRailName} numberOfLines={1}>
                    {server.name}
                  </Text>
                  {activeSessions > 0 ? <Text style={styles.modePill}>{activeSessions}</Text> : null}
                  {unread ? <View style={styles.serverRailUnreadBadge} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add server"
          style={styles.serverRailChip}
          onPress={onAddServer}
        >
          <Text style={styles.serverRailName}>+ Add</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}
