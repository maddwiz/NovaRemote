import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useSharedWorkspacesMock, useSpatialVoiceRoutingMock, useTextEditingMock, useVoiceChannelsMock } = vi.hoisted(() => ({
  useSharedWorkspacesMock: vi.fn(),
  useSpatialVoiceRoutingMock: vi.fn(),
  useTextEditingMock: vi.fn(),
  useVoiceChannelsMock: vi.fn(),
}));

vi.mock("../hooks/useSharedWorkspaces", () => ({
  useSharedWorkspaces: (...args: unknown[]) => useSharedWorkspacesMock(...args),
}));

vi.mock("../hooks/useSpatialLayoutPrefs", () => ({
  useSpatialLayoutPrefs: () => undefined,
}));

vi.mock("../hooks/useSpatialVoiceRouting", () => ({
  useSpatialVoiceRouting: (...args: unknown[]) => useSpatialVoiceRoutingMock(...args),
}));

vi.mock("../hooks/useTextEditing", () => ({
  useTextEditing: (...args: unknown[]) => useTextEditingMock(...args),
}));

vi.mock("../hooks/useVoiceChannels", () => ({
  useVoiceChannels: (...args: unknown[]) => useVoiceChannelsMock(...args),
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
  },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

vi.mock("../components/TerminalKeyboardBar", () => ({
  TerminalKeyboardBar: () => null,
}));

import { AppProvider } from "../context/AppContext";
import { ServerConnection, ServerProfile, SharedWorkspace } from "../types";
import { GlassesModeScreen } from "./GlassesModeScreen";

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
    tails: {},
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

function makeTerminals(
  connections: Map<string, ServerConnection>,
  overrides?: Partial<ReturnType<typeof makeTerminalsBase>>
) {
  return {
    ...makeTerminalsBase(connections),
    ...(overrides || {}),
  } as any;
}

function makeTerminalsBase(connections: Map<string, ServerConnection>) {
  return {
    connections,
    focusedServerId: "dgx",
    onFocusServer: vi.fn(),
    onReconnectServer: vi.fn(),
    onReconnectServers: vi.fn(),
    onConnectAllServers: vi.fn(),
    onDisconnectAllServers: vi.fn(),
    onCreateAgentForServer: vi.fn(async () => []),
    onSetAgentGoalForServer: vi.fn(async () => []),
    onCreateAgentForServers: vi.fn(async () => []),
    onSetAgentGoalForServers: vi.fn(async () => []),
    onQueueAgentCommandForServer: vi.fn(async () => []),
    onQueueAgentCommandForServers: vi.fn(async () => []),
    onApproveReadyAgentsForServer: vi.fn(async () => []),
    onDenyAllPendingAgentsForServer: vi.fn(async () => []),
    onApproveReadyAgentsForServers: vi.fn(async () => []),
    onDenyAllPendingAgentsForServers: vi.fn(async () => []),
    sessionAliases: {},
    sessionReadOnly: {},
    glassesMode: {
      enabled: true,
      brand: "meta_orion",
      textScale: 1,
      voiceAutoSend: false,
      voiceLoop: false,
      wakePhraseEnabled: false,
      wakePhrase: "nova",
      minimalMode: false,
      vadEnabled: false,
      vadSilenceMs: 900,
      vadSensitivityDb: 8,
      loopCaptureMs: 6800,
      headsetPttEnabled: false,
    },
    voiceRecording: false,
    voiceBusy: false,
    voiceTranscript: "",
    voiceError: null,
    voiceMeteringDb: null,
    onSetServerSessionDraft: vi.fn(),
    onSendServerSessionDraft: vi.fn(),
    onSendServerSessionCommand: vi.fn(),
    onOpenServerSessionOnMac: vi.fn(),
    onClearServerSessionDraft: vi.fn(),
    onSendServerSessionControlChar: vi.fn(),
    onHistoryPrev: vi.fn(),
    onHistoryNext: vi.fn(),
    onSetGlassesBrand: vi.fn(),
    onSetGlassesVoiceAutoSend: vi.fn(),
    onSetGlassesVoiceLoop: vi.fn(),
    onSetGlassesWakePhraseEnabled: vi.fn(),
    onSetGlassesWakePhrase: vi.fn(),
    onSetGlassesMinimalMode: vi.fn(),
    onSetGlassesTextScale: vi.fn(),
    onSetGlassesVadEnabled: vi.fn(),
    onSetGlassesVadSilenceMs: vi.fn(),
    onSetGlassesVadSensitivityDb: vi.fn(),
    onSetGlassesLoopCaptureMs: vi.fn(),
    onSetGlassesHeadsetPttEnabled: vi.fn(),
    onOpenVrCommandCenter: vi.fn(),
    onVoiceStartCapture: vi.fn(),
    onVoiceStopCaptureForServer: vi.fn(),
    onVoiceSendTranscriptForServer: vi.fn(),
    onCloseGlassesMode: vi.fn(),
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  useSharedWorkspacesMock.mockReset();
  useSpatialVoiceRoutingMock.mockReset();
  useTextEditingMock.mockReset();
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
  useSpatialVoiceRoutingMock.mockReturnValue({
    routeTranscript: vi.fn(() => ({ kind: "none" })),
  });
  useTextEditingMock.mockReturnValue({
    selection: { start: 0, end: 0 },
    onSelectionChange: vi.fn(),
    insertTextAtCursor: vi.fn(),
    handleAction: vi.fn(),
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
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("GlassesModeScreen", () => {
  it("filters spatial panels by workspace and VM host scope", async () => {
    const dgx = makeServer("dgx", "DGX", { vmHost: "Rack A" });
    const home = makeServer("home", "Home", { vmHost: "Rack B" });
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build"])],
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
    useSharedWorkspacesMock.mockReturnValue({
      workspaces,
      loading: false,
      createWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      setWorkspaceServers: vi.fn(),
      setMemberRole: vi.fn(),
    });

    let screen!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      screen = TestRenderer.create(
        React.createElement(AppProvider, {
          value: {
            terminals: makeTerminals(connections),
          },
          children: React.createElement(GlassesModeScreen),
        })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.root.findByProps({ accessibilityLabel: "Focus DGX main" })).toBeDefined();
    expect(screen.root.findByProps({ accessibilityLabel: "Focus Home build" })).toBeDefined();

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Show spatial settings" }).props.onPress();
    });
    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Scope glasses panels to workspace Platform Ops" }).props.onPress();
    });

    expect(screen.root.findByProps({ accessibilityLabel: "Focus DGX main" })).toBeDefined();
    expect(() => screen.root.findByProps({ accessibilityLabel: "Focus Home build" })).toThrow();

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Show glasses panels for all servers" }).props.onPress();
    });
    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Scope glasses panels to VM host Rack B" }).props.onPress();
    });

    expect(() => screen.root.findByProps({ accessibilityLabel: "Focus DGX main" })).toThrow();
    expect(screen.root.findByProps({ accessibilityLabel: "Focus Home build" })).toBeDefined();

    await act(async () => {
      screen.unmount();
    });
  });

  it("routes transcript commands to workspace scope changes", async () => {
    const dgx = makeServer("dgx", "DGX", { vmHost: "Rack A" });
    const home = makeServer("home", "Home", { vmHost: "Rack B" });
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build"])],
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
    useSharedWorkspacesMock.mockReturnValue({
      workspaces,
      loading: false,
      createWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      setWorkspaceServers: vi.fn(),
      setMemberRole: vi.fn(),
    });

    let screen!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      screen = TestRenderer.create(
        React.createElement(AppProvider, {
          value: {
            terminals: makeTerminals(connections, {
              voiceTranscript: "scope workspace platform ops",
            }),
          },
          children: React.createElement(GlassesModeScreen),
        })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.root.findByProps({ accessibilityLabel: "Focus DGX main" })).toBeDefined();
    expect(screen.root.findByProps({ accessibilityLabel: "Focus Home build" })).toBeDefined();

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Route transcript" }).props.onPress();
    });

    expect(screen.root.findByProps({ accessibilityLabel: "Focus DGX main" })).toBeDefined();
    expect(() => screen.root.findByProps({ accessibilityLabel: "Focus Home build" })).toThrow();

    await act(async () => {
      screen.unmount();
    });
  });

  it("routes transcript commands to vm host scope changes", async () => {
    const dgx = makeServer("dgx", "DGX", { vmHost: "Rack A" });
    const home = makeServer("home", "Home", { vmHost: "Rack B" });
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build"])],
    ]);

    let screen!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      screen = TestRenderer.create(
        React.createElement(AppProvider, {
          value: {
            terminals: makeTerminals(connections, {
              voiceTranscript: "scope host rack b",
            }),
          },
          children: React.createElement(GlassesModeScreen),
        })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.root.findByProps({ accessibilityLabel: "Focus DGX main" })).toBeDefined();
    expect(screen.root.findByProps({ accessibilityLabel: "Focus Home build" })).toBeDefined();

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Route transcript" }).props.onPress();
    });

    expect(() => screen.root.findByProps({ accessibilityLabel: "Focus DGX main" })).toThrow();
    expect(screen.root.findByProps({ accessibilityLabel: "Focus Home build" })).toBeDefined();

    await act(async () => {
      screen.unmount();
    });
  });

  it("handles voice channel join commands before spatial route dispatch", async () => {
    const routeTranscript = vi.fn(() => ({ kind: "none" }));
    useSpatialVoiceRoutingMock.mockReturnValue({
      routeTranscript,
    });

    const joinChannel = vi.fn();
    useVoiceChannelsMock.mockReturnValue({
      channels: [
        {
          id: "voice-1",
          workspaceId: "workspace-1",
          name: "incident",
          joined: false,
          muted: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      loading: false,
      createChannel: vi.fn(),
      deleteChannel: vi.fn(),
      pruneWorkspaceChannels: vi.fn(),
      joinChannel,
      leaveChannel: vi.fn(),
      toggleMute: vi.fn(),
    });

    useSharedWorkspacesMock.mockReturnValue({
      workspaces: [
        {
          id: "workspace-1",
          name: "Platform Ops",
          serverIds: ["dgx"],
          members: [{ id: "local-user", name: "Local User", role: "owner" }],
          channelId: "channel-workspace-1",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      loading: false,
      createWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      setWorkspaceServers: vi.fn(),
      setMemberRole: vi.fn(),
    });

    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([[dgx.id, makeConnection(dgx, ["main"])]]);
    let screen!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      screen = TestRenderer.create(
        React.createElement(AppProvider, {
          value: {
            terminals: makeTerminals(connections, {
              voiceTranscript: "join channel incident",
            }),
          },
          children: React.createElement(GlassesModeScreen),
        })
      );
    });

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Route transcript" }).props.onPress();
    });

    expect(joinChannel).toHaveBeenCalledWith("voice-1");
    expect(routeTranscript).not.toHaveBeenCalled();
    expect(() => screen.root.findByProps({ children: "Joined #incident" })).not.toThrow();

    await act(async () => {
      screen.unmount();
    });
  });

  it("handles voice channel create commands with explicit workspace targeting", async () => {
    const createChannel = vi.fn((input: { workspaceId: string; name: string }) => ({
      id: "voice-2",
      workspaceId: input.workspaceId,
      name: input.name,
      joined: false,
      muted: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
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

    useSharedWorkspacesMock.mockReturnValue({
      workspaces: [
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
      ],
      loading: false,
      createWorkspace: vi.fn(),
      deleteWorkspace: vi.fn(),
      renameWorkspace: vi.fn(),
      setWorkspaceServers: vi.fn(),
      setMemberRole: vi.fn(),
    });

    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Home");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["ops"])],
    ]);
    let screen!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      screen = TestRenderer.create(
        React.createElement(AppProvider, {
          value: {
            terminals: makeTerminals(connections, {
              voiceTranscript: "create channel war-room in release hub",
            }),
          },
          children: React.createElement(GlassesModeScreen),
        })
      );
    });

    await act(async () => {
      screen.root.findByProps({ accessibilityLabel: "Route transcript" }).props.onPress();
    });

    expect(createChannel).toHaveBeenCalledWith({
      workspaceId: "workspace-2",
      name: "war-room",
    });
    expect(() => screen.root.findByProps({ children: "Created #war-room in Release Hub" })).not.toThrow();

    await act(async () => {
      screen.unmount();
    });
  });
});
