import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useVrLiveRuntimeMock, useSharedWorkspacesMock, useVoiceChannelsMock } = vi.hoisted(() => ({
  useVrLiveRuntimeMock: vi.fn(),
  useSharedWorkspacesMock: vi.fn(),
  useVoiceChannelsMock: vi.fn(),
}));

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock("../vr/useVrLiveRuntime", () => ({
  useVrLiveRuntime: (...args: unknown[]) => useVrLiveRuntimeMock(...args),
}));

vi.mock("../hooks/useSharedWorkspaces", () => ({
  useSharedWorkspaces: (...args: unknown[]) => useSharedWorkspacesMock(...args),
}));

vi.mock("../hooks/useVoiceChannels", () => ({
  useVoiceChannels: (...args: unknown[]) => useVoiceChannelsMock(...args),
}));

import { AppProvider } from "../context/AppContext";
import { ServerConnection, ServerProfile, SharedWorkspace, VoiceChannel } from "../types";
import { VrCommandCenterScreen } from "./VrCommandCenterScreen";

function makeServer(id: string, name: string, overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
    ...overrides,
  };
}

function makeConnection(
  server: ServerProfile,
  openSessions: string[],
  options?: {
    spectate?: boolean;
  }
): ServerConnection {
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
      spectate: Boolean(options?.spectate),
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
  useSharedWorkspacesMock.mockReset();
  useVoiceChannelsMock.mockReset();
  useSharedWorkspacesMock.mockReturnValue({
    workspaces: [],
    loading: false,
    createWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    renameWorkspace: vi.fn(),
    setWorkspaceServers: vi.fn(),
    setMemberRole: vi.fn(),
  });
  useVoiceChannelsMock.mockReturnValue({
    channels: [],
    loading: false,
    createChannel: vi.fn(),
    deleteChannel: vi.fn(),
    pruneWorkspaceChannels: vi.fn(),
    joinChannel: vi.fn(),
    leaveChannel: vi.fn(),
    toggleMute: vi.fn(),
  });
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
  async function renderScreen(
    runtime: ReturnType<typeof makeRuntime>,
    options?: {
      workspaces?: SharedWorkspace[];
      channels?: VoiceChannel[];
      connections?: Map<string, ServerConnection>;
      terminalsOverrides?: Record<string, unknown>;
    }
  ) {
    useVrLiveRuntimeMock.mockReturnValue(runtime);
    if (options?.workspaces) {
      useSharedWorkspacesMock.mockReturnValue({
        workspaces: options.workspaces,
        loading: false,
        createWorkspace: vi.fn(),
        deleteWorkspace: vi.fn(),
        renameWorkspace: vi.fn(),
        setWorkspaceServers: vi.fn(),
        setMemberRole: vi.fn(),
      });
    }
    if (options?.channels) {
      useVoiceChannelsMock.mockReturnValue({
        channels: options.channels,
        loading: false,
        createChannel: vi.fn(),
        deleteChannel: vi.fn(),
        pruneWorkspaceChannels: vi.fn(),
        joinChannel: vi.fn(),
        leaveChannel: vi.fn(),
        toggleMute: vi.fn(),
      });
    }
    const dgx = makeServer("dgx", "DGX");
    const connection = makeConnection(dgx, ["main", "build"]);
    const defaultConnections = new Map<string, ServerConnection>([[dgx.id, connection]]);
    const terminals = {
      connections: options?.connections || defaultConnections,
      focusedServerId: dgx.id,
      onReconnectServer: vi.fn(),
      onReconnectServers: vi.fn(),
      onShareServerSessionLive: vi.fn(),
      onCreateAgentForServers: vi.fn(async () => []),
      onSetAgentGoalForServers: vi.fn(async () => []),
      onQueueAgentCommandForServers: vi.fn(async () => []),
      onApproveReadyAgentsForServers: vi.fn(async () => []),
      onDenyAllPendingAgentsForServers: vi.fn(async () => []),
      onConnectAllServers: vi.fn(),
      onDisconnectAllServers: vi.fn(),
      ...(options?.terminalsOverrides || {}),
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

  it("handles voice workspace and vm host scope commands before runtime routing", async () => {
    const baseRuntime = makeRuntime();
    const runtime = {
      ...baseRuntime,
      workspace: {
        ...baseRuntime.workspace,
        focusedPanelId: "dgx::main",
        panels: [
          ...baseRuntime.workspace.panels,
          {
            id: "home::ops",
            serverId: "home",
            serverName: "Home",
            session: "ops",
            sessionLabel: "ops",
            connected: true,
            output: "ops output",
            pinned: false,
            mini: false,
            transform: {
              x: 0.4,
              y: 1.45,
              z: -1.8,
              yaw: 0,
            },
          },
        ],
      },
    };
    const dgx = makeServer("dgx", "DGX", { vmHost: "Rack A" });
    const home = makeServer("home", "Home", { vmHost: "Rack B" });
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main", "build"])],
      [home.id, makeConnection(home, ["ops"])],
    ]);
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-1",
        name: "Platform Ops",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const renderer = await renderScreen(runtime, { connections, workspaces });

    expect(renderer.root.findByProps({ accessibilityLabel: "Focus panel main" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Focus panel ops" })).toBeDefined();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("scope workspace platform ops");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Focus panel ops" })).toThrow();
    expect(renderer.root.findByProps({ children: "Scoped workspace to Platform Ops." })).toBeDefined();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("scope workspace all servers");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(renderer.root.findByProps({ accessibilityLabel: "Focus panel ops" })).toBeDefined();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("scope host rack b");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Focus panel main" })).toThrow();
    expect(renderer.root.findByProps({ accessibilityLabel: "Focus panel ops" })).toBeDefined();
    expect(renderer.root.findByProps({ children: "Scoped VM host to Rack B." })).toBeDefined();
    expect(runtime.dispatchVoice).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("routes panel live-share controls through vr voice dispatch and runtime share callback", async () => {
    const runtime = makeRuntime();
    const onShareServerSessionLive = vi.fn();
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([[dgx.id, makeConnection(dgx, ["main", "build"], { spectate: true })]]);
    const renderer = await renderScreen(runtime, {
      connections,
      terminalsOverrides: {
        onShareServerSessionLive,
      },
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Share live main" }).props.onPress();
    });

    expect(runtime.dispatchVoice).toHaveBeenCalledWith("share live", { targetPanelId: "dgx::main" });
    const latestArgs = useVrLiveRuntimeMock.mock.calls.at(-1)?.[0] as {
      onShareLive?: (serverId: string, session: string) => Promise<void> | void;
    };
    expect(latestArgs.onShareLive).toBe(onShareServerSessionLive);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("handles voice channel join and mute commands before runtime voice routing", async () => {
    const runtime = makeRuntime();
    const joinChannel = vi.fn();
    const leaveChannel = vi.fn();
    const toggleMute = vi.fn();
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-1",
        name: "Platform Ops",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const channels: VoiceChannel[] = [
      {
        id: "voice-1",
        workspaceId: "workspace-1",
        name: "incident",
        joined: false,
        muted: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "voice-2",
        workspaceId: "workspace-1",
        name: "release",
        joined: true,
        muted: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    useVoiceChannelsMock.mockReturnValue({
      channels,
      loading: false,
      createChannel: vi.fn(),
      deleteChannel: vi.fn(),
      pruneWorkspaceChannels: vi.fn(),
      joinChannel,
      leaveChannel,
      toggleMute,
    });

    const renderer = await renderScreen(runtime, { workspaces });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("join channel incident");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(joinChannel).toHaveBeenCalledWith("voice-1");

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("unmute channel release");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(toggleMute).toHaveBeenCalledWith("voice-2");

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("leave channel release");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(leaveChannel).toHaveBeenCalledWith("voice-2");
    expect(runtime.dispatchVoice).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("handles voice channel create and delete commands with workspace targeting", async () => {
    const runtime = makeRuntime();
    const createChannel = vi.fn();
    const deleteChannel = vi.fn();
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-1",
        name: "Platform Ops",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const channels: VoiceChannel[] = [
      {
        id: "voice-1",
        workspaceId: "workspace-1",
        name: "incident",
        joined: false,
        muted: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    useVoiceChannelsMock.mockReturnValue({
      channels,
      loading: false,
      createChannel,
      deleteChannel,
      pruneWorkspaceChannels: vi.fn(),
      joinChannel: vi.fn(),
      leaveChannel: vi.fn(),
      toggleMute: vi.fn(),
    });

    const renderer = await renderScreen(runtime, { workspaces });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("create channel triage");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(createChannel).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "triage",
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("delete channel incident");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });
    expect(deleteChannel).toHaveBeenCalledWith("voice-1");
    expect(runtime.dispatchVoice).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("supports voice channel creation with explicit workspace name targeting", async () => {
    const runtime = makeRuntime();
    const createChannel = vi.fn();
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-1",
        name: "Platform Ops",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "workspace-2",
        name: "Release Hub",
        serverIds: ["home"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-2",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    useVoiceChannelsMock.mockReturnValue({
      channels: [],
      loading: false,
      createChannel,
      deleteChannel: vi.fn(),
      pruneWorkspaceChannels: vi.fn(),
      joinChannel: vi.fn(),
      leaveChannel: vi.fn(),
      toggleMute: vi.fn(),
    });

    const renderer = await renderScreen(runtime, { workspaces });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText(
        "create channel war-room in release hub"
      );
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });

    expect(createChannel).toHaveBeenCalledWith({
      workspaceId: "workspace-2",
      name: "war-room",
    });
    expect(runtime.dispatchVoice).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("requires workspace targeting for channel management when multiple workspaces are visible", async () => {
    const runtime = makeRuntime();
    const createChannel = vi.fn();
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-1",
        name: "Platform Ops",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "workspace-2",
        name: "Release Hub",
        serverIds: ["home"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-2",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    useVoiceChannelsMock.mockReturnValue({
      channels: [],
      loading: false,
      createChannel,
      deleteChannel: vi.fn(),
      pruneWorkspaceChannels: vi.fn(),
      joinChannel: vi.fn(),
      leaveChannel: vi.fn(),
      toggleMute: vi.fn(),
    });

    const renderer = await renderScreen(runtime, { workspaces });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("create channel triage");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });

    expect(createChannel).not.toHaveBeenCalled();
    expect(() =>
      renderer.root.findByProps({
        children: "Specify a workspace or scope to one workspace before channel management.",
      })
    ).not.toThrow();
    expect(runtime.dispatchVoice).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("scopes panels to workspace and manages voice channel actions", async () => {
    const runtime = makeRuntime();
    const createChannel = vi.fn();
    const deleteChannel = vi.fn();
    const joinChannel = vi.fn();
    const toggleMute = vi.fn();
    const leaveChannel = vi.fn();
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-1",
        name: "Platform Ops",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const channels: VoiceChannel[] = [
      {
        id: "voice-1",
        workspaceId: "workspace-1",
        name: "incident",
        joined: false,
        muted: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      {
        id: "voice-2",
        workspaceId: "workspace-1",
        name: "release",
        joined: true,
        muted: true,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    useVoiceChannelsMock.mockReturnValue({
      channels,
      loading: false,
      createChannel,
      deleteChannel,
      pruneWorkspaceChannels: vi.fn(),
      joinChannel,
      leaveChannel,
      toggleMute,
    });

    const renderer = await renderScreen(runtime, { workspaces });

    expect(() => renderer.root.findByProps({ children: "1 member • Local Local User (owner)" })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "Local User • owner" })).not.toThrow();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Scope VR panels to workspace Platform Ops" }).props.onPress();
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "New VR voice channel for Platform Ops" }).props.onChangeText("triage");
    });
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Create VR voice channel for Platform Ops" }).props.onPress();
    });
    expect(createChannel).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      name: "triage",
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Join VR voice channel incident" }).props.onPress();
    });
    expect(joinChannel).toHaveBeenCalledWith("voice-1");

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Unmute VR joined channel release" }).props.onPress();
    });
    expect(toggleMute).toHaveBeenCalledWith("voice-2");

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Leave VR joined channel release" }).props.onPress();
    });
    expect(leaveChannel).toHaveBeenCalledWith("voice-2");

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Delete VR voice channel incident" }).props.onPress();
    });
    expect(deleteChannel).toHaveBeenCalledWith("voice-1");

    await act(async () => {
      renderer.unmount();
    });
  });

  it("keeps channel management disabled for viewer workspaces", async () => {
    const runtime = makeRuntime();
    const createChannel = vi.fn();
    const deleteChannel = vi.fn();
    const joinChannel = vi.fn();
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-viewer",
        name: "Viewer Space",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "viewer" }],
        channelId: "channel-workspace-viewer",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const channels: VoiceChannel[] = [
      {
        id: "voice-viewer-1",
        workspaceId: "workspace-viewer",
        name: "ops",
        joined: false,
        muted: false,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    useVoiceChannelsMock.mockReturnValue({
      channels,
      loading: false,
      createChannel,
      deleteChannel,
      pruneWorkspaceChannels: vi.fn(),
      joinChannel,
      leaveChannel: vi.fn(),
      toggleMute: vi.fn(),
    });

    const renderer = await renderScreen(runtime, { workspaces });

    expect(() => renderer.root.findByProps({ children: "Only owners or editors can manage channels." })).not.toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Create VR voice channel for Viewer Space" })).toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Delete VR voice channel ops" })).toThrow();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Join VR voice channel ops" }).props.onPress();
    });
    expect(joinChannel).toHaveBeenCalledWith("voice-viewer-1");
    expect(createChannel).not.toHaveBeenCalled();
    expect(deleteChannel).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("blocks voice channel management commands for viewer workspaces", async () => {
    const runtime = makeRuntime();
    const createChannel = vi.fn();
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-viewer",
        name: "Viewer Space",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "viewer" }],
        channelId: "channel-workspace-viewer",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    useVoiceChannelsMock.mockReturnValue({
      channels: [],
      loading: false,
      createChannel,
      deleteChannel: vi.fn(),
      pruneWorkspaceChannels: vi.fn(),
      joinChannel: vi.fn(),
      leaveChannel: vi.fn(),
      toggleMute: vi.fn(),
    });

    const renderer = await renderScreen(runtime, { workspaces });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR voice command" }).props.onChangeText("create channel triage");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Dispatch voice command" }).props.onPress();
    });

    expect(createChannel).not.toHaveBeenCalled();
    expect(() => renderer.root.findByProps({ children: "Channel management is blocked for Viewer Space." })).not.toThrow();
    expect(runtime.dispatchVoice).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("runs manual VR agent controls against scoped targets", async () => {
    const runtime = makeRuntime();
    const createAgent = vi.fn(async () => ["agent-a"]);
    const removeAgent = vi.fn(async () => ["agent-a"]);
    const setGoal = vi.fn(async () => ["agent-a"]);
    const queueCommand = vi.fn(async () => ["agent-a"]);
    const approveReady = vi.fn(async () => ["agent-a"]);
    const denyPending = vi.fn(async () => ["agent-a"]);
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Home");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main", "build"])],
      [home.id, makeConnection(home, ["ops"])],
    ]);

    const renderer = await renderScreen(runtime, {
      connections,
      terminalsOverrides: {
        onCreateAgentForServers: createAgent,
        onRemoveAgentForServers: removeAgent,
        onSetAgentGoalForServers: setGoal,
        onQueueAgentCommandForServers: queueCommand,
        onApproveReadyAgentsForServers: approveReady,
        onDenyAllPendingAgentsForServers: denyPending,
      },
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR agent name" }).props.onChangeText("deploy bot");
    });
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR agent goal" }).props.onChangeText("keep deploy green");
    });
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "VR agent command" }).props.onChangeText("npm run deploy");
    });
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Target all servers for VR agent actions" }).props.onPress();
    });

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Create VR agent" }).props.onPress();
    });
    expect(createAgent).toHaveBeenCalledWith(["dgx", "home"], "deploy bot");

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Set VR agent goal" }).props.onPress();
    });
    expect(setGoal).toHaveBeenCalledWith(["dgx", "home"], "deploy bot", "keep deploy green");

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Remove VR agent" }).props.onPress();
    });
    expect(removeAgent).toHaveBeenCalledWith(["dgx", "home"], "deploy bot");

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Queue VR agent command" }).props.onPress();
    });
    expect(queueCommand).toHaveBeenCalledWith(["dgx", "home"], "deploy bot", "npm run deploy");

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Approve VR ready agents" }).props.onPress();
    });
    expect(approveReady).toHaveBeenCalledWith(["dgx", "home"]);

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Deny VR pending agents" }).props.onPress();
    });
    expect(denyPending).toHaveBeenCalledWith(["dgx", "home"]);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("filters visible panels by selected VM host scope", async () => {
    const baseRuntime = makeRuntime();
    const runtime = {
      ...baseRuntime,
      workspace: {
        ...baseRuntime.workspace,
        focusedPanelId: "dgx::main",
        panels: [
          ...baseRuntime.workspace.panels,
          {
            id: "home::ops",
            serverId: "home",
            serverName: "Home",
            session: "ops",
            sessionLabel: "ops",
            connected: true,
            output: "ops output",
            pinned: false,
            mini: false,
            transform: {
              x: 0.4,
              y: 1.45,
              z: -1.8,
              yaw: 0,
            },
          },
        ],
      },
    };
    const dgx = makeServer("dgx", "DGX", { vmHost: "Rack A" });
    const home = makeServer("home", "Home", { vmHost: "Rack B" });
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main", "build"])],
      [home.id, makeConnection(home, ["ops"])],
    ]);
    const renderer = await renderScreen(runtime, { connections });

    expect(renderer.root.findByProps({ accessibilityLabel: "Focus panel ops" })).toBeDefined();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Scope VR panels to VM host Rack A" }).props.onPress();
    });

    expect(renderer.root.findByProps({ accessibilityLabel: "Focus panel main" })).toBeDefined();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Focus panel ops" })).toThrow();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("passes scoped auto-sync panel ids into vr runtime args", async () => {
    const runtime = makeRuntime();
    const dgx = makeServer("dgx", "DGX", { vmHost: "Rack A" });
    const home = makeServer("home", "Home", { vmHost: "Rack B" });
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main", "build"])],
      [home.id, makeConnection(home, ["ops"])],
    ]);
    const workspaces: SharedWorkspace[] = [
      {
        id: "workspace-1",
        name: "Platform Ops",
        serverIds: ["dgx"],
        members: [{ id: "local-user", name: "Local User", role: "owner" }],
        channelId: "channel-workspace-1",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ];

    const renderer = await renderScreen(runtime, { connections, workspaces });

    const initialArgs = useVrLiveRuntimeMock.mock.calls.at(-1)?.[0] as { autoSyncWorkspacePanelIds?: string[] };
    expect(initialArgs.autoSyncWorkspacePanelIds).toEqual(expect.arrayContaining(["dgx::main", "dgx::build", "home::ops"]));

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Scope VR panels to workspace Platform Ops" }).props.onPress();
    });
    const workspaceScopedArgs = useVrLiveRuntimeMock.mock.calls.at(-1)?.[0] as { autoSyncWorkspacePanelIds?: string[] };
    expect(workspaceScopedArgs.autoSyncWorkspacePanelIds).toEqual(expect.arrayContaining(["dgx::main", "dgx::build"]));
    expect(workspaceScopedArgs.autoSyncWorkspacePanelIds).not.toContain("home::ops");

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Show VR panels for all servers" }).props.onPress();
    });
    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Scope VR panels to VM host Rack B" }).props.onPress();
    });
    const vmScopedArgs = useVrLiveRuntimeMock.mock.calls.at(-1)?.[0] as { autoSyncWorkspacePanelIds?: string[] };
    expect(vmScopedArgs.autoSyncWorkspacePanelIds).toEqual(["home::ops"]);

    await act(async () => {
      renderer.unmount();
    });
  });
});
