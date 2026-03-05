import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerProfile } from "../types";

const secureStoreMock = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return {
    storage,
    getItemAsync: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  };
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
}));

vi.mock("../constants", () => ({
  STORAGE_ANALYTICS_ENABLED: "novaremote.analytics_enabled.v1",
  STORAGE_ANALYTICS_ANON_ID: "novaremote.analytics_anon_id.v1",
  makeId: () => "id-test",
}));

import { useAnalytics } from "./useAnalytics";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

function makeServer(id: string, name: string): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  secureStoreMock.storage.clear();
  secureStoreMock.getItemAsync.mockClear();
  secureStoreMock.setItemAsync.mockClear();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    if (joined.includes("not wrapped in act")) {
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

describe("useAnalytics", () => {
  it("sends analytics events with focused server context", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const server = makeServer("dgx", "DGX");
    let latest: ReturnType<typeof useAnalytics> | null = null;

    function Harness({ activeServer, connected }: { activeServer: ServerProfile | null; connected: boolean }) {
      latest = useAnalytics({ activeServer, connected });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { activeServer: server, connected: true }));
    });
    await flush();

    await act(async () => {
      latest?.track("fleet_run", { command: "uptime" });
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, { body?: string }]>;
    const [endpoint, options] = calls[0];
    expect(String(endpoint)).toBe("https://dgx.novaremote.test/analytics/event");

    const payload = JSON.parse(String(options?.body || "{}"));
    expect(payload.event).toBe("fleet_run");
    expect(payload.anon_id).toBe("anon-id-test");
    expect(payload.props?.command).toBe("uptime");
    expect(payload.props?.server_id).toBe("dgx");
    expect(payload.props?.server_name).toBe("DGX");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("does not send analytics while disconnected", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const server = makeServer("dgx", "DGX");
    let latest: ReturnType<typeof useAnalytics> | null = null;

    function Harness() {
      latest = useAnalytics({ activeServer: server, connected: false });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await flush();

    await act(async () => {
      latest?.track("session_opened", { session: "main" });
    });

    expect(fetchMock).not.toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("switches endpoint and context when focused server changes", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const dgx = makeServer("dgx", "DGX");
    const lab = makeServer("lab", "Homelab");
    let latest: ReturnType<typeof useAnalytics> | null = null;

    function Harness({ activeServer }: { activeServer: ServerProfile | null }) {
      latest = useAnalytics({ activeServer, connected: true });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { activeServer: dgx }));
    });
    await flush();

    await act(async () => {
      latest?.track("watch_alert");
    });

    await act(async () => {
      renderer?.update(React.createElement(Harness, { activeServer: lab }));
    });
    await flush();

    await act(async () => {
      latest?.track("watch_alert");
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as Array<[unknown, { body?: string }]>;
    expect(String(calls[0]?.[0])).toBe("https://dgx.novaremote.test/analytics/event");
    expect(String(calls[1]?.[0])).toBe("https://lab.novaremote.test/analytics/event");

    const firstPayload = JSON.parse(String(calls[0]?.[1]?.body || "{}"));
    const secondPayload = JSON.parse(String(calls[1]?.[1]?.body || "{}"));
    expect(firstPayload.props?.server_id).toBe("dgx");
    expect(secondPayload.props?.server_id).toBe("lab");

    await act(async () => {
      renderer?.unmount();
    });
  });
});
