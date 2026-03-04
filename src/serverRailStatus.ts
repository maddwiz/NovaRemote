import { ServerConnection, ServerProfile } from "./types";

export type ServerRailStatus = "connected" | "connecting" | "disconnected" | "inactive";

export function hasServerCredentials(server: ServerProfile): boolean {
  return Boolean(server.baseUrl.trim() && server.token.trim());
}

export function deriveServerRailStatus(
  server: ServerProfile,
  connection: ServerConnection | undefined
): ServerRailStatus {
  if (!hasServerCredentials(server)) {
    return "inactive";
  }
  if (!connection) {
    return "disconnected";
  }
  if (connection.status === "connected") {
    return "connected";
  }
  if (connection.status === "connecting" || connection.status === "degraded") {
    return "connecting";
  }
  return "disconnected";
}

