import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_TOKEN_BROKER_CACHE } from "../constants";
import { ServerProfile, TeamIdentity } from "../types";
import { useTokenBroker } from "./useTokenBroker";

type TokenBrokerHandle = {
  tokenCache: Record<string, { token: string; expiresAt: number; permissions: string[] }>;
  brokeredServers: ServerProfile[];
  provisionServerToken: (server: ServerProfile) => Promise<unknown>;
};

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

vi.mock("expo-secure-store", () => ({
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
  deleteItemAsync: secureStoreMock.deleteItemAsync,
}));

const cloudClientMock = vi.hoisted(() => ({
  cloudRequest: vi.fn(async () => ({})),
  getNovaCloudUrl: vi.fn(() => "https://cloud.novaremote.dev"),
}));

vi.mock("../api/cloudClient", () => ({
  cloudRequest: cloudClientMock.cloudRequest,
  getNovaCloudUrl: cloudClientMock.getNovaCloudUrl,
}));

function buildIdentity(): TeamIdentity {
  return {
    provider: "novaremote_cloud",
    userId: "user-1",
    email: "dev@example.com",
    displayName: "Dev",
    teamId: "team-1",
    teamName: "Ops",
    role: "operator",
    permissions: ["servers:read"],
    accessToken: "access-token",
    refreshToken: "refresh-token",
    tokenExpiresAt: Date.now() + 60_000,
  };
}

function buildServer(): ServerProfile {
  return {
    id: "team-server-1",
    name: "DGX",
    baseUrl: "https://dgx.example.com",
    token: "",
    defaultCwd: "/workspace",
    source: "team",
    teamServerId: "team-server-1",
    permissionLevel: "viewer",
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

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
  cloudClientMock.cloudRequest.mockImplementation(async (...args: unknown[]) => {
    const path = String(args[0] || "");
    if (path === "/v1/tokens/provision") {
      return {
        token: "ephemeral-token",
        expiresAt: Date.now() + 60 * 60 * 1000,
        permissions: ["read", "execute"],
      };
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
});

describe("useTokenBroker hook", () => {
  it("provisions team tokens and derives runtime permission levels", async () => {
    const teamServer = buildServer();
    const localServer: ServerProfile = {
      id: "local-server",
      name: "Local",
      baseUrl: "https://local.example.com",
      token: "local-token",
      defaultCwd: "/workspace",
      source: "local",
    };
    let latest: TokenBrokerHandle | null = null;

    function Harness({ identity }: { identity: TeamIdentity | null }) {
      latest = useTokenBroker({
        identity,
        servers: [teamServer, localServer],
        enabled: true,
      }) as TokenBrokerHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { identity: buildIdentity() }));
    });
    await flush();

    await act(async () => {
      await latestOrThrow(latest).provisionServerToken(teamServer);
    });
    await flush();

    expect(latestOrThrow(latest).tokenCache["team-server-1"]?.token).toBe("ephemeral-token");
    expect(latestOrThrow(latest).brokeredServers.find((entry) => entry.id === "team-server-1")?.token).toBe("ephemeral-token");
    expect(latestOrThrow(latest).brokeredServers.find((entry) => entry.id === "team-server-1")?.permissionLevel).toBe("operator");
    expect(latestOrThrow(latest).brokeredServers.find((entry) => entry.id === "local-server")?.token).toBe("local-token");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("clears cached broker tokens when team identity is removed", async () => {
    secureStoreMock.storage.set(
      STORAGE_TOKEN_BROKER_CACHE,
      JSON.stringify({
        "team-server-1": {
          token: "ephemeral-token",
          expiresAt: Date.now() + 3600_000,
          permissions: ["read"],
        },
      })
    );

    const server = buildServer();
    let latest: TokenBrokerHandle | null = null;

    function Harness({ identity }: { identity: TeamIdentity | null }) {
      latest = useTokenBroker({
        identity,
        servers: [server],
        enabled: true,
      }) as TokenBrokerHandle;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { identity: buildIdentity() }));
    });
    await flush();
    await flush();

    expect(latestOrThrow(latest).brokeredServers[0]?.token).toBe("ephemeral-token");

    await act(async () => {
      renderer?.update(React.createElement(Harness, { identity: null }));
    });
    await flush();
    await flush();

    expect(latestOrThrow(latest).tokenCache).toEqual({});
    expect(latestOrThrow(latest).brokeredServers[0]?.token).toBe("");
    expect(secureStoreMock.deleteItemAsync).toHaveBeenCalledWith(STORAGE_TOKEN_BROKER_CACHE);

    await act(async () => {
      renderer?.unmount();
    });
  });

});

function latestOrThrow(value: TokenBrokerHandle | null): TokenBrokerHandle {
  if (!value) {
    throw new Error("Hook did not initialize.");
  }
  return value;
}
