import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secureStoreMock = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return {
    storage,
    getItemAsync: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  };
});

const cloudClientMock = vi.hoisted(() => ({
  cloudRequest: vi.fn(async () => ({})),
  getNovaCloudUrl: vi.fn(() => "https://cloud.novaremote.dev"),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
  deleteItemAsync: secureStoreMock.deleteItemAsync,
}));

vi.mock("../api/cloudClient", () => ({
  cloudRequest: cloudClientMock.cloudRequest,
  getNovaCloudUrl: cloudClientMock.getNovaCloudUrl,
}));

vi.mock("../constants", async (importOriginal) => {
  const original = await importOriginal<typeof import("../constants")>();
  return {
    ...original,
    makeId: () => "audit-id-test",
  };
});

import { auditLogTestUtils, useAuditLog } from "./useAuditLog";
import { AuditEvent, TeamAuditExportJob, TeamIdentity } from "../types";

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

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

type AuditLogHandle = {
  record: (...args: unknown[]) => unknown;
  syncNow: () => Promise<{ synced: number; remaining: number }>;
  exportSnapshot: (format?: "json" | "csv") => string;
  requestCloudExport: (format: "json" | "csv", rangeHours?: number) => Promise<TeamAuditExportJob>;
  lastCloudExportJob: TeamAuditExportJob | null;
  pendingCount: number;
  events: AuditEvent[];
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  secureStoreMock.storage.clear();
  secureStoreMock.getItemAsync.mockClear();
  secureStoreMock.setItemAsync.mockClear();
  secureStoreMock.deleteItemAsync.mockClear();
  cloudClientMock.cloudRequest.mockClear();
  cloudClientMock.cloudRequest.mockResolvedValue({});
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

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

  it("serializes events to csv with escaped cells", () => {
    const csv = auditLogTestUtils.serializeAuditEvents(
      [
        {
          id: "evt-1",
          timestamp: 1700000000000,
          userId: "u-1",
          userEmail: "u@example.com",
          serverId: "srv-1",
          serverName: "Server, One",
          session: "main",
          action: "command_sent",
          detail: "echo \"hello,world\"",
          approved: null,
          deviceId: "device-1",
          appVersion: "1.2.3",
        },
      ],
      "csv"
    );
    expect(csv).toContain("timestamp_iso");
    expect(csv).toContain("\"Server, One\"");
    expect(csv).toContain("\"echo \"\"hello,world\"\"\"");
  });

  it("normalizes cloud export job payloads", () => {
    const normalized = auditLogTestUtils.normalizeAuditExportJob({
      exportId: "exp-1",
      format: "csv",
      status: "ready",
      createdAt: "2026-03-05T00:00:00.000Z",
      downloadUrl: "https://cloud.novaremote.dev/exports/exp-1.csv",
    });
    expect(normalized?.exportId).toBe("exp-1");
    expect(normalized?.status).toBe("ready");
  });
});

describe("useAuditLog", () => {
  it("syncs dangerous events immediately when requested", async () => {
    let latest: AuditLogHandle | null = null;

    function Harness() {
      latest = useAuditLog({ identity, enabled: true, syncEnabled: true }) as AuditLogHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      latest?.record(
        {
          action: "command_dangerous_approved",
          serverId: "server-1",
          serverName: "DGX",
          session: "main",
          detail: "dangerous command",
          approved: true,
        },
        { immediateSync: true }
      );
    });
    await flush();

    expect(cloudClientMock.cloudRequest).toHaveBeenCalledTimes(1);
    const call = (cloudClientMock.cloudRequest.mock.calls[0] as unknown[]) || [];
    const init = (call[1] as { body?: string } | undefined) || undefined;
    const body = String(init?.body || "{}");
    const payload = JSON.parse(body) as { events?: AuditEvent[] };
    expect(payload.events?.[0]?.action).toBe("command_dangerous_approved");
    expect(latestOrThrow(latest).pendingCount).toBe(0);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("falls back to queue if immediate sync fails", async () => {
    cloudClientMock.cloudRequest.mockRejectedValueOnce(new Error("500 sync failure"));
    const onError = vi.fn();
    let latest: AuditLogHandle | null = null;

    function Harness() {
      latest = useAuditLog({ identity, enabled: true, syncEnabled: true, onError }) as AuditLogHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      latest?.record(
        {
          action: "command_dangerous_denied",
          detail: "blocked",
          approved: false,
        },
        { immediateSync: true }
      );
    });
    await flush();

    expect(onError).toHaveBeenCalledTimes(1);
    expect(latestOrThrow(latest).pendingCount).toBe(1);
    expect(latestOrThrow(latest).events[0]?.action).toBe("command_dangerous_denied");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("syncs queued events through syncNow", async () => {
    let latest: AuditLogHandle | null = null;

    function Harness() {
      latest = useAuditLog({ identity, enabled: true, syncEnabled: true }) as AuditLogHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      latest?.record({
        action: "command_sent",
        serverId: "server-1",
        serverName: "DGX",
        session: "main",
        detail: "ls -la",
      });
    });
    await flush();
    expect(latestOrThrow(latest).pendingCount).toBe(1);

    await act(async () => {
      await latest?.syncNow();
    });
    await flush();

    expect(latestOrThrow(latest).pendingCount).toBe(0);
    expect(cloudClientMock.cloudRequest).toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("exports queued events as json and csv snapshots", async () => {
    let latest: AuditLogHandle | null = null;

    function Harness() {
      latest = useAuditLog({ identity, enabled: true, syncEnabled: false }) as AuditLogHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      latest?.record({
        action: "command_sent",
        serverId: "server-1",
        serverName: "DGX",
        session: "main",
        detail: "uname -a",
      });
    });
    await flush();

    const json = latestOrThrow(latest).exportSnapshot("json");
    const csv = latestOrThrow(latest).exportSnapshot("csv");
    expect(json).toContain("\"action\": \"command_sent\"");
    expect(csv).toContain("command_sent");
    expect(csv).toContain("uname -a");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("requests cloud-hosted export jobs and stores the last export metadata", async () => {
    cloudClientMock.cloudRequest.mockResolvedValueOnce({
      exportId: "exp-123",
      format: "json",
      status: "ready",
      createdAt: "2026-03-05T00:00:00.000Z",
      expiresAt: "2026-03-05T01:00:00.000Z",
      downloadUrl: "https://cloud.novaremote.dev/exports/exp-123.json",
    });

    let latest: AuditLogHandle | null = null;

    function Harness() {
      latest = useAuditLog({ identity, enabled: true, syncEnabled: true }) as AuditLogHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    let job: TeamAuditExportJob | null = null;
    await act(async () => {
      job = await latestOrThrow(latest).requestCloudExport("json", 48);
    });
    await flush();

    expect(job).toMatchObject({ exportId: "exp-123" });
    expect(latestOrThrow(latest).lastCloudExportJob?.downloadUrl).toContain("exp-123.json");
    const cloudCalls = cloudClientMock.cloudRequest.mock.calls as unknown as Array<[string, ...unknown[]]>;
    expect(
      cloudCalls.some((call) => String(call[0]) === "/v1/audit/exports")
    ).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

function latestOrThrow(value: AuditLogHandle | null): AuditLogHandle {
  if (!value) {
    throw new Error("Hook did not initialize.");
  }
  return value;
}
