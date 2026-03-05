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
  cloudRequest: vi.fn(async (_path: string) => ({})),
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
    TEAM_TOKEN_REFRESH_INTERVAL_MS: 25,
    TEAM_TOKEN_REFRESH_BUFFER_MS: 5 * 60 * 1000,
  };
});

import { STORAGE_TEAM_IDENTITY } from "../constants";
import { TeamIdentity } from "../types";
import { useTeamAuth } from "./useTeamAuth";

type TeamAuthHandle = {
  identity: TeamIdentity | null;
  loginWithSso: (input: { provider: "saml" | "oidc"; idToken?: string; accessToken?: string }) => Promise<TeamIdentity>;
  inviteMember: (input: { email: string; role?: TeamIdentity["role"] }) => Promise<unknown>;
  updateTeamSettings: (input: {
    enforceDangerConfirm?: boolean | null;
    commandBlocklist?: string[];
    sessionTimeoutMinutes?: number | null;
    requireSessionRecording?: boolean | null;
    requireFleetApproval?: boolean | null;
  }) => Promise<void>;
  updateMemberRole: (memberId: string, role: TeamIdentity["role"]) => Promise<void>;
  updateMemberServers: (memberId: string, serverIds: string[]) => Promise<void>;
  requestFleetApproval: (input: { command: string; targets: string[]; note?: string }) => Promise<unknown>;
  approveFleetApproval: (approvalId: string, note?: string) => Promise<void>;
  denyFleetApproval: (approvalId: string, note?: string) => Promise<void>;
  fleetApprovals: Array<{ id: string; status: string }>;
  teamSettings: {
    enforceDangerConfirm: boolean | null;
    commandBlocklist: string[];
    sessionTimeoutMinutes: number | null;
    requireSessionRecording: boolean | null;
    requireFleetApproval: boolean | null;
  };
  teamMembers: Array<{ id: string; role: string; serverIds?: string[] }>;
};

function buildIdentity(overrides: Partial<TeamIdentity> = {}): TeamIdentity {
  return {
    provider: "novaremote_cloud",
    userId: "user-1",
    email: "dev@example.com",
    displayName: "Dev",
    teamId: "team-1",
    teamName: "Ops",
    role: "admin",
    permissions: ["team:invite", "team:manage", "servers:read", "fleet:execute"],
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenExpiresAt: Date.now() + 1_000,
    ...overrides,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  secureStoreMock.storage.clear();
  secureStoreMock.getItemAsync.mockClear();
  secureStoreMock.setItemAsync.mockClear();
  secureStoreMock.deleteItemAsync.mockClear();
  cloudClientMock.cloudRequest.mockReset();
  let memberRole: TeamIdentity["role"] = "viewer";
  let memberServerIds: string[] = [];
  let teamSettingsState = {
    enforceDangerConfirm: null as boolean | null,
    commandBlocklist: [] as string[],
    sessionTimeoutMinutes: null as number | null,
    requireSessionRecording: null as boolean | null,
    requireFleetApproval: null as boolean | null,
  };
  let approvals: Array<{
    id: string;
    command: string;
    requestedByUserId: string;
    requestedByEmail: string;
    targets: string[];
    createdAt: string;
    updatedAt: string;
    status: "pending" | "approved" | "denied";
    note?: string;
  }> = [];
  cloudClientMock.cloudRequest.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/v1/auth/refresh") {
      return {
        identity: buildIdentity({
          accessToken: "refreshed-token",
          refreshToken: "refreshed-refresh-token",
          tokenExpiresAt: Date.now() + 60 * 60 * 1000,
        }),
      };
    }
    if (path === "/v1/auth/sso/exchange") {
      return {
        identity: buildIdentity({
          provider: "oidc",
          accessToken: "sso-access-token",
          refreshToken: "sso-refresh-token",
          tokenExpiresAt: Date.now() + 60 * 60 * 1000,
        }),
      };
    }
    if (path === "/v1/team/servers") {
      return { servers: [] };
    }
    if (path === "/v1/team/members") {
      return {
        members: [{ id: "member-1", name: "Alice", email: "alice@example.com", role: memberRole, serverIds: memberServerIds }],
      };
    }
    if (path.startsWith("/v1/team/members/") && path.endsWith("/servers")) {
      const rawBody = String(init?.body || "{}");
      const payload = JSON.parse(rawBody) as { serverIds?: string[] };
      memberServerIds = Array.isArray(payload.serverIds) ? payload.serverIds : [];
      return {};
    }
    if (path.startsWith("/v1/team/members/")) {
      const rawBody = String(init?.body || "{}");
      const payload = JSON.parse(rawBody) as { role?: TeamIdentity["role"] };
      if (payload.role) {
        memberRole = payload.role;
      }
      return {};
    }
    if (path === "/v1/team/settings") {
      if (String(init?.method || "GET").toUpperCase() === "PATCH") {
        const rawBody = String(init?.body || "{}");
        const payload = JSON.parse(rawBody) as Partial<typeof teamSettingsState>;
        teamSettingsState = {
          ...teamSettingsState,
          ...payload,
          commandBlocklist: Array.isArray(payload.commandBlocklist)
            ? payload.commandBlocklist.filter((entry) => typeof entry === "string")
            : teamSettingsState.commandBlocklist,
        };
      }
      return { settings: teamSettingsState };
    }
    if (path === "/v1/team/fleet/approvals") {
      if (init?.method === "POST") {
        const rawBody = String(init?.body || "{}");
        const payload = JSON.parse(rawBody) as { command?: string; targets?: string[]; note?: string };
        const created = {
          id: `approval-${approvals.length + 1}`,
          command: String(payload.command || ""),
          requestedByUserId: "user-1",
          requestedByEmail: "dev@example.com",
          targets: Array.isArray(payload.targets) ? payload.targets : [],
          createdAt: "2026-03-05T00:00:00.000Z",
          updatedAt: "2026-03-05T00:00:00.000Z",
          status: "pending" as const,
          note: payload.note,
        };
        approvals = [created, ...approvals];
        return { approval: created };
      }
      return { approvals };
    }
    if (path.startsWith("/v1/team/fleet/approvals/") && path.endsWith("/approve")) {
      const id = String(path).split("/")[5] || "";
      approvals = approvals.map((entry) => (entry.id === id ? { ...entry, status: "approved" as const } : entry));
      return {};
    }
    if (path.startsWith("/v1/team/fleet/approvals/") && path.endsWith("/deny")) {
      const id = String(path).split("/")[5] || "";
      approvals = approvals.map((entry) => (entry.id === id ? { ...entry, status: "denied" as const } : entry));
      return {};
    }
    if (path === "/v1/team/invites") {
      return { inviteCode: "INV-123" };
    }
    return {};
  });
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
  vi.useRealTimers();
});

describe("useTeamAuth hook", () => {
  it("auto-refreshes the team session before token expiry", async () => {
    secureStoreMock.storage.set(STORAGE_TEAM_IDENTITY, JSON.stringify(buildIdentity()));

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();
    await flush();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30);
    });
    await flush();
    await flush();

    expect(
      cloudClientMock.cloudRequest.mock.calls.some((call) => String(call[0]) === "/v1/auth/refresh")
    ).toBe(true);
    expect(latestOrThrow(latest).identity?.accessToken).toBe("refreshed-token");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("logs in through OIDC token exchange when SSO is used", async () => {
    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await latestOrThrow(latest).loginWithSso({
        provider: "oidc",
        idToken: "oidc-id-token",
      });
    });
    await flush();

    expect(
      cloudClientMock.cloudRequest.mock.calls.some((call) => String(call[0]) === "/v1/auth/sso/exchange")
    ).toBe(true);
    expect(latestOrThrow(latest).identity?.accessToken).toBe("sso-access-token");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("blocks invite actions when the user lacks invite permission", async () => {
    secureStoreMock.storage.set(
      STORAGE_TEAM_IDENTITY,
      JSON.stringify(
        buildIdentity({
          role: "viewer",
          permissions: ["servers:read"],
        })
      )
    );

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await expect(latestOrThrow(latest).inviteMember({ email: "new@example.com", role: "viewer" })).rejects.toThrow(
        "You do not have permission to invite team members."
      );
    });
    expect(
      cloudClientMock.cloudRequest.mock.calls.some((call) => String(call[0]) === "/v1/team/invites")
    ).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("invites a team member when permission is granted", async () => {
    secureStoreMock.storage.set(STORAGE_TEAM_IDENTITY, JSON.stringify(buildIdentity()));

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    let result: unknown = null;
    await act(async () => {
      result = await latestOrThrow(latest).inviteMember({
        email: "new.member@example.com",
        role: "operator",
      });
    });

    expect(
      cloudClientMock.cloudRequest.mock.calls.some((call) => String(call[0]) === "/v1/team/invites")
    ).toBe(true);
    expect(result).toMatchObject({
      email: "new.member@example.com",
      role: "operator",
      inviteCode: "INV-123",
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("blocks role updates when the user lacks management permission", async () => {
    secureStoreMock.storage.set(
      STORAGE_TEAM_IDENTITY,
      JSON.stringify(
        buildIdentity({
          role: "viewer",
          permissions: ["servers:read", "team:invite"],
        })
      )
    );

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await expect(latestOrThrow(latest).updateMemberRole("member-1", "operator")).rejects.toThrow(
        "You do not have permission to manage team members."
      );
    });
    expect(
      cloudClientMock.cloudRequest.mock.calls.some((call) => String(call[0]).startsWith("/v1/team/members/"))
    ).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("blocks team policy updates when the user lacks settings permission", async () => {
    secureStoreMock.storage.set(
      STORAGE_TEAM_IDENTITY,
      JSON.stringify(
        buildIdentity({
          role: "viewer",
          permissions: ["servers:read"],
        })
      )
    );

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await expect(
        latestOrThrow(latest).updateTeamSettings({
          enforceDangerConfirm: true,
        })
      ).rejects.toThrow("You do not have permission to manage team settings.");
    });

    const patchedTeamSettings = (cloudClientMock.cloudRequest.mock.calls as Array<[string, RequestInit?]>).some(
      (call) => String(call[0]) === "/v1/team/settings" && String(call[1]?.method || "GET").toUpperCase() === "PATCH"
    );
    expect(patchedTeamSettings).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("updates team policies when settings permission is granted", async () => {
    secureStoreMock.storage.set(STORAGE_TEAM_IDENTITY, JSON.stringify(buildIdentity()));

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await latestOrThrow(latest).updateTeamSettings({
        enforceDangerConfirm: true,
        commandBlocklist: ["rm -rf", "shutdown -h now"],
        sessionTimeoutMinutes: 30,
        requireSessionRecording: true,
        requireFleetApproval: true,
      });
    });
    await flush();

    const patchedTeamSettings = (cloudClientMock.cloudRequest.mock.calls as Array<[string, RequestInit?]>).some(
      (call) => String(call[0]) === "/v1/team/settings" && String(call[1]?.method || "GET").toUpperCase() === "PATCH"
    );
    expect(patchedTeamSettings).toBe(true);
    expect(latestOrThrow(latest).teamSettings).toMatchObject({
      enforceDangerConfirm: true,
      commandBlocklist: ["rm -rf", "shutdown -h now"],
      sessionTimeoutMinutes: 30,
      requireSessionRecording: true,
      requireFleetApproval: true,
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("blocks server assignment updates when the user lacks management permission", async () => {
    secureStoreMock.storage.set(
      STORAGE_TEAM_IDENTITY,
      JSON.stringify(
        buildIdentity({
          role: "operator",
          permissions: ["fleet:execute", "servers:read"],
        })
      )
    );

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await expect(latestOrThrow(latest).updateMemberServers("member-1", ["dgx"])).rejects.toThrow(
        "You do not have permission to manage team members."
      );
    });

    expect(
      cloudClientMock.cloudRequest.mock.calls.some((call) => String(call[0]) === "/v1/team/members/member-1/servers")
    ).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("updates member roles when management permission is granted", async () => {
    secureStoreMock.storage.set(STORAGE_TEAM_IDENTITY, JSON.stringify(buildIdentity()));

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();
    await flush();

    await act(async () => {
      await latestOrThrow(latest).updateMemberRole("member-1", "operator");
    });
    await flush();

    expect(
      cloudClientMock.cloudRequest.mock.calls.some((call) => String(call[0]) === "/v1/team/members/member-1")
    ).toBe(true);
    expect(latestOrThrow(latest).teamMembers.find((entry) => entry.id === "member-1")?.role).toBe("operator");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("updates member server assignments when management permission is granted", async () => {
    secureStoreMock.storage.set(STORAGE_TEAM_IDENTITY, JSON.stringify(buildIdentity()));

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await latestOrThrow(latest).updateMemberServers("member-1", ["dgx", "home"]);
    });
    await flush();

    expect(
      cloudClientMock.cloudRequest.mock.calls.some((call) => String(call[0]) === "/v1/team/members/member-1/servers")
    ).toBe(true);
    expect(latestOrThrow(latest).teamMembers.find((entry) => entry.id === "member-1")?.serverIds).toEqual([
      "dgx",
      "home",
    ]);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("creates and reviews fleet approvals when policy workflows are enabled", async () => {
    secureStoreMock.storage.set(STORAGE_TEAM_IDENTITY, JSON.stringify(buildIdentity()));

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();
    await flush();

    await act(async () => {
      await latestOrThrow(latest).requestFleetApproval({
        command: "docker compose up -d",
        targets: ["dgx", "home"],
      });
    });
    await flush();

    expect(latestOrThrow(latest).fleetApprovals[0]?.status).toBe("pending");
    const approvalId = latestOrThrow(latest).fleetApprovals[0]?.id || "";

    await act(async () => {
      await latestOrThrow(latest).approveFleetApproval(approvalId);
    });
    await flush();
    expect(latestOrThrow(latest).fleetApprovals.find((entry) => entry.id === approvalId)?.status).toBe("approved");

    await act(async () => {
      await latestOrThrow(latest).denyFleetApproval(approvalId);
    });
    await flush();
    expect(latestOrThrow(latest).fleetApprovals.find((entry) => entry.id === approvalId)?.status).toBe("denied");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("blocks fleet approval requests when fleet-execute permission is missing", async () => {
    secureStoreMock.storage.set(
      STORAGE_TEAM_IDENTITY,
      JSON.stringify(
        buildIdentity({
          role: "viewer",
          permissions: ["servers:read"],
        })
      )
    );

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await expect(
        latestOrThrow(latest).requestFleetApproval({
          command: "docker compose up -d",
          targets: ["dgx"],
        })
      ).rejects.toThrow("You do not have permission to request fleet execution.");
    });

    const postedFleetApprovals = (cloudClientMock.cloudRequest.mock.calls as Array<[string, RequestInit?]>).some(
      (call) => String(call[0]) === "/v1/team/fleet/approvals" && String(call[1]?.method || "GET").toUpperCase() === "POST"
    );
    expect(postedFleetApprovals).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("blocks fleet approval review when team-manage permission is missing", async () => {
    secureStoreMock.storage.set(
      STORAGE_TEAM_IDENTITY,
      JSON.stringify(
        buildIdentity({
          role: "operator",
          permissions: ["fleet:execute", "servers:read"],
        })
      )
    );

    let latest: TeamAuthHandle | null = null;

    function Harness() {
      latest = useTeamAuth({ enabled: true }) as TeamAuthHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      await expect(latestOrThrow(latest).approveFleetApproval("approval-1")).rejects.toThrow(
        "You do not have permission to review fleet approvals."
      );
    });

    await act(async () => {
      renderer?.unmount();
    });
  });
});

function latestOrThrow(value: TeamAuthHandle | null): TeamAuthHandle {
  if (!value) {
    throw new Error("Hook did not initialize.");
  }
  return value;
}
