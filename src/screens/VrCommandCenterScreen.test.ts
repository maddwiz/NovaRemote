import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useVrLiveRuntimeMock } = vi.hoisted(() => ({
  useVrLiveRuntimeMock: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock("../vr/useVrLiveRuntime", () => ({
  useVrLiveRuntime: (...args: unknown[]) => useVrLiveRuntimeMock(...args),
}));

import { AppProvider } from "../context/AppContext";
import { ServerConnection, ServerProfile } from "../types";
import { VrCommandCenterScreen } from "./VrCommandCenterScreen";

function makeServer(id: string, name: string): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

function makeConnection(server: ServerProfile, openSessions: string[]): ServerConnection {
  return {
    server,
    connected: true,
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
    terminalApiBasePath: "/tmux",
    capabilitiesLoading: false,
    allSessions: openSessions,
    localAiSessions: [],
    openSessions,
    tails: {
      main: "ready",
    },
    drafts: {},
    sendBusy: {},
    sendModes: {},
    streamLive: {},
    connectionMeta: {},
    health: {
      lastPingAt: null,
      latencyMs: null,
      activeStreams: openSessions.length,
      openSessions: openSessions.length,
    },
    status: "connected",
    lastError: null,
    activeStreamCount: openSessions.length,
  };
}

function makeRuntime(overrides: Record<string, unknown> = {}) {
  return {
    workspace: {
      preset: "arc",
      overviewMode: false,
      focusedPanelId: "dgx::main",
      panels: [
        {
          id: "dgx::main",
          serverId: "dgx",
          serverName: "DGX",
          session: "main",
          sessionLabel: "main",
          connected: true,
          output: "main output",
          pinned: false,
          mini: false,
          transform: {
            x: 0,
            y: 1.45,
            z: -1.8,
            yaw: 0,
          },
        },
      ],
      setPreset: vi.fn(),
      setOverviewMode: vi.fn(),
      focusPanel: vi.fn(),
      rotateWorkspace: vi.fn(),
      addPanel: vi.fn(),
      removePanel: vi.fn(),
      togglePinPanel: vi.fn(),
      setPanelMini: vi.fn(),
      toggleMiniPanel: vi.fn(),
      setPanelOpacity: vi.fn(),
      updatePanelTransform: vi.fn(),
      exportSnapshot: vi.fn(),
      restoreSnapshot: vi.fn(),
      applyGesture: vi.fn(),
      applyVoiceTranscript: vi.fn(),
    },
    hudStatus: null,
    dispatchVoice: vi.fn(async () => ({ kind: "none" })),
    sendServerCommand: vi.fn(async () => undefined),
    sendServerControlChar: vi.fn(async () => undefined),
    stopServerSession: vi.fn(async () => undefined),
    openServerOnMac: vi.fn(async () => undefined),
    pauseServerStreams: vi.fn(),
    resumeServerStreams: vi.fn(),
    getStreamPoolSnapshot: vi.fn(() => ({
      paused: false,
      tracked: 1,
      active: 1,
      managed: 1,
    })),
    ...overrides,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  useVrLiveRuntimeMock.mockReset();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  vi.useRealTimers();
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("VrCommandCenterScreen", () => {
  async function renderScreen(runtime: ReturnType<typeof makeRuntime>) {
    useVrLiveRuntimeMock.mockReturnValue(runtime);
    const dgx = makeServer("dgx", "DGX");
    const connection = makeConnection(dgx, ["main", "build"]);
    const terminals = {
      connections: new Map<string, ServerConnection>([[dgx.id, connection]]),
      focusedServerId: dgx.id,
      onReconnectServer: vi.fn(),
      onReconnectServers: vi.fn(),
      onCreateAgentForServers: vi.fn(async () => []),
      onSetAgentGoalForServers: vi.fn(async () => []),
      onQueueAgentCommandForServers: vi.fn(async () => []),
      onApproveReadyAgentsForServers: vi.fn(async () => []),
      onDenyAllPendingAgentsForServers: vi.fn(async () => []),
      onConnectAllServers: vi.fn(),
      onDisconnectAllServers: vi.fn(),
    } as any;

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(AppProvider, {
          value: { terminals },
          children: React.createElement(VrCommandCenterScreen),
        })
      );
    });
    return renderer!;
  }

  it("adds and removes workspace panels through runtime controls", async () => {
    const runtime = makeRuntime();
    const renderer = await renderScreen(runtime);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Add panel DGX · build" }).props.onPress();
    });
    expect(runtime.workspace.addPanel).toHaveBeenCalledWith("dgx", "build");

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Remove panel main" }).props.onPress();
    });
    expect(runtime.workspace.removePanel).toHaveBeenCalledWith("dgx::main");

    await act(async () => {
      renderer.unmount();
    });
  });

  it("dispatches voice and focused command actions through runtime", async () => {
    const runtime = makeRuntime();
    const renderer = await renderScreen(runtime);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("reconnect all");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(runtime.dispatchVoice).toHaveBeenCalledWith("reconnect all", { targetPanelId: "dgx::main" });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR focused panel command" }).props.onChangeText("npm run build");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Send command to focused panel" }).props.onPress();
    });
    expect(runtime.dispatchVoice).toHaveBeenCalledWith("npm run build", { targetPanelId: "dgx::main" });

    await act(async () => {
      renderer.unmount();
    });
  });
});
