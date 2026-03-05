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
});
