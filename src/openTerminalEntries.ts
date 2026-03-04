import { ServerConnection, ServerProfile } from "./types";

export type OpenTerminalEntry = {
  key: string;
  serverId: string;
  serverName: string;
  session: string;
  connection: ServerConnection | null;
  isFocusedServer: boolean;
};

type BuildOpenTerminalEntriesArgs = {
  showAllServerTerminals: boolean;
  sortedOpenSessions: string[];
  focusedServerId: string | null;
  activeServerId: string | null;
  activeServerName: string | null;
  servers: ServerProfile[];
  connections: Map<string, ServerConnection>;
  pinnedSessions: string[];
};

function sortSessionsPinnedFirst(sessions: string[], pinnedSessions: string[]): string[] {
  const pinnedSet = new Set(pinnedSessions);
  return sessions.slice().sort((a, b) => {
    const aPinned = pinnedSet.has(a) ? 1 : 0;
    const bPinned = pinnedSet.has(b) ? 1 : 0;
    if (aPinned !== bPinned) {
      return bPinned - aPinned;
    }
    return a.localeCompare(b);
  });
}

export function buildOpenTerminalEntries({
  showAllServerTerminals,
  sortedOpenSessions,
  focusedServerId,
  activeServerId,
  activeServerName,
  servers,
  connections,
  pinnedSessions,
}: BuildOpenTerminalEntriesArgs): OpenTerminalEntry[] {
  if (!showAllServerTerminals) {
    const primaryServerId = focusedServerId || activeServerId || "";
    const primaryServerName = activeServerName || "Server";
    return sortedOpenSessions.map((session) => ({
      key: `${primaryServerId}::${session}`,
      serverId: primaryServerId,
      serverName: primaryServerName,
      session,
      connection: primaryServerId ? connections.get(primaryServerId) ?? null : null,
      isFocusedServer: true,
    }));
  }

  const entries: OpenTerminalEntry[] = [];
  servers.forEach((server) => {
    const connection = connections.get(server.id) ?? null;
    if (!connection) {
      return;
    }
    const serverOpenSessions = server.id === focusedServerId
      ? sortSessionsPinnedFirst(connection.openSessions, pinnedSessions)
      : connection.openSessions.slice().sort((a, b) => a.localeCompare(b));
    serverOpenSessions.forEach((session) => {
      entries.push({
        key: `${server.id}::${session}`,
        serverId: server.id,
        serverName: server.name,
        session,
        connection,
        isFocusedServer: server.id === focusedServerId,
      });
    });
  });

  return entries;
}
