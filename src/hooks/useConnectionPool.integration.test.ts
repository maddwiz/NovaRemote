import type { ServerProfile, TmuxStreamMessage } from "../types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../constants", () => ({
  DEFAULT_CWD: "/workspace",
  POOL_HEALTH_INTERVAL_MS: 8000,
  POOL_MAX_RECONNECT_DELAY_MS: 12000,
  POLL_INTERVAL_MS: 1400,
  STREAM_RETRY_BASE_MS: 100,
  STREAM_RETRY_FACTOR: 1.8,
  isLikelyAiSession: () => false,
  makeLocalLlmSessionName: () => "local-ai-test-session",
  makeShellSessionName: () => "shell-test-session",
  sortByCreatedAt: (sessions: Array<{ name: string }>) => sessions,
}));

type HookModule = typeof import("./useConnectionPool");
type TestRendererModule = typeof import("react-test-renderer");

const capabilityManifest = {
  capabilities: {
    terminal: true,
    tmux: true,
    codex: false,
    files: false,
    shellRun: false,
    macAttach: false,
    stream: true,
    sysStats: false,
    processes: false,
    collaboration: false,
    spectate: false,
  },
};

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly options?: { headers?: Record<string, string> };

  readyState = FakeWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  sentFrames: string[] = [];

  constructor(url: string, _protocols?: string | string[], options?: { headers?: Record<string, string> }) {
    this.url = url;
    this.options = options;
    FakeWebSocket.instances.push(this);
  }

  static reset() {
    FakeWebSocket.instances = [];
  }

  send(frame: string) {
    this.sentFrames.push(frame);
  }

  close() {
    this.emitClose();
  }

  emitOpen() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  emitClose() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }

  emitMessage(message: TmuxStreamMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

const fetchMock = vi.fn(async (input: unknown) => {
  const url = typeof input === "string" ? input : String(input);

  if (url.endsWith("/capabilities")) {
    return jsonResponse(capabilityManifest);
  }
  if (url.includes("/tmux/sessions")) {
    return jsonResponse({
      sessions: [{ name: "main" }],
    });
  }
  if (url.endsWith("/health")) {
    return jsonResponse({ ok: true });
  }
  if (url.includes("/tmux/tail")) {
    return jsonResponse({
      session: "main",
      output: "",
    });
  }

  return jsonResponse({ detail: `Unhandled URL: ${url}` }, 404, "Not Found");
});

function jsonResponse(payload: unknown, status: number = 200, statusText: string = "OK"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: async () => payload,
  } as unknown as Response;
}

function makeServer(id: string, name: string): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

type PoolHarness = {
  getPool: () => ReturnType<HookModule["useConnectionPool"]>;
  updateServers: (nextServers: ServerProfile[]) => Promise<void>;
  act: TestRendererModule["act"];
  flush: () => Promise<void>;
  waitFor: (predicate: () => boolean, label: string) => Promise<void>;
  unmount: () => Promise<void>;
};

async function mountPool(servers: ServerProfile[]): Promise<PoolHarness> {
  vi.resetModules();

  const React = await import("react");
  const testRenderer = (await import("react-test-renderer")) as TestRendererModule;
  const { useConnectionPool } = (await import("./useConnectionPool")) as HookModule;

  let latestPool: ReturnType<HookModule["useConnectionPool"]> | null = null;
  let latestServers = servers;

  function Harness({ list }: { list: ServerProfile[] }) {
    latestPool = useConnectionPool({
      servers: list,
      enabled: true,
      initialFocusedServerId: list[0]?.id ?? null,
    });
    return null;
  }

  let renderer: ReturnType<TestRendererModule["create"]> | null = null;
  await testRenderer.act(async () => {
    renderer = testRenderer.create(React.createElement(Harness, { list: servers }));
  });

  const flush = async () => {
    await testRenderer.act(async () => {
      await Promise.resolve();
    });
  };

  const waitFor = async (predicate: () => boolean, label: string) => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (predicate()) {
        return;
      }
      await flush();
      await testRenderer.act(async () => {
        await vi.advanceTimersByTimeAsync(25);
      });
    }
    throw new Error(`Timed out waiting for ${label}`);
  };

  const getPool = () => {
    if (!latestPool) {
      throw new Error("Connection pool not initialized yet.");
    }
    return latestPool;
  };

  const unmount = async () => {
    if (!renderer) {
      return;
    }
    await testRenderer.act(async () => {
      renderer?.unmount();
    });
  };

  const updateServers = async (nextServers: ServerProfile[]) => {
    latestServers = nextServers;
    await testRenderer.act(async () => {
      renderer?.update(React.createElement(Harness, { list: latestServers }));
    });
  };

  return {
    getPool,
    updateServers,
    act: testRenderer.act,
    flush,
    waitFor,
    unmount,
  };
}

function wsFor(serverId: string): FakeWebSocket | undefined {
  return FakeWebSocket.instances.find((ws) => ws.url.includes(`${serverId}.novaremote.test`));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.reset();
  fetchMock.mockClear();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("WebSocket", FakeWebSocket as unknown as typeof WebSocket);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useConnectionPool websocket integration", () => {
  it("creates live websocket streams for multiple servers and keeps output isolated", async () => {
    const harness = await mountPool([makeServer("dgx", "DGX"), makeServer("homelab", "Homelab")]);

    await harness.waitFor(() => FakeWebSocket.instances.length === 2, "two active websocket instances");

    const dgxWs = wsFor("dgx");
    const homelabWs = wsFor("homelab");

    expect(dgxWs).toBeDefined();
    expect(homelabWs).toBeDefined();
    expect(dgxWs?.options?.headers?.Authorization).toBe("Bearer dgx-token");
    expect(homelabWs?.options?.headers?.Authorization).toBe("Bearer homelab-token");

    await harness.act(async () => {
      dgxWs?.emitOpen();
      homelabWs?.emitOpen();
    });
    await harness.act(async () => {
      dgxWs?.emitMessage({ type: "snapshot", session: "main", data: "dgx line 1\n" });
      dgxWs?.emitMessage({ type: "delta", session: "main", data: "dgx line 2\n" });
      homelabWs?.emitMessage({ type: "snapshot", session: "main", data: "lab line 1\n" });
    });

    const pool = harness.getPool();
    expect(pool.connections.get("dgx")?.tails.main).toBe("dgx line 1\ndgx line 2\n");
    expect(pool.connections.get("homelab")?.tails.main).toBe("lab line 1\n");
    expect(pool.connections.get("dgx")?.streamLive.main).toBe(true);
    expect(pool.connections.get("homelab")?.streamLive.main).toBe(true);
    expect(dgxWs?.sentFrames).toContain(JSON.stringify({ type: "auth", token: "dgx-token" }));

    await harness.unmount();
  });

  it("reconnects closed streams with backoff and preserves other server streams", async () => {
    const harness = await mountPool([makeServer("dgx", "DGX"), makeServer("cloud", "Cloud")]);

    await harness.waitFor(() => FakeWebSocket.instances.length === 2, "initial websocket instances");

    const dgxWs = wsFor("dgx");
    const cloudWs = wsFor("cloud");
    await harness.act(async () => {
      dgxWs?.emitOpen();
      cloudWs?.emitOpen();
    });

    const initialCount = FakeWebSocket.instances.length;
    await harness.act(async () => {
      dgxWs?.emitClose();
    });

    let pool = harness.getPool();
    expect(pool.connections.get("dgx")?.connectionMeta.main?.state).toBe("reconnecting");
    expect(pool.connections.get("dgx")?.connectionMeta.main?.retryCount).toBe(1);
    expect(pool.connections.get("cloud")?.streamLive.main).toBe(true);

    await harness.act(async () => {
      await vi.advanceTimersByTimeAsync(99);
    });
    expect(FakeWebSocket.instances.length).toBe(initialCount);

    await harness.act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    await harness.waitFor(
      () => FakeWebSocket.instances.length >= initialCount + 1,
      "reconnect websocket after backoff"
    );

    const retryWs = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    expect(retryWs.url).toContain("dgx.novaremote.test");
    await harness.act(async () => {
      retryWs.emitOpen();
    });

    pool = harness.getPool();
    expect(pool.connections.get("dgx")?.streamLive.main).toBe(true);
    expect(pool.connections.get("dgx")?.connectionMeta.main?.retryCount).toBe(0);
    expect(pool.connections.get("cloud")?.streamLive.main).toBe(true);

    await harness.unmount();
  });

  it("adds and removes servers while syncing pool entries and stream cleanup", async () => {
    const dgx = makeServer("dgx", "DGX");
    const lab = makeServer("lab", "Lab");
    const harness = await mountPool([dgx]);

    await harness.waitFor(() => FakeWebSocket.instances.length === 1, "initial single websocket");
    expect(harness.getPool().connections.has(dgx.id)).toBe(true);
    expect(harness.getPool().connections.has(lab.id)).toBe(false);

    await harness.updateServers([dgx, lab]);
    await harness.waitFor(() => FakeWebSocket.instances.length >= 2, "websocket for newly added server");
    expect(harness.getPool().connections.has(lab.id)).toBe(true);

    const labWs = wsFor("lab");
    expect(labWs).toBeDefined();
    await harness.updateServers([dgx]);
    await harness.waitFor(() => !harness.getPool().connections.has(lab.id), "removed server pool entry");
    expect(labWs?.readyState).toBe(FakeWebSocket.CLOSED);

    await harness.unmount();
  });

  it("reconnects a server when baseUrl/token fingerprint changes", async () => {
    const original = makeServer("dgx", "DGX");
    const changed: ServerProfile = {
      ...original,
      baseUrl: "https://dgx-v2.novaremote.test",
      token: "dgx-token-v2",
    };

    const harness = await mountPool([original]);
    await harness.waitFor(() => FakeWebSocket.instances.length === 1, "initial websocket for original server");
    const firstWs = FakeWebSocket.instances[0];
    expect(firstWs.url).toContain("dgx.novaremote.test");

    await harness.updateServers([changed]);
    await harness.waitFor(
      () => FakeWebSocket.instances.some((instance) => instance.url.includes("dgx-v2.novaremote.test")),
      "replacement websocket after server fingerprint change"
    );

    const nextWs = FakeWebSocket.instances.find((instance) => instance.url.includes("dgx-v2.novaremote.test"));
    expect(nextWs).toBeDefined();
    expect(nextWs?.options?.headers?.Authorization).toBe("Bearer dgx-token-v2");
    expect(firstWs.readyState).toBe(FakeWebSocket.CLOSED);

    await harness.unmount();
  });

  it("ignores servers without credentials and only connects valid servers", async () => {
    const valid = makeServer("dgx", "DGX");
    const missingToken: ServerProfile = {
      ...makeServer("lab", "Lab"),
      token: "   ",
    };

    const harness = await mountPool([valid, missingToken]);
    await harness.waitFor(() => FakeWebSocket.instances.length === 1, "single websocket for only valid server");

    const pool = harness.getPool();
    expect(pool.connections.get("dgx")?.connected).toBe(true);
    expect(pool.connections.get("lab")?.connected).toBe(false);
    expect(pool.connections.get("lab")?.status).toBe("disconnected");
    expect(wsFor("lab")).toBeUndefined();

    await harness.unmount();
  });
});
