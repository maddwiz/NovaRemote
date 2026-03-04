import { ServerConnection, ServerProfile } from "./types";

export type ServerRailGroup = {
  key: string;
  label: string;
  servers: ServerProfile[];
};

export type ServerSwitcherMenuAction = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
};

export function groupServersByVmHost(servers: ServerProfile[]): ServerRailGroup[] {
  const groups: ServerRailGroup[] = [];
  const byKey = new Map<string, ServerRailGroup>();

  servers.forEach((server) => {
    const rawVmHost = server.vmHost?.trim() || "";
    const key = rawVmHost ? `vmhost:${rawVmHost.toLowerCase()}` : "standalone";
    const label = rawVmHost || "Standalone";
    const existing = byKey.get(key);
    if (existing) {
      existing.servers.push(server);
      return;
    }

    const created: ServerRailGroup = { key, label, servers: [server] };
    byKey.set(key, created);
    groups.push(created);
  });

  return groups;
}

export function formatServerDetails(server: ServerProfile, connection: ServerConnection | undefined): string {
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

type BuildServerSwitcherMenuActionsArgs = {
  onReconnect: () => void;
  onViewDetails: () => void;
  onEditServer: () => void;
};

export function buildServerSwitcherMenuActions({
  onReconnect,
  onViewDetails,
  onEditServer,
}: BuildServerSwitcherMenuActionsArgs): ServerSwitcherMenuAction[] {
  return [
    { text: "Reconnect", onPress: onReconnect },
    { text: "View Details", onPress: onViewDetails },
    { text: "Edit Server", onPress: onEditServer },
    { text: "Cancel", style: "cancel" },
  ];
}
