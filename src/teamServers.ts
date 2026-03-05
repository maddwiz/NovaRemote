import { ServerProfile, TeamPermissionLevel } from "./types";

const TEAM_PERMISSION_LEVELS: TeamPermissionLevel[] = ["admin", "operator", "viewer"];

export function normalizeServerSource(value: unknown): "local" | "team" {
  return value === "team" ? "team" : "local";
}

export function normalizeTeamPermissionLevel(value: unknown): TeamPermissionLevel | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  return TEAM_PERMISSION_LEVELS.includes(normalized as TeamPermissionLevel)
    ? (normalized as TeamPermissionLevel)
    : undefined;
}

export function isTeamManagedServer(server: ServerProfile): boolean {
  return normalizeServerSource(server.source) === "team";
}

export function canEditServerProfile(server: ServerProfile): boolean {
  return !isTeamManagedServer(server);
}

export function canDeleteServerProfile(server: ServerProfile): boolean {
  return !isTeamManagedServer(server);
}

export function normalizeServerProfile(server: ServerProfile): ServerProfile {
  return {
    ...server,
    source: normalizeServerSource(server.source),
    permissionLevel: normalizeTeamPermissionLevel(server.permissionLevel),
    teamServerId: server.teamServerId?.trim() || undefined,
  };
}
