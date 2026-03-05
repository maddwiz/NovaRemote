import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_ACTIVE_SERVER_ID, STORAGE_SERVERS } from "../constants";
import { ServerProfile } from "../types";
import { useServers } from "./useServers";

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

type UseServersHandle = ReturnType<typeof useServers>;

function buildServer(id: string, overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id,
    name: overrides.name || id.toUpperCase(),
    baseUrl: overrides.baseUrl || `https://${id}.novaremote.test`,
    token: overrides.token || `${id}-token`,
    defaultCwd: overrides.defaultCwd || "/workspace",
    source: overrides.source || "local",
    ...overrides,
  };
}

function latestOrThrow(value: UseServersHandle | null): UseServersHandle {
  if (!value) {
    throw new Error("Hook did not initialize.");
  }
  return value;
}

function readSavedServers(): ServerProfile[] {
  const raw = secureStoreMock.storage.get(STORAGE_SERVERS);
  if (!raw) {
    return [];
  }
  return JSON.parse(raw) as ServerProfile[];
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flush();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

beforeEach(() => {
  secureStoreMock.storage.clear();
  secureStoreMock.getItemAsync.mockClear();
  secureStoreMock.setItemAsync.mockClear();
  secureStoreMock.deleteItemAsync.mockClear();
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

describe("useServers hook", () => {
  it("merges incoming team servers, removes revoked team servers, and preserves locals", async () => {
    const local = buildServer("local-1", { source: "local" });
    const legacyTeam = buildServer("team-old", {
      source: "team",
      permissionLevel: "viewer",
      teamServerId: "team-old",
    });
    secureStoreMock.storage.set(STORAGE_SERVERS, JSON.stringify([legacyTeam, local]));
    secureStoreMock.storage.set(STORAGE_ACTIVE_SERVER_ID, legacyTeam.id);

    const onError = vi.fn();
    let latest: UseServersHandle | null = null;
    function Harness() {
      latest = useServers({ onError, enabled: true });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => !latestOrThrow(latest).loadingSettings, "initial settings load");

    const teamA = buildServer("team-a", {
      source: "team",
      permissionLevel: "operator",
      teamServerId: "team-a",
      token: "ephemeral-a",
    });
    const teamB = buildServer("team-b", {
      source: "team",
      permissionLevel: "admin",
      teamServerId: "team-b",
      token: "ephemeral-b",
    });

    await act(async () => {
      await latestOrThrow(latest).replaceTeamServers([teamA, teamB]);
    });
    await flush();

    expect(latestOrThrow(latest).servers.map((server) => server.id)).toEqual(["team-a", "team-b", "local-1"]);
    expect(latestOrThrow(latest).activeServerId).toBe("team-a");
    expect(readSavedServers().map((server) => server.id)).toEqual(["team-a", "team-b", "local-1"]);
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      await latestOrThrow(latest).replaceTeamServers([]);
    });
    await flush();

    expect(latestOrThrow(latest).servers.map((server) => server.id)).toEqual(["local-1"]);
    expect(latestOrThrow(latest).activeServerId).toBe("local-1");
    expect(readSavedServers().map((server) => server.id)).toEqual(["local-1"]);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("gives team servers URL precedence over matching local servers", async () => {
    const localDuplicate = buildServer("local-dup", {
      source: "local",
      baseUrl: "https://dgx.novaremote.test",
    });
    const localUnique = buildServer("local-unique", {
      source: "local",
      baseUrl: "https://homelab.novaremote.test",
    });
    secureStoreMock.storage.set(STORAGE_SERVERS, JSON.stringify([localDuplicate, localUnique]));
    secureStoreMock.storage.set(STORAGE_ACTIVE_SERVER_ID, localDuplicate.id);

    const onError = vi.fn();
    let latest: UseServersHandle | null = null;
    function Harness() {
      latest = useServers({ onError, enabled: true });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => !latestOrThrow(latest).loadingSettings, "initial settings load");

    const teamServer = buildServer("team-dgx", {
      source: "team",
      permissionLevel: "operator",
      teamServerId: "team-dgx",
      baseUrl: "https://dgx.novaremote.test",
      token: "ephemeral-dgx",
    });

    await act(async () => {
      await latestOrThrow(latest).replaceTeamServers([teamServer]);
    });
    await flush();

    expect(latestOrThrow(latest).servers.map((server) => server.id)).toEqual(["team-dgx", "local-unique"]);
    expect(latestOrThrow(latest).activeServerId).toBe("team-dgx");
    expect(readSavedServers().map((server) => server.id)).toEqual(["team-dgx", "local-unique"]);
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("blocks editing and deleting team-managed servers while allowing local deletes", async () => {
    const local = buildServer("local-1", { source: "local" });
    const team = buildServer("team-1", {
      source: "team",
      permissionLevel: "viewer",
      teamServerId: "team-1",
    });
    secureStoreMock.storage.set(STORAGE_SERVERS, JSON.stringify([local, team]));
    secureStoreMock.storage.set(STORAGE_ACTIVE_SERVER_ID, local.id);

    const onError = vi.fn();
    let latest: UseServersHandle | null = null;
    function Harness() {
      latest = useServers({ onError, enabled: true });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => !latestOrThrow(latest).loadingSettings, "initial settings load");

    const teamServer = latestOrThrow(latest).servers.find((server) => server.id === "team-1");
    expect(teamServer?.source).toBe("team");

    await act(async () => {
      latestOrThrow(latest).beginEditServer(teamServer as ServerProfile);
    });

    await act(async () => {
      await expect(latestOrThrow(latest).saveServer()).rejects.toThrow(
        "Team-managed servers are read-only and cannot be edited on this device."
      );
    });

    await act(async () => {
      await expect(latestOrThrow(latest).deleteServer("team-1")).rejects.toThrow(
        "Team-managed servers are controlled by your team admin and cannot be deleted locally."
      );
    });

    await act(async () => {
      await latestOrThrow(latest).deleteServer("local-1");
    });
    await flush();

    expect(latestOrThrow(latest).servers.map((server) => server.id)).toEqual(["team-1"]);
    expect(latestOrThrow(latest).activeServerId).toBe("team-1");
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("uses and persists a selected server id", async () => {
    const localA = buildServer("local-a");
    const localB = buildServer("local-b");
    secureStoreMock.storage.set(STORAGE_SERVERS, JSON.stringify([localA, localB]));
    secureStoreMock.storage.set(STORAGE_ACTIVE_SERVER_ID, localA.id);

    const onError = vi.fn();
    let latest: UseServersHandle | null = null;
    function Harness() {
      latest = useServers({ onError, enabled: true });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => !latestOrThrow(latest).loadingSettings, "initial settings load");

    await act(async () => {
      await latestOrThrow(latest).useServer("local-b");
    });
    await flush();

    expect(latestOrThrow(latest).activeServerId).toBe("local-b");
    expect(secureStoreMock.storage.get(STORAGE_ACTIVE_SERVER_ID)).toBe("local-b");

    await act(async () => {
      renderer?.unmount();
    });
  });
});
