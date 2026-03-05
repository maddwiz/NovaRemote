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
  updateMemberRole: (memberId: string, role: TeamIdentity["role"]) => Promise<void>;
  teamMembers: Array<{ id: string; role: string }>;
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
    permissions: ["team:invite", "team:manage", "servers:read"],
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
        members: [{ id: "member-1", name: "Alice", email: "alice@example.com", role: memberRole }],
      };
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
      return { settings: {} };
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
});

function latestOrThrow(value: TeamAuthHandle | null): TeamAuthHandle {
  if (!value) {
    throw new Error("Hook did not initialize.");
  }
  return value;
}
