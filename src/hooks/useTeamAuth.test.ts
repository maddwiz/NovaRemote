import { describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

import { teamAuthTestUtils } from "./useTeamAuth";

describe("team auth helpers", () => {
  it("normalizes valid team identity payloads", () => {
    const identity = teamAuthTestUtils.normalizeTeamIdentity({
      provider: "novaremote_cloud",
      userId: "user-1",
      email: "dev@example.com",
      displayName: "Dev",
      teamId: "team-1",
      teamName: "Ops",
      role: "operator",
      permissions: ["sessions:send", "fleet:execute", "sessions:send"],
      accessToken: "access",
      refreshToken: "refresh",
      tokenExpiresAt: 2000,
    });

    expect(identity).not.toBeNull();
    expect(identity?.role).toBe("operator");
    expect(identity?.permissions).toEqual(["sessions:send", "fleet:execute"]);
  });

  it("rejects incomplete identity payloads", () => {
    const identity = teamAuthTestUtils.normalizeTeamIdentity({
      userId: "user-1",
      email: "dev@example.com",
    });
    expect(identity).toBeNull();
  });

  it("detects refresh windows", () => {
    const identity = teamAuthTestUtils.normalizeTeamIdentity({
      provider: "novaremote_cloud",
      userId: "user-1",
      email: "dev@example.com",
      displayName: "Dev",
      teamId: "team-1",
      teamName: "Ops",
      role: "admin",
      permissions: ["servers:read"],
      accessToken: "access",
      refreshToken: "refresh",
      tokenExpiresAt: 10_000,
    });
    expect(teamAuthTestUtils.shouldRefreshTeamIdentity(identity, 8_000, 2_500)).toBe(true);
    expect(teamAuthTestUtils.shouldRefreshTeamIdentity(identity, 1_000, 2_500)).toBe(false);
  });

  it("normalizes team servers and settings payloads", () => {
    const servers = teamAuthTestUtils.normalizeTeamServers([
      {
        id: "srv-1",
        name: "DGX",
        baseUrl: "https://dgx.example.com/",
        defaultCwd: "/home/dev",
        permissionLevel: "operator",
      },
      {
        id: "",
        name: "bad",
        baseUrl: "",
      },
    ]);
    expect(servers).toHaveLength(1);
    expect(servers[0]?.source).toBe("team");
    expect(servers[0]?.baseUrl).toBe("https://dgx.example.com");

    expect(
      teamAuthTestUtils.normalizeTeamSettings({
        enforceDangerConfirm: true,
        commandBlocklist: ["rm\\s+-rf", ""],
        sessionTimeoutMinutes: "30",
      })
    ).toEqual({
      enforceDangerConfirm: true,
      commandBlocklist: ["rm\\s+-rf"],
      sessionTimeoutMinutes: 30,
    });
    expect(teamAuthTestUtils.normalizeTeamSettings({})).toEqual({
      enforceDangerConfirm: null,
      commandBlocklist: [],
      sessionTimeoutMinutes: null,
    });
    expect(
      teamAuthTestUtils.normalizeTeamUsage({
        activeMembers: "7",
        sessions_created: 42,
        commandsSent: "120",
        fleet_runs: 3,
      })
    ).toEqual({
      activeMembers: 7,
      sessionsCreated: 42,
      commandsSent: 120,
      fleetExecutions: 3,
    });
    expect(teamAuthTestUtils.normalizeTeamUsage({})).toEqual({
      activeMembers: 0,
      sessionsCreated: 0,
      commandsSent: 0,
      fleetExecutions: 0,
    });

    const members = teamAuthTestUtils.normalizeTeamMembers([
      { id: "m1", name: "Alice", email: "alice@example.com", role: "admin" },
      { id: "m1", name: "Alice Duplicate", email: "alice@example.com", role: "viewer" },
      { id: "m2", name: "Bob", email: "bob@example.com", role: "operator" },
    ]);
    expect(members).toHaveLength(2);
    expect(members.find((entry) => entry.id === "m2")?.role).toBe("operator");
  });
});
