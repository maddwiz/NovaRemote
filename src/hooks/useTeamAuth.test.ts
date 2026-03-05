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
        mandatorySessionRecording: true,
        fleetApprovalRequired: true,
      })
    ).toEqual({
      enforceDangerConfirm: true,
      commandBlocklist: ["rm\\s+-rf"],
      sessionTimeoutMinutes: 30,
      requireSessionRecording: true,
      requireFleetApproval: true,
    });
    expect(teamAuthTestUtils.normalizeTeamSettings({})).toEqual({
      enforceDangerConfirm: null,
      commandBlocklist: [],
      sessionTimeoutMinutes: null,
      requireSessionRecording: null,
      requireFleetApproval: null,
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
      {
        id: "m1",
        name: "Alice",
        email: "alice@example.com",
        role: "admin",
        serverIds: ["dgx"],
        sessionsCreated: 10,
        commandsSent: 120,
        fleetExecutions: 3,
        lastActiveAt: "2026-03-05T00:00:00.000Z",
      },
      { id: "m1", name: "Alice Duplicate", email: "alice@example.com", role: "viewer" },
      { id: "m2", name: "Bob", email: "bob@example.com", role: "operator", commandsSent: 4 },
    ]);
    expect(members).toHaveLength(2);
    expect(members.find((entry) => entry.id === "m2")?.role).toBe("operator");
    expect(members.find((entry) => entry.id === "m2")?.commandsSent).toBe(4);
    expect(members.find((entry) => entry.id === "m1")?.serverIds).toEqual(["dgx"]);
    expect(members.find((entry) => entry.id === "m1")?.sessionsCreated).toBe(10);
    expect(members.find((entry) => entry.id === "m1")?.commandsSent).toBe(120);
    expect(members.find((entry) => entry.id === "m1")?.fleetExecutions).toBe(3);
    expect(members.find((entry) => entry.id === "m1")?.lastActiveAt).toBe("2026-03-05T00:00:00.000Z");

    const approvals = teamAuthTestUtils.normalizeFleetApprovals([
      {
        id: "a-1",
        command: "docker compose up -d",
        requestedByUserId: "u-1",
        requestedByEmail: "u@example.com",
        targets: ["dgx"],
        createdAt: "2026-03-05T00:00:00.000Z",
        updatedAt: "2026-03-05T00:00:00.000Z",
        status: "pending",
      },
      {
        id: "a-2",
        command: "kubectl rollout restart deploy/app",
        requestedByUserId: "u-2",
        requestedByEmail: "u2@example.com",
        targets: ["home"],
        createdAt: "2026-03-04T00:00:00.000Z",
        updatedAt: "2026-03-04T00:00:00.000Z",
        status: "approved",
      },
      {
        id: "a-3",
        command: "deploy old",
        requestedByUserId: "u-3",
        requestedByEmail: "u3@example.com",
        targets: ["legacy"],
        createdAt: "2026-03-01T00:00:00.000Z",
        updatedAt: "2026-03-01T00:00:00.000Z",
        status: "pending",
        expiresAt: "2020-01-01T00:00:00.000Z",
      },
    ]);
    expect(approvals).toHaveLength(3);
    expect(approvals[0]?.id).toBe("a-1");
    expect(approvals.find((entry) => entry.id === "a-2")?.status).toBe("approved");
    expect(approvals.find((entry) => entry.id === "a-3")?.status).toBe("expired");

    const invites = teamAuthTestUtils.normalizeTeamInvites([
      {
        id: "invite-1",
        email: "new@example.com",
        role: "viewer",
        status: "pending",
        inviteCode: "INV-123",
        createdAt: "2026-03-05T00:00:00.000Z",
      },
      {
        inviteId: "invite-2",
        email: "old@example.com",
        role: "operator",
        status: "accepted",
        created_at: "2026-03-01T00:00:00.000Z",
      },
    ]);
    expect(invites).toHaveLength(2);
    expect(invites[0]?.id).toBe("invite-1");
    expect(invites[1]?.status).toBe("accepted");

    expect(teamAuthTestUtils.toDashboardUrl("https://api.novaremote.dev")).toBe("https://cloud.novaremote.dev");
    expect(teamAuthTestUtils.toDashboardUrl("https://example.com/api")).toBe("https://example.com");
  });
});
