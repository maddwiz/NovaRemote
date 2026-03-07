import React from "react";
import { Alert, Pressable, ScrollView, Text, View } from "react-native";

import { useVmGroupPrefs } from "../hooks/useVmGroupPrefs";
import { isTeamManagedServer } from "../teamServers";
import { deriveServerRailStatus } from "../serverRailStatus";
import {
  buildServerGroupMenuActions,
  buildServerSwitcherMenuActions,
  formatServerDetails,
  formatServerGroupDetails,
  groupServersByVmHost,
  ServerRailGroup,
} from "../serverSwitcherRailModel";
import { styles } from "../theme/styles";
import { ServerConnection, ServerProfile } from "../types";

type ServerSwitcherRailProps = {
  servers: ServerProfile[];
  connections: Map<string, ServerConnection>;
  focusedServerId: string | null;
  onFocusServer: (serverId: string) => void;
  onReconnectServer?: (serverId: string) => void;
  onReconnectServers?: (serverIds: string[]) => void;
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

function dotStyleForGroup(group: ServerRailGroup, connections: Map<string, ServerConnection>) {
  const statuses = group.servers.map((server) => deriveServerRailStatus(server, connections.get(server.id)));
  if (statuses.length === 0 || statuses.every((status) => status === "inactive")) {
    return styles.serverRailDotInactive;
  }
  const hasConnected = statuses.some((status) => status === "connected");
  const hasConnecting = statuses.some((status) => status === "connecting");
  const hasDisconnected = statuses.some((status) => status === "disconnected");

  if (hasConnected && !hasConnecting && !hasDisconnected) {
    return styles.serverRailDotConnected;
  }
  if (hasConnecting || (hasConnected && hasDisconnected)) {
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
  onReconnectServers,
  onEditServer,
  onAddServer,
  unreadServers,
}: ServerSwitcherRailProps) {
  const groupedServers = React.useMemo(() => groupServersByVmHost(servers), [servers]);
  const groupKeys = React.useMemo(() => groupedServers.map((group) => group.key), [groupedServers]);
  const { isGroupCollapsed, toggleGroupCollapsed } = useVmGroupPrefs({
    scope: "rail",
    groupKeys,
  });
  const renderServerChip = (server: ServerProfile) => {
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
        {isTeamManagedServer(server) ? (
          <Text style={[styles.modePill, styles.modePillShell]}>{`TEAM ${(server.permissionLevel || "viewer").toUpperCase()}`}</Text>
        ) : null}
        {activeSessions > 0 ? <Text style={styles.modePill}>{activeSessions}</Text> : null}
        {unread ? <View style={styles.serverRailUnreadBadge} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.serverRail}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {groupedServers.map((group) => (
          <View key={group.key} style={styles.serverRailGroupCard}>
            <View style={styles.serverRailGroupHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Focus ${group.label} host`}
                style={styles.serverRailGroupHeaderAction}
                onPress={() => {
                  const firstServer = group.servers[0];
                  if (!firstServer) {
                    return;
                  }
                  if (group.servers.length > 1) {
                    toggleGroupCollapsed(group.key);
                  } else {
                    onFocusServer(firstServer.id);
                  }
                }}
                onLongPress={() => {
                  const groupServerIds = group.servers.map((server) => server.id);
                  Alert.alert(
                    group.label,
                    "Host options",
                    buildServerGroupMenuActions({
                      onReconnectGroup: () => {
                        if (onReconnectServers) {
                          onReconnectServers(groupServerIds);
                          return;
                        }
                        if (onReconnectServer) {
                          groupServerIds.forEach((serverId) => onReconnectServer(serverId));
                        }
                      },
                      onFocusFirstServer: () => {
                        const firstServer = group.servers[0];
                        if (firstServer) {
                          onFocusServer(firstServer.id);
                        }
                      },
                      onViewDetails: () => {
                        Alert.alert(
                          `${group.label} details`,
                          formatServerGroupDetails(group, connections, unreadServers)
                        );
                      },
                    })
                  );
                }}
              >
                <View style={[styles.serverRailDot, dotStyleForGroup(group, connections)]} />
                <Text style={styles.serverRailGroupLabel}>{group.label}</Text>
                <Text style={styles.serverRailGroupToggle}>{isGroupCollapsed(group.key) ? "Show" : "Hide"}</Text>
                {group.servers.some((server) => unreadServers.has(server.id)) ? (
                  <View style={styles.serverRailGroupUnreadBadge} />
                ) : null}
              </Pressable>
              <Text style={styles.serverRailGroupCount}>{group.servers.length}</Text>
            </View>
            {isGroupCollapsed(group.key) ? (
              <Text style={styles.serverRailGroupSummary}>
                {`${group.vmTypeGroups.length} type(s) • ${group.servers.length} server(s)`}
              </Text>
            ) : (
              group.vmTypeGroups.map((vmTypeGroup) => (
                <View key={`${group.key}-${vmTypeGroup.key}`} style={styles.serverRailVmTypeRow}>
                  {group.vmTypeGroups.length > 1 ? (
                    <Text style={styles.serverRailVmTypeLabel}>{vmTypeGroup.label}</Text>
                  ) : null}
                  <View style={styles.serverRailVmTypeChips}>
                    {vmTypeGroup.servers.map((server) => renderServerChip(server))}
                  </View>
                </View>
              ))
            )}
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
