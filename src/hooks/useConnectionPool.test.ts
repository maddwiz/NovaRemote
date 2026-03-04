import { describe, expect, it, vi } from "vitest";

vi.mock("../constants", () => ({
  DEFAULT_CWD: "/workspace",
  POOL_HEALTH_INTERVAL_MS: 8000,
  POOL_MAX_RECONNECT_DELAY_MS: 12000,
  POLL_INTERVAL_MS: 1400,
  STREAM_RETRY_BASE_MS: 900,
  STREAM_RETRY_FACTOR: 1.8,
  isLikelyAiSession: () => false,
  makeLocalLlmSessionName: () => "local-ai-test-session",
  makeShellSessionName: () => "shell-test-session",
  sortByCreatedAt: (sessions: Array<{ name: string }>) => sessions,
}));

import { ServerProfile, TmuxStreamMessage } from "../types";
import { connectionPoolTestUtils } from "./useConnectionPool";

function makeServer(id: string, name: string): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

function makeReadyPoolState(...servers: ServerProfile[]) {
  const actions = servers.flatMap((server) => [
    { type: "UPSERT_SERVER" as const, server },
    {
      type: "SET_CAPABILITIES" as const,
      serverId: server.id,
      capabilities: { ...connectionPoolTestUtils.emptyCapabilities },
      terminalApiBasePath: "/tmux" as const,
    },
    {
      type: "SET_SESSIONS" as const,
      serverId: server.id,
      allSessions: ["main"],
      openSessions: ["main"],
    },
  ]);

  return connectionPoolTestUtils.reduceActions({}, actions);
}

describe("useConnectionPool multi-server reducer flows", () => {
  it("routes websocket stream output to the targeted server only", () => {
    const dgx = makeServer("dgx", "DGX");
    const homelab = makeServer("homelab", "Homelab");
    const initial = makeReadyPoolState(dgx, homelab);

    const snapshot: TmuxStreamMessage = { type: "snapshot", session: "main", data: "dgx-1\n" };
    const delta: TmuxStreamMessage = { type: "delta", session: "main", data: "dgx-2\n" };

    const afterSnapshot = connectionPoolTestUtils.reduceStreamMessage(initial, dgx.id, "main", snapshot, 100).state;
    const afterDelta = connectionPoolTestUtils.reduceStreamMessage(afterSnapshot, dgx.id, "main", delta, 120).state;

    expect(afterDelta[dgx.id]?.tails.main).toBe("dgx-1\ndgx-2\n");
    expect(afterDelta[dgx.id]?.connectionMeta.main?.state).toBe("connected");
    expect(afterDelta[dgx.id]?.connectionMeta.main?.lastMessageAt).toBe(120);

    expect(afterDelta[homelab.id]?.tails.main).toBeUndefined();
    expect(afterDelta[homelab.id]?.connectionMeta.main).toBeUndefined();
  });

  it("ignores stream payloads when the incoming session does not match", () => {
    const dgx = makeServer("dgx", "DGX");
    const initial = makeReadyPoolState(dgx);

    const wrongSession: TmuxStreamMessage = { type: "delta", session: "build", data: "ignored\n" };
    const result = connectionPoolTestUtils.reduceStreamMessage(initial, dgx.id, "main", wrongSession, 200);

    expect(result.state).toBe(initial);
    expect(result.closeRequested).toBe(false);
    expect(result.errorMessage).toBeNull();
  });

  it("handles session_closed for one server without mutating sibling servers", () => {
    const dgx = makeServer("dgx", "DGX");
    const cloud = makeServer("cloud", "Cloud");

    const initial = connectionPoolTestUtils.reduceActions(makeReadyPoolState(dgx, cloud), [
      { type: "SET_TAIL", serverId: dgx.id, session: "main", output: "dgx tail\n" },
      { type: "SET_TAIL", serverId: cloud.id, session: "main", output: "cloud tail\n" },
      { type: "SET_STREAM_LIVE", serverId: dgx.id, session: "main", live: true },
      { type: "SET_STREAM_LIVE", serverId: cloud.id, session: "main", live: true },
    ]);

    const closedMessage: TmuxStreamMessage = { type: "session_closed", session: "main", data: "" };
    const result = connectionPoolTestUtils.reduceStreamMessage(initial, dgx.id, "main", closedMessage, 300);
    const next = result.state;

    expect(result.closeRequested).toBe(true);
    expect(next[dgx.id]?.allSessions).toEqual([]);
    expect(next[dgx.id]?.openSessions).toEqual([]);
    expect(next[dgx.id]?.tails.main).toBeUndefined();
    expect(next[dgx.id]?.streamLive.main).toBeUndefined();

    expect(next[cloud.id]?.allSessions).toEqual(["main"]);
    expect(next[cloud.id]?.openSessions).toEqual(["main"]);
    expect(next[cloud.id]?.tails.main).toBe("cloud tail\n");
    expect(next[cloud.id]?.streamLive.main).toBe(true);
  });

  it("tracks stream health per server independently", () => {
    const dgx = makeServer("dgx", "DGX");
    const cloud = makeServer("cloud", "Cloud");

    const connected = connectionPoolTestUtils.reduceActions(makeReadyPoolState(dgx, cloud), [
      { type: "SET_STREAM_LIVE", serverId: dgx.id, session: "main", live: true },
      { type: "SET_STREAM_LIVE", serverId: cloud.id, session: "main", live: true },
    ]);

    expect(connected[dgx.id]?.status).toBe("connected");
    expect(connected[cloud.id]?.status).toBe("connected");
    expect(connected[dgx.id]?.activeStreamCount).toBe(1);
    expect(connected[cloud.id]?.activeStreamCount).toBe(1);

    const degradedOne = connectionPoolTestUtils.reducer(connected, {
      type: "SET_STREAM_LIVE",
      serverId: dgx.id,
      session: "main",
      live: false,
    });

    expect(degradedOne[dgx.id]?.status).toBe("degraded");
    expect(degradedOne[dgx.id]?.activeStreamCount).toBe(0);
    expect(degradedOne[cloud.id]?.status).toBe("connected");
    expect(degradedOne[cloud.id]?.activeStreamCount).toBe(1);
  });

  it("bounds tail output size to the latest 1200 lines for snapshots and deltas", () => {
    const dgx = makeServer("dgx", "DGX");
    const initial = makeReadyPoolState(dgx);

    const snapshotData = Array.from({ length: 1305 }, (_, index) => `line-${index}`).join("\n");
    const afterSnapshot = connectionPoolTestUtils.reduceStreamMessage(
      initial,
      dgx.id,
      "main",
      { type: "snapshot", session: "main", data: snapshotData },
      100
    ).state;

    const snapshotLines = (afterSnapshot[dgx.id]?.tails.main || "").split("\n");
    expect(snapshotLines.length).toBe(1200);
    expect(snapshotLines[0]).toBe("line-105");
    expect(snapshotLines[snapshotLines.length - 1]).toBe("line-1304");

    const deltaData = `\n${Array.from({ length: 10 }, (_, index) => `line-${1305 + index}`).join("\n")}`;
    const afterDelta = connectionPoolTestUtils.reduceStreamMessage(
      afterSnapshot,
      dgx.id,
      "main",
      { type: "delta", session: "main", data: deltaData },
      120
    ).state;

    const deltaLines = (afterDelta[dgx.id]?.tails.main || "").split("\n");
    expect(deltaLines.length).toBe(1200);
    expect(deltaLines[0]).toBe("line-115");
    expect(deltaLines[deltaLines.length - 1]).toBe("line-1314");
  });

  it("keeps reducer identity stable for repeated no-op high-frequency actions", () => {
    const dgx = makeServer("dgx", "DGX");
    const initial = makeReadyPoolState(dgx);

    const withBusy = connectionPoolTestUtils.reducer(initial, {
      type: "SET_SEND_BUSY",
      serverId: dgx.id,
      session: "main",
      busy: true,
    });
    const sameBusy = connectionPoolTestUtils.reducer(withBusy, {
      type: "SET_SEND_BUSY",
      serverId: dgx.id,
      session: "main",
      busy: true,
    });
    expect(sameBusy).toBe(withBusy);

    const withMode = connectionPoolTestUtils.reducer(withBusy, {
      type: "SET_SEND_MODE",
      serverId: dgx.id,
      session: "main",
      mode: "shell",
    });
    const sameMode = connectionPoolTestUtils.reducer(withMode, {
      type: "SET_SEND_MODE",
      serverId: dgx.id,
      session: "main",
      mode: "shell",
    });
    expect(sameMode).toBe(withMode);

    const withStream = connectionPoolTestUtils.reducer(withMode, {
      type: "SET_STREAM_LIVE",
      serverId: dgx.id,
      session: "main",
      live: true,
    });
    const sameStream = connectionPoolTestUtils.reducer(withStream, {
      type: "SET_STREAM_LIVE",
      serverId: dgx.id,
      session: "main",
      live: true,
    });
    expect(sameStream).toBe(withStream);

    const withMeta = connectionPoolTestUtils.reducer(withStream, {
      type: "SET_CONNECTION_META",
      serverId: dgx.id,
      session: "main",
      meta: {
        state: "connected",
        retryCount: 0,
        lastMessageAt: 100,
      },
    });
    const sameMeta = connectionPoolTestUtils.reducer(withMeta, {
      type: "SET_CONNECTION_META",
      serverId: dgx.id,
      session: "main",
      meta: {
        state: "connected",
        retryCount: 0,
        lastMessageAt: 100,
      },
    });
    expect(sameMeta).toBe(withMeta);

    const withHealth = connectionPoolTestUtils.reducer(withMeta, {
      type: "SET_HEALTH",
      serverId: dgx.id,
      lastPingAt: 200,
      latencyMs: 12,
    });
    const sameHealth = connectionPoolTestUtils.reducer(withHealth, {
      type: "SET_HEALTH",
      serverId: dgx.id,
      lastPingAt: 200,
      latencyMs: 12,
    });
    expect(sameHealth).toBe(withHealth);

    const withError = connectionPoolTestUtils.reducer(withHealth, {
      type: "SET_ERROR",
      serverId: dgx.id,
      error: "stream error",
    });
    const sameError = connectionPoolTestUtils.reducer(withError, {
      type: "SET_ERROR",
      serverId: dgx.id,
      error: "stream error",
    });
    expect(sameError).toBe(withError);
  });
});
