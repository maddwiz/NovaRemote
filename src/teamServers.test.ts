import { describe, expect, it } from "vitest";

import {
  canDeleteServerProfile,
  canEditServerProfile,
  isTeamManagedServer,
  normalizeServerProfile,
} from "./teamServers";
import { ServerProfile } from "./types";

function buildServer(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "server-1",
    name: "Server",
    baseUrl: "https://server.test",
    token: "token-1",
    defaultCwd: "/workspace",
    ...overrides,
  };
}

describe("teamServers", () => {
  it("detects and locks team-managed servers", () => {
    const teamServer = buildServer({ source: "team", permissionLevel: "viewer" });
    expect(isTeamManagedServer(teamServer)).toBe(true);
    expect(canEditServerProfile(teamServer)).toBe(false);
    expect(canDeleteServerProfile(teamServer)).toBe(false);
  });

  it("normalizes unknown metadata to local defaults", () => {
    const normalized = normalizeServerProfile(
      buildServer({
        source: undefined,
        permissionLevel: "owner" as never,
        teamServerId: "  ",
      })
    );
    expect(normalized.source).toBe("local");
    expect(normalized.permissionLevel).toBeUndefined();
    expect(normalized.teamServerId).toBeUndefined();
  });
});
