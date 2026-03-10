import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_ACTIVE_SERVER_ID, STORAGE_SERVERS } from "../constants";
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

function latestOrThrow(value: UseServersHandle | null): UseServersHandle {
  if (!value) {
    throw new Error("Hook did not initialize.");
  }
  return value;
}

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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("useServers dev seeding", () => {
  it("seeds a dev server from environment when storage is empty", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_DEV_SERVER_URL", "http://10.0.0.71:8787");
    vi.stubEnv("EXPO_PUBLIC_DEV_SERVER_TOKEN", "seed-token");
    vi.stubEnv("EXPO_PUBLIC_DEV_SERVER_NAME", "Macbook");
    vi.stubEnv("EXPO_PUBLIC_DEV_SERVER_CWD", "/Users/desmondpottle/Desktop");

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
    await waitFor(() => !latestOrThrow(latest).loadingSettings, "seeded settings load");

    expect(latestOrThrow(latest).servers).toHaveLength(1);
    expect(latestOrThrow(latest).servers[0]).toMatchObject({
      id: "dev-seeded-server",
      name: "Macbook",
      baseUrl: "http://10.0.0.71:8787",
      token: "seed-token",
      defaultCwd: "/Users/desmondpottle/Desktop",
    });
    expect(latestOrThrow(latest).activeServerId).toBe("dev-seeded-server");
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("upserts a dev server even when stored servers already exist", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_DEV_SERVER_URL", "http://10.0.0.71:8787");
    vi.stubEnv("EXPO_PUBLIC_DEV_SERVER_TOKEN", "seed-token");
    vi.stubEnv("EXPO_PUBLIC_DEV_SERVER_NAME", "Macbook");
    secureStoreMock.storage.set(
      STORAGE_SERVERS,
      JSON.stringify([
        {
          id: "existing-server",
          name: "Existing",
          baseUrl: "http://192.168.0.10:8787",
          token: "existing-token",
          defaultCwd: "/tmp",
          source: "local",
          terminalBackend: "auto",
        },
      ])
    );
    secureStoreMock.storage.set(STORAGE_ACTIVE_SERVER_ID, "existing-server");

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
    await waitFor(() => !latestOrThrow(latest).loadingSettings, "merged seeded settings load");

    expect(latestOrThrow(latest).servers).toHaveLength(2);
    expect(latestOrThrow(latest).servers.map((server) => server.id)).toContain("dev-seeded-server");
    expect(latestOrThrow(latest).activeServerId).toBe("existing-server");
    expect(onError).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });
});
