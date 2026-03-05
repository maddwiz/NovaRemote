import { describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

import { tokenBrokerTestUtils } from "./useTokenBroker";
import { ServerProfile } from "../types";

function buildServer(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "server-1",
    name: "Server",
    baseUrl: "https://server.test",
    token: "local-token",
    defaultCwd: "/workspace",
    ...overrides,
  };
}

describe("token broker helpers", () => {
  it("decides when tokens need refresh", () => {
    expect(tokenBrokerTestUtils.shouldRefreshToken(null, 1_000, 500)).toBe(true);
    expect(
      tokenBrokerTestUtils.shouldRefreshToken(
        { serverId: "s1", token: "t", expiresAt: 1_400, permissions: ["read"] },
        1_000,
        500
      )
    ).toBe(true);
    expect(
      tokenBrokerTestUtils.shouldRefreshToken(
        { serverId: "s1", token: "t", expiresAt: 4_000, permissions: ["read"] },
        1_000,
        500
      )
    ).toBe(false);
  });

  it("overlays broker tokens for team servers only", () => {
    const local = buildServer({ id: "local", source: "local", token: "local-token" });
    const team = buildServer({ id: "team", source: "team", token: "", permissionLevel: "admin" });

    const merged = tokenBrokerTestUtils.applyBrokerTokens([local, team], {
      team: {
        serverId: "team",
        token: "team-ephemeral-token",
        expiresAt: Date.now() + 1000,
        permissions: ["read"],
      },
    });

    expect(merged.find((entry) => entry.id === "local")?.token).toBe("local-token");
    expect(merged.find((entry) => entry.id === "team")?.token).toBe("team-ephemeral-token");
    expect(merged.find((entry) => entry.id === "team")?.permissionLevel).toBe("viewer");
  });

  it("derives runtime permission level from broker permissions", () => {
    expect(tokenBrokerTestUtils.derivePermissionLevelFromBrokerPermissions(["read"])).toBe("viewer");
    expect(tokenBrokerTestUtils.derivePermissionLevelFromBrokerPermissions(["read", "execute"])).toBe("operator");
    expect(tokenBrokerTestUtils.derivePermissionLevelFromBrokerPermissions(["admin"])).toBe("admin");
  });
});
