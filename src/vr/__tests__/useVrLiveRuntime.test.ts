import React from "react";
import * as SecureStore from "expo-secure-store";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerCapabilities, ServerConnection, ServerProfile } from "../../types";
import { VrTerminalApiBasePath } from "../contracts";
import { VrSessionClient } from "../sessionClient";
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
}): VrSessionClient {
  return {
    listSessions: vi.fn(async () => []),
    createSession: vi.fn(async () => undefined),
    send: args.sendMock,
    ctrl: args.ctrlMock || (vi.fn(async () => undefined) as VrSessionClient["ctrl"]),
    tail: vi.fn(async () => ""),
    health: vi.fn(async () => ({ ok: true, latencyMs: 12 })),
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
        sessionClient: buildSessionClient({ sendMock, ctrlMock }),
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
      renderer?.unmount();
    });
  });
});
