import { describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
  deleteItemAsync: vi.fn(async () => {}),
}));

vi.mock("../constants", async (importOriginal) => {
  const original = await importOriginal<typeof import("../constants")>();
  return {
    ...original,
    makeId: () => "audit-id-test",
  };
});

import { auditLogTestUtils } from "./useAuditLog";
import { AuditEvent, TeamIdentity } from "../types";

const identity: TeamIdentity = {
  provider: "novaremote_cloud",
  userId: "user-1",
  email: "dev@example.com",
  displayName: "Dev",
  teamId: "team-1",
  teamName: "Ops",
  role: "operator",
  permissions: ["audit:read"],
  accessToken: "access",
  tokenExpiresAt: Date.now() + 60_000,
  refreshToken: "refresh",
};

describe("audit log helpers", () => {
  it("builds normalized audit events", () => {
    const event = auditLogTestUtils.buildAuditEvent(
      {
        action: "command_sent",
        serverId: "server-1",
        serverName: "DGX",
        session: "main",
        detail: "ls -la",
      },
      identity,
      "device-1",
      "1.1.0"
    );

    expect(event.id).toBe("audit-id-test");
    expect(event.userId).toBe("user-1");
    expect(event.action).toBe("command_sent");
    expect(event.serverName).toBe("DGX");
  });

  it("prunes oldest entries beyond queue limit", () => {
    const events: AuditEvent[] = [
      {
        id: "1",
        timestamp: 1,
        userId: "u",
        userEmail: "u@example.com",
        serverId: "s",
        serverName: "S",
        session: "a",
        action: "command_sent",
        detail: "",
        approved: null,
        deviceId: "d",
        appVersion: "1",
      },
      {
        id: "2",
        timestamp: 2,
        userId: "u",
        userEmail: "u@example.com",
        serverId: "s",
        serverName: "S",
        session: "b",
        action: "command_sent",
        detail: "",
        approved: null,
        deviceId: "d",
        appVersion: "1",
      },
      {
        id: "3",
        timestamp: 3,
        userId: "u",
        userEmail: "u@example.com",
        serverId: "s",
        serverName: "S",
        session: "c",
        action: "command_sent",
        detail: "",
        approved: null,
        deviceId: "d",
        appVersion: "1",
      },
    ];
    const pruned = auditLogTestUtils.pruneAuditEvents(events, 2);
    expect(pruned.map((entry) => entry.id)).toEqual(["2", "3"]);
  });
});
