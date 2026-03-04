import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createVrStreamPool } from "../streamPool";

type MessageType = "snapshot" | "delta" | "session_closed" | "error";

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readonly url: string;
  readonly options?: { headers?: Record<string, string> };
  readyState = FakeWebSocket.CONNECTING;
  onopen: ((event?: unknown) => void) | null = null;
  onclose: ((event?: unknown) => void) | null = null;
  onerror: ((event?: unknown) => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  sentFrames: string[] = [];

  constructor(url: string, _protocols?: string | string[], options?: { headers?: Record<string, string> }) {
    this.url = url;
    this.options = options;
    FakeWebSocket.instances.push(this);
  }

  static reset() {
    FakeWebSocket.instances = [];
  }

  send(payload: string) {
    this.sentFrames.push(payload);
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

  emitMessage(type: MessageType, session: string, data: string) {
    this.onmessage?.({
      data: JSON.stringify({
        type,
        session,
        data,
      }),
    });
  }
}

function wsFor(serverId: string): FakeWebSocket | undefined {
  return FakeWebSocket.instances.find((instance) => instance.url.includes(`${serverId}.novaremote.test`));
}

beforeEach(() => {
  vi.useFakeTimers();
  FakeWebSocket.reset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createVrStreamPool", () => {
  it("opens isolated streams across servers and routes output to matching callbacks", () => {
    const dgxOutput: string[] = [];
    const homeOutput: string[] = [];
    const pool = createVrStreamPool({
      websocketCtor: FakeWebSocket as unknown as typeof WebSocket,
    });

    pool.openStream({
      server: { id: "dgx", baseUrl: "https://dgx.novaremote.test", token: "dgx-token" },
      basePath: "/tmux",
      session: "main",
      callbacks: {
        onSnapshot: (output) => {
          dgxOutput.push(output);
        },
        onDelta: (delta) => {
          dgxOutput.push(delta);
        },
      },
    });
    pool.openStream({
      server: { id: "home", baseUrl: "https://home.novaremote.test", token: "home-token" },
      basePath: "/tmux",
      session: "main",
      callbacks: {
        onSnapshot: (output) => {
          homeOutput.push(output);
        },
        onDelta: (delta) => {
          homeOutput.push(delta);
        },
      },
    });

    expect(FakeWebSocket.instances).toHaveLength(2);
    const dgxWs = wsFor("dgx");
    const homeWs = wsFor("home");
    expect(dgxWs?.options?.headers?.Authorization).toBe("Bearer dgx-token");
    expect(homeWs?.options?.headers?.Authorization).toBe("Bearer home-token");

    dgxWs?.emitOpen();
    homeWs?.emitOpen();
    dgxWs?.emitMessage("snapshot", "main", "dgx line 1\n");
    dgxWs?.emitMessage("delta", "main", "dgx line 2\n");
    homeWs?.emitMessage("snapshot", "main", "home line 1\n");

    expect(dgxOutput).toEqual(["dgx line 1\n", "dgx line 2\n"]);
    expect(homeOutput).toEqual(["home line 1\n"]);
    expect(dgxWs?.sentFrames).toContain(JSON.stringify({ type: "auth", token: "dgx-token" }));
    expect(homeWs?.sentFrames).toContain(JSON.stringify({ type: "auth", token: "home-token" }));
    expect(pool.activeStreamCount()).toBe(2);
  });

  it("reconnects a dropped stream with backoff without affecting siblings", async () => {
    const statuses: Array<{ server: string; status: string; retry: number }> = [];
    const pool = createVrStreamPool({
      websocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      retryBaseMs: 40,
      retryFactor: 1.5,
      maxRetryMs: 200,
    });

    pool.openStream({
      server: { id: "dgx", baseUrl: "https://dgx.novaremote.test", token: "dgx-token" },
      basePath: "/tmux",
      session: "main",
      callbacks: {
        onStatus: (status, retry) => {
          statuses.push({ server: "dgx", status, retry });
        },
      },
    });
    pool.openStream({
      server: { id: "home", baseUrl: "https://home.novaremote.test", token: "home-token" },
      basePath: "/tmux",
      session: "main",
      callbacks: {
        onStatus: (status, retry) => {
          statuses.push({ server: "home", status, retry });
        },
      },
    });

    const dgxWs = wsFor("dgx");
    const homeWs = wsFor("home");
    dgxWs?.emitOpen();
    homeWs?.emitOpen();
    const initialCount = FakeWebSocket.instances.length;
    expect(initialCount).toBe(2);

    dgxWs?.emitClose();
    expect(pool.activeStreamCount()).toBe(1);
    expect(statuses.some((entry) => entry.server === "dgx" && entry.status === "reconnecting")).toBe(true);
    expect(homeWs?.readyState).toBe(FakeWebSocket.OPEN);

    await vi.advanceTimersByTimeAsync(45);

    expect(FakeWebSocket.instances.length).toBe(initialCount + 1);
    const retryWs = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    expect(retryWs.url).toContain("dgx.novaremote.test");
  });

  it("stops reconnecting when stream reports session_closed", async () => {
    const onSessionClosed = vi.fn();
    const statuses: Array<{ status: string; retry: number }> = [];
    const pool = createVrStreamPool({
      websocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      retryBaseMs: 30,
      retryFactor: 2,
      maxRetryMs: 100,
    });

    pool.openStream({
      server: { id: "dgx", baseUrl: "https://dgx.novaremote.test", token: "dgx-token" },
      basePath: "/tmux",
      session: "main",
      callbacks: {
        onSessionClosed,
        onStatus: (status, retry) => {
          statuses.push({ status, retry });
        },
      },
    });
    const dgxWs = wsFor("dgx");
    dgxWs?.emitOpen();
    dgxWs?.emitMessage("session_closed", "main", "");

    expect(onSessionClosed).toHaveBeenCalledTimes(1);
    expect(pool.trackedStreamCount()).toBe(0);

    const instancesBeforeAdvance = FakeWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(200);
    expect(FakeWebSocket.instances.length).toBe(instancesBeforeAdvance);
    expect(statuses.some((entry) => entry.status === "disconnected")).toBe(true);
  });

  it("pauses and resumes reconnectable streams", () => {
    const statuses: Array<{ status: string; retry: number }> = [];
    const pool = createVrStreamPool({
      websocketCtor: FakeWebSocket as unknown as typeof WebSocket,
      retryBaseMs: 20,
      retryFactor: 2,
      maxRetryMs: 100,
    });

    pool.openStream({
      server: { id: "dgx", baseUrl: "https://dgx.novaremote.test", token: "dgx-token" },
      basePath: "/tmux",
      session: "main",
      callbacks: {
        onStatus: (status, retry) => {
          statuses.push({ status, retry });
        },
      },
    });
    wsFor("dgx")?.emitOpen();
    expect(pool.activeStreamCount()).toBe(1);

    pool.pause();
    expect(pool.isPaused()).toBe(true);
    expect(pool.activeStreamCount()).toBe(0);

    const countAfterPause = FakeWebSocket.instances.length;
    pool.resume();
    expect(pool.isPaused()).toBe(false);
    expect(FakeWebSocket.instances.length).toBe(countAfterPause + 1);
    expect(statuses.some((entry) => entry.status === "disconnected")).toBe(true);
  });
});
