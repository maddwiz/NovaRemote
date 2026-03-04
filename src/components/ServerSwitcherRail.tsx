import React from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

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

function hasCredentials(server: ServerProfile): boolean {
  return Boolean(server.baseUrl.trim() && server.token.trim());
}

function dotStyleForServer(server: ServerProfile, connection: ServerConnection | undefined) {
  if (!hasCredentials(server)) {
    return styles.serverRailDotInactive;
  }
  if (!connection) {
    return styles.serverRailDotDisconnected;
  }
  if (connection.status === "connected") {
    return styles.serverRailDotConnected;
  }
  if (connection.status === "connecting" || connection.status === "degraded") {
    return styles.serverRailDotConnecting;
  }
  return styles.serverRailDotDisconnected;
}

function detailsText(server: ServerProfile, connection: ServerConnection | undefined): string {
  if (!connection) {
    return `Status: disconnected\nURL: ${server.baseUrl || "not set"}\nSessions: 0`;
  }

  const latency = connection.health.latencyMs === null ? "n/a" : `${connection.health.latencyMs} ms`;
  return [
    `Status: ${connection.status}`,
    `Sessions: ${connection.openSessions.length} open / ${connection.allSessions.length} total`,
    `Streams: ${connection.activeStreamCount}`,
    `Latency: ${latency}`,
  ].join("\n");
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
  const groupedServers = React.useMemo(() => {
    const groups: Array<{ key: string; label: string; servers: ServerProfile[] }> = [];
    const byKey = new Map<string, { key: string; label: string; servers: ServerProfile[] }>();

    servers.forEach((server) => {
      const rawVmHost = server.vmHost?.trim() || "";
      const key = rawVmHost ? `vmhost:${rawVmHost.toLowerCase()}` : "standalone";
      const label = rawVmHost || "Standalone";
      const existing = byKey.get(key);
      if (existing) {
        existing.servers.push(server);
        return;
      }
      const created = { key, label, servers: [server] };
      byKey.set(key, created);
      groups.push(created);
    });

    return groups;
  }, [servers]);

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
                    Alert.alert(server.name, "Connection options", [
                      { text: "Reconnect", onPress: () => (onReconnectServer ? onReconnectServer(server.id) : onFocusServer(server.id)) },
                      {
                        text: "View Details",
                        onPress: () => {
                          onFocusServer(server.id);
                          Alert.alert(`${server.name} details`, detailsText(server, connection));
                        },
                      },
                      { text: "Edit Server", onPress: () => (onEditServer ? onEditServer(server.id) : onAddServer()) },
                      { text: "Cancel", style: "cancel" },
                    ]);
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
