import React from "react";
import * as SecureStore from "expo-secure-store";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerCapabilities, ServerConnection, ServerProfile } from "../../types";
import { VrTerminalApiBasePath } from "../contracts";
import { VrSessionClient } from "../sessionClient";
import { VrStreamPool } from "../streamPool";
import { buildVrPanelId } from "../useVrWorkspace";
import { useVrLiveRuntime } from "../useVrLiveRuntime";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock("../../constants", () => ({
  STORAGE_VR_WORKSPACE_PREFIX: "novaremote.vr_workspace.v1",
}));

const CAPABILITIES: ServerCapabilities = {
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
};

function makeServer(id: string, name: string): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

function makeConnection(
  server: ServerProfile,
  sessions: string[],
  overrides: Partial<ServerConnection> = {}
): ServerConnection {
  return {
    server,
    connected: true,
    capabilities: CAPABILITIES,
    terminalApiBasePath: "/tmux",
    capabilitiesLoading: false,
    allSessions: sessions,
    localAiSessions: [],
    openSessions: sessions,
    tails: {},
    drafts: {},
    sendBusy: {},
    sendModes: {},
    streamLive: {},
    connectionMeta: {},
    health: {
      lastPingAt: null,
      latencyMs: null,
      activeStreams: sessions.length,
      openSessions: sessions.length,
    },
    status: "connected",
    lastError: null,
    activeStreamCount: sessions.length,
    ...overrides,
  };
}

function buildSessionClient(args: {
  sendMock: (
    server: Parameters<VrSessionClient["send"]>[0],
    basePath: VrTerminalApiBasePath,
    session: string,
    text: string,
    enter?: boolean
  ) => Promise<void>;
  ctrlMock?: (
    server: Parameters<VrSessionClient["ctrl"]>[0],
    basePath: VrTerminalApiBasePath,
    session: string,
    key: string
  ) => Promise<void>;
  stopSessionMock?: (
    server: Parameters<VrSessionClient["stopSession"]>[0],
    basePath: VrTerminalApiBasePath,
    session: string
  ) => Promise<void>;
  openOnMacMock?: (
    server: Parameters<VrSessionClient["openOnMac"]>[0],
    session: string
  ) => Promise<void>;
  listSessionsMock?: (
    server: Parameters<VrSessionClient["listSessions"]>[0],
    basePath: VrTerminalApiBasePath
  ) => Promise<ReturnType<VrSessionClient["listSessions"]> extends Promise<infer T> ? T : never>;
  createSessionMock?: (
    server: Parameters<VrSessionClient["createSession"]>[0],
    basePath: VrTerminalApiBasePath,
    session: string,
    cwd: string
  ) => Promise<void>;
  tailMock?: (
    server: Parameters<VrSessionClient["tail"]>[0],
    basePath: VrTerminalApiBasePath,
    session: string,
    lines?: number
  ) => Promise<string>;
  healthMock?: (
    server: Parameters<VrSessionClient["health"]>[0]
  ) => Promise<{ ok: boolean; latencyMs: number | null }>;
}): VrSessionClient {
  return {
    listSessions: args.listSessionsMock || (vi.fn(async () => []) as VrSessionClient["listSessions"]),
    createSession: args.createSessionMock || (vi.fn(async () => undefined) as VrSessionClient["createSession"]),
    send: args.sendMock,
    ctrl: args.ctrlMock || (vi.fn(async () => undefined) as VrSessionClient["ctrl"]),
    stopSession: args.stopSessionMock || (vi.fn(async () => undefined) as VrSessionClient["stopSession"]),
    openOnMac: args.openOnMacMock || (vi.fn(async () => undefined) as VrSessionClient["openOnMac"]),
    tail: args.tailMock || (vi.fn(async () => "") as VrSessionClient["tail"]),
    health: args.healthMock || (vi.fn(async () => ({ ok: true, latencyMs: 12 })) as VrSessionClient["health"]),
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;
const getItemAsyncMock = vi.mocked(SecureStore.getItemAsync);
const setItemAsyncMock = vi.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  getItemAsyncMock.mockResolvedValue(null);
  setItemAsyncMock.mockResolvedValue(undefined);
  getItemAsyncMock.mockClear();
  setItemAsyncMock.mockClear();
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("useVrLiveRuntime", () => {
  it("routes runtime stream subscriptions through the VR stream pool with pooled base paths", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"], { terminalApiBasePath: "/terminal" })],
    ]);
    const sendMock = vi.fn<
      (
        server: Parameters<VrSessionClient["send"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        text: string,
        enter?: boolean
      ) => Promise<void>
    >(async () => undefined);
    const openStream = vi.fn(() => "dgx::main");
    const closeStream = vi.fn();
    const closeServer = vi.fn();
    const closeAll = vi.fn();
    const pause = vi.fn();
    const resume = vi.fn();
    const trackedStreamCount = vi.fn(() => 2);
    const activeStreamCount = vi.fn(() => 1);
    const isPaused = vi.fn(() => false);

    const streamPoolMock: VrStreamPool = {
      openStream,
      closeStream,
      closeServer,
      closeAll,
      pause,
      resume,
      trackedStreamCount,
      activeStreamCount,
      isPaused,
    };

    let latest: ReturnType<typeof useVrLiveRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Runtime not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrLiveRuntime({
        connections,
        sessionClient: buildSessionClient({ sendMock }),
        streamPool: streamPoolMock,
        maxPanels: 2,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const onDelta = vi.fn();
    const streamKey = current().subscribeServerSessionStream("dgx", "main", { onDelta });
    expect(streamKey).toBe("dgx::main");
    expect(openStream).toHaveBeenCalledWith({
      server: {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      basePath: "/terminal",
      session: "main",
      callbacks: {
        onDelta,
      },
    });

    current().unsubscribeServerSessionStream("dgx", "main");
    expect(closeStream).toHaveBeenCalledWith("dgx", "main");
    current().pauseServerStreams();
    expect(pause).toHaveBeenCalledTimes(1);
    current().resumeServerStreams();
    expect(resume).toHaveBeenCalledTimes(1);
    current().closeServerStreams("dgx");
    expect(closeServer).toHaveBeenCalledWith("dgx");
    current().closeAllServerStreams();
    expect(closeAll).toHaveBeenCalledTimes(1);
    expect(current().getStreamPoolSnapshot()).toEqual({
      paused: false,
      tracked: 2,
      active: 1,
      managed: 0,
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes send actions through the live VR session client with pooled base path", async () => {
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Homelab");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build"], { terminalApiBasePath: "/terminal" })],
    ]);
    const sendMock = vi.fn<
      (
        server: Parameters<VrSessionClient["send"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        text: string,
        enter?: boolean
      ) => Promise<void>
    >(async () => undefined);

    let latest: ReturnType<typeof useVrLiveRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Runtime not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrLiveRuntime({
        connections,
        sessionClient: buildSessionClient({ sendMock }),
        maxPanels: 4,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await current().dispatchVoice("npm run build", {
        targetPanelId: buildVrPanelId("home", "build"),
      });
    });

    expect(sendMock).toHaveBeenCalledWith(
      {
        id: "home",
        name: "Homelab",
        baseUrl: "https://home.novaremote.test",
        token: "home-token",
      },
      "/terminal",
      "build",
      "npm run build",
      true
    );
    expect(current().hudStatus?.message).toContain("Sent to home/build");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("syncs and clears managed workspace panel streams", async () => {
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Home");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build"])],
    ]);
    const sendMock = vi.fn<
      (
        server: Parameters<VrSessionClient["send"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        text: string,
        enter?: boolean
      ) => Promise<void>
    >(async () => undefined);
    const openStream = vi.fn((args: { server: { id: string }; session: string }) => `${args.server.id}::${args.session}`);
    const closeStream = vi.fn();
    const closeServer = vi.fn();
    const closeAll = vi.fn();
    const pause = vi.fn();
    const resume = vi.fn();
    const trackedStreamCount = vi.fn(() => 4);
    const activeStreamCount = vi.fn(() => 3);
    const isPaused = vi.fn(() => false);

    const streamPoolMock: VrStreamPool = {
      openStream,
      closeStream,
      closeServer,
      closeAll,
      pause,
      resume,
      trackedStreamCount,
      activeStreamCount,
      isPaused,
    };

    let latest: ReturnType<typeof useVrLiveRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Runtime not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrLiveRuntime({
        connections,
        sessionClient: buildSessionClient({ sendMock }),
        streamPool: streamPoolMock,
        maxPanels: 4,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const onDelta = vi.fn();
    current().syncWorkspacePanelStreams({ onDelta });
    expect(openStream).toHaveBeenCalledTimes(2);
    expect(current().getStreamPoolSnapshot()).toEqual({
      paused: false,
      tracked: 4,
      active: 3,
      managed: 2,
    });

    const firstPanelId = current().workspace.panels[0]?.id || null;
    expect(firstPanelId).toBeTruthy();
    if (firstPanelId) {
      current().syncWorkspacePanelStreams({ onDelta }, [firstPanelId]);
    }
    expect(closeStream).toHaveBeenCalledTimes(1);
    expect(current().getStreamPoolSnapshot().managed).toBe(1);

    current().clearWorkspacePanelStreams();
    expect(closeStream).toHaveBeenCalledTimes(2);
    expect(current().getStreamPoolSnapshot().managed).toBe(0);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("applies layout presets from voice and gesture dispatch without transport calls", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
    ]);
    const sendMock = vi.fn<
      (
        server: Parameters<VrSessionClient["send"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        text: string,
        enter?: boolean
      ) => Promise<void>
    >(async () => undefined);

    let latest: ReturnType<typeof useVrLiveRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Runtime not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrLiveRuntime({
        connections,
        sessionClient: buildSessionClient({ sendMock }),
        maxPanels: 3,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await current().dispatchVoice("layout grid");
    });
    expect(current().workspace.preset).toBe("grid");
    expect(current().hudStatus?.message).toContain("Layout preset grid");
    expect(sendMock).toHaveBeenCalledTimes(0);

    await act(async () => {
      current().dispatchGesture({ kind: "snap_layout", preset: "cockpit" });
    });
    expect(current().workspace.preset).toBe("cockpit");
    expect(current().hudStatus?.message).toContain("Snapped layout cockpit");
    expect(sendMock).toHaveBeenCalledTimes(0);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes control voice actions through the live VR ctrl transport", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
    ]);
    const sendMock = vi.fn<
      (
        server: Parameters<VrSessionClient["send"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        text: string,
        enter?: boolean
      ) => Promise<void>
    >(async () => undefined);
    const ctrlMock = vi.fn<
      (
        server: Parameters<VrSessionClient["ctrl"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        key: string
      ) => Promise<void>
    >(async () => undefined);
    const stopSessionMock = vi.fn<
      (
        server: Parameters<VrSessionClient["stopSession"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string
      ) => Promise<void>
    >(async () => undefined);
    const openOnMacMock = vi.fn<
      (
        server: Parameters<VrSessionClient["openOnMac"]>[0],
        session: string
      ) => Promise<void>
    >(async () => undefined);
    const onReconnectServer = vi.fn(async () => undefined);
    const onReconnectServers = vi.fn(async () => undefined);
    const onCreateAgent = vi.fn(async () => true);
    const onSetAgentGoal = vi.fn(async () => 1);
    const onQueueAgentCommand = vi.fn(async () => 1);
    const onApproveReadyAgents = vi.fn(async () => ["agent-a", "agent-b"]);
    const onDenyAllPendingAgents = vi.fn(async () => ["agent-a"]);
    const onDisconnectAllServers = vi.fn(async () => undefined);
    const onConnectAllServers = vi.fn(async () => undefined);

    let latest: ReturnType<typeof useVrLiveRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Runtime not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrLiveRuntime({
        connections,
        sessionClient: buildSessionClient({ sendMock, ctrlMock, stopSessionMock, openOnMacMock }),
        maxPanels: 3,
        onReconnectServer,
        onReconnectServers,
        onCreateAgent,
        onSetAgentGoal,
        onQueueAgentCommand,
        onApproveReadyAgents,
        onDenyAllPendingAgents,
        onDisconnectAllServers,
        onConnectAllServers,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await current().dispatchVoice("interrupt");
    });

    expect(ctrlMock).toHaveBeenCalledWith(
      {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      "/tmux",
      "main",
      "C-c"
    );
    expect(current().hudStatus?.message).toContain("Sent C-c to dgx/main");
    expect(sendMock).toHaveBeenCalledTimes(0);

    await act(async () => {
      await current().dispatchVoice("stop session");
    });
    expect(stopSessionMock).toHaveBeenCalledWith(
      {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      "/tmux",
      "main"
    );
    expect(current().hudStatus?.message).toContain("Stopped dgx/main");

    await act(async () => {
      await current().dispatchVoice("open on mac");
    });
    expect(openOnMacMock).toHaveBeenCalledWith(
      {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      "main"
    );
    expect(current().hudStatus?.message).toContain("Opened dgx/main on Mac");

    await act(async () => {
      await current().dispatchVoice("reconnect dgx");
    });
    expect(onReconnectServer).toHaveBeenCalledWith("dgx");
    expect(current().hudStatus?.message).toContain("Reconnect queued for dgx");

    await act(async () => {
      await current().dispatchVoice("reconnect all");
    });
    expect(onReconnectServers).toHaveBeenCalledWith(["dgx"]);
    expect(current().hudStatus?.message).toContain("Reconnect queued for 1 servers");

    await act(async () => {
      await current().dispatchVoice("create agent build watcher");
    });
    expect(onCreateAgent).toHaveBeenCalledWith(["dgx"], "build watcher");
    expect(current().hudStatus?.message).toContain("Created 1 agent named build watcher");

    await act(async () => {
      await current().dispatchVoice("set agent build watcher goal npm run test");
    });
    expect(onSetAgentGoal).toHaveBeenCalledWith(["dgx"], "build watcher", "npm run test");
    expect(current().hudStatus?.message).toContain("Updated goal for 1 agent");

    await act(async () => {
      await current().dispatchVoice("agent build watcher run npm run test");
    });
    expect(onQueueAgentCommand).toHaveBeenCalledWith(["dgx"], "build watcher", "npm run test");
    expect(current().hudStatus?.message).toContain("Queued 1 pending approval for build watcher");

    await act(async () => {
      await current().dispatchVoice("approve ready agents");
    });
    expect(onApproveReadyAgents).toHaveBeenCalledWith(["dgx"]);
    expect(current().hudStatus?.message).toContain("Approved 2 ready agent approvals");

    await act(async () => {
      await current().dispatchVoice("deny all pending agents");
    });
    expect(onDenyAllPendingAgents).toHaveBeenCalledWith(["dgx"]);
    expect(current().hudStatus?.message).toContain("Denied 1 pending agent approval");

    await act(async () => {
      current().dispatchGesture({ kind: "approve_agents", scope: "focused" });
      await Promise.resolve();
    });
    expect(onApproveReadyAgents).toHaveBeenCalledWith(["dgx"]);
    expect(current().hudStatus?.message).toContain("Approved 2 ready agent approvals");

    await act(async () => {
      current().dispatchGesture({ kind: "deny_agents", scope: "all" });
      await Promise.resolve();
    });
    expect(onDenyAllPendingAgents).toHaveBeenCalledWith(["dgx"]);
    expect(current().hudStatus?.message).toContain("Denied 1 pending agent approval");

    await act(async () => {
      await current().dispatchVoice("pause pool");
    });
    expect(onDisconnectAllServers).toHaveBeenCalledTimes(1);
    expect(current().hudStatus?.message).toContain("Connection pool paused");

    await act(async () => {
      await current().dispatchVoice("resume pool");
    });
    expect(onConnectAllServers).toHaveBeenCalledTimes(1);
    expect(current().hudStatus?.message).toContain("Connection pool resumed");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("exposes direct live runtime session and health adapter methods", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
    ]);
    const sendMock = vi.fn<
      (
        server: Parameters<VrSessionClient["send"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        text: string,
        enter?: boolean
      ) => Promise<void>
    >(async () => undefined);
    const listSessionsMock = vi.fn<
      (
        server: Parameters<VrSessionClient["listSessions"]>[0],
        basePath: VrTerminalApiBasePath
      ) => Promise<ReturnType<VrSessionClient["listSessions"]> extends Promise<infer T> ? T : never>
    >(async () => [{ name: "main" }, { name: "build" }]);
    const createSessionMock = vi.fn<
      (
        server: Parameters<VrSessionClient["createSession"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        cwd: string
      ) => Promise<void>
    >(async () => undefined);
    const tailMock = vi.fn<
      (
        server: Parameters<VrSessionClient["tail"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        lines?: number
      ) => Promise<string>
    >(async () => "tail-output");
    const stopSessionMock = vi.fn<
      (
        server: Parameters<VrSessionClient["stopSession"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string
      ) => Promise<void>
    >(async () => undefined);
    const openOnMacMock = vi.fn<
      (
        server: Parameters<VrSessionClient["openOnMac"]>[0],
        session: string
      ) => Promise<void>
    >(async () => undefined);
    const healthMock = vi.fn<
      (
        server: Parameters<VrSessionClient["health"]>[0]
      ) => Promise<{ ok: boolean; latencyMs: number | null }>
    >(async () => ({ ok: true, latencyMs: 17 }));

    let latest: ReturnType<typeof useVrLiveRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Runtime not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrLiveRuntime({
        connections,
        sessionClient: buildSessionClient({
          sendMock,
          listSessionsMock,
          createSessionMock,
          tailMock,
          stopSessionMock,
          openOnMacMock,
          healthMock,
        }),
        maxPanels: 3,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    await expect(current().listServerSessions("dgx")).resolves.toEqual([{ name: "main" }, { name: "build" }]);
    await expect(current().createServerSession("dgx", "build", "/workspace")).resolves.toBeUndefined();
    await expect(current().stopServerSession("dgx", "main")).resolves.toBeUndefined();
    await expect(current().openServerOnMac("dgx", "main")).resolves.toBeUndefined();
    await expect(current().fetchServerTail("dgx", "main", 120)).resolves.toBe("tail-output");
    await expect(current().pingServerHealth("dgx")).resolves.toEqual({ ok: true, latencyMs: 17 });

    expect(listSessionsMock).toHaveBeenCalledWith(
      {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      "/tmux"
    );
    expect(createSessionMock).toHaveBeenCalledWith(
      {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      "/tmux",
      "build",
      "/workspace"
    );
    expect(tailMock).toHaveBeenCalledWith(
      {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      "/tmux",
      "main",
      120
    );
    expect(stopSessionMock).toHaveBeenCalledWith(
      {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      "/tmux",
      "main"
    );
    expect(openOnMacMock).toHaveBeenCalledWith(
      {
        id: "dgx",
        name: "DGX",
        baseUrl: "https://dgx.novaremote.test",
        token: "dgx-token",
      },
      "main"
    );
    expect(healthMock).toHaveBeenCalledWith({
      id: "dgx",
      name: "DGX",
      baseUrl: "https://dgx.novaremote.test",
      token: "dgx-token",
    });
    expect(sendMock).toHaveBeenCalledTimes(0);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("fans out all-server agent lifecycle voice actions across pooled targets", async () => {
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Homelab");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build-01"])],
    ]);
    const sendMock = vi.fn<
      (
        server: Parameters<VrSessionClient["send"]>[0],
        basePath: VrTerminalApiBasePath,
        session: string,
        text: string
      ) => Promise<void>
    >(async () => undefined);
    const onCreateAgent = vi.fn(async () => 2);
    const onSetAgentGoal = vi.fn(async () => 2);

    let latest: ReturnType<typeof useVrLiveRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Runtime not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrLiveRuntime({
        connections,
        sessionClient: buildSessionClient({ sendMock }),
        maxPanels: 4,
        onCreateAgent,
        onSetAgentGoal,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await current().dispatchVoice("create agent deploy bot for all servers");
    });
    expect(onCreateAgent).toHaveBeenCalledWith(["dgx", "home"], "deploy bot");
    expect(current().hudStatus?.message).toContain("Created 2 agents named deploy bot");

    await act(async () => {
      await current().dispatchVoice("set agent deploy bot goal npm run deploy for all servers");
    });
    expect(onSetAgentGoal).toHaveBeenCalledWith(["dgx", "home"], "deploy bot", "npm run deploy");
    expect(current().hudStatus?.message).toContain("Updated goal for 2 agents");
    expect(sendMock).toHaveBeenCalledTimes(0);

    await act(async () => {
      renderer?.unmount();
    });
  });
});
