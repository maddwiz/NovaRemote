import { describe, expect, it, vi } from "vitest";

vi.mock("../constants", () => ({
  DEFAULT_SPECTATE_TTL_SECONDS: 86400,
  FREE_SESSION_LIMIT: 2,
  isLikelyAiSession: (session: string) => session.startsWith("ai"),
}));

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  notificationAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
}));

import { useTerminalsViewModel } from "./useTerminalsViewModel";

function makeBaseArgs() {
  return {
    activeServer: null,
    connected: false,
    focusedServerId: null,
    connections: new Map(),
    unreadServers: new Set<string>(),
    connectedServerCount: 0,
    totalActiveStreams: 0,
    poolLifecyclePaused: false,
    servers: [],
    allSessions: [],
    openSessions: [],
    tails: {},
    drafts: {},
    sendBusy: {},
    streamLive: {},
    connectionMeta: {},
    sendModes: {},
    sessionAiEngine: {},
    startCwd: "/workspace",
    startPrompt: "",
    startOpenOnMac: true,
    startKind: "ai",
    startAiEngine: "auto",
    capabilitiesLoading: false,
    health: {
      lastPingAt: null,
      latencyMs: null,
      activeStreams: 0,
      openSessions: 0,
    },
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
    supportedFeatures: "",
    sysStats: null,
    activeProfile: null,
    localAiSessions: [],
    commandHistory: {},
    historyCount: {},
    sessionAliases: {},
    sessionTags: {},
    allTags: [],
    tagFilter: "",
    pinnedSessions: [],
    isPro: true,
    fleetCommand: "",
    fleetCwd: "",
    fleetTargets: [],
    fleetBusy: false,
    fleetWaitMs: "5000",
    shellRunWaitMs: "5000",
    fleetResults: [],
    processes: [],
    processesBusy: false,
    sessionPresence: {},
    sessionReadOnly: {},
    suggestionsBySession: {},
    suggestionBusyBySession: {},
    errorHintsBySession: {},
    triageBusyBySession: {},
    triageExplanationBySession: {},
    triageFixesBySession: {},
    watchRules: {},
    watchAlertHistoryBySession: {},
    terminalTheme: {
      preset: "nova",
      fontSize: 14,
      fontFamily: "menlo",
      backgroundOpacity: 0.9,
    },
    commandQueue: {},
    recordings: {},
    glassesMode: {
      enabled: false,
      brand: "xreal_x1",
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
    setPaywallVisible: vi.fn(),
    setTagFilter: vi.fn(),
    setStartCwd: vi.fn(),
    setStartPrompt: vi.fn(),
    setStartOpenOnMac: vi.fn(),
    setStartKind: vi.fn(),
    setStartAiEngine: vi.fn(),
    runWithStatus: vi.fn(async (_label: string, action: () => Promise<void>) => {
      await action();
    }),
    refreshCapabilities: vi.fn(async () => undefined),
    refreshSessions: vi.fn(async () => undefined),
    refreshAllServers: vi.fn(async () => undefined),
    setRoute: vi.fn(),
    focusServer: vi.fn(),
    reconnectServer: vi.fn(),
    reconnectServers: vi.fn(),
    reconnectAllServers: vi.fn(),
    connectAllServers: vi.fn(),
    disconnectAllServers: vi.fn(),
    approveReadyAgentsForFocusedServer: vi.fn(() => []),
    denyAllPendingAgentsForFocusedServer: vi.fn(() => []),
    approveReadyAgentsForServer: vi.fn(async () => []),
    denyAllPendingAgentsForServer: vi.fn(async () => []),
    approveReadyAgentsForServers: vi.fn(async () => []),
    denyAllPendingAgentsForServers: vi.fn(async () => []),
    editServer: vi.fn(),
    openSshFallback: vi.fn(async () => undefined),
    createLocalAiSession: vi.fn(),
    setSessionAiEngine: vi.fn(),
    sendViaExternalLlm: vi.fn(async () => ""),
    track: vi.fn(),
    requestDangerApproval: vi.fn(async () => true),
    handleStartSession: vi.fn(async () => "session"),
    toggleSessionVisible: vi.fn(),
    setStatus: vi.fn(),
    isLocalSession: vi.fn(() => false),
    setSessionMode: vi.fn(),
    handleOpenOnMac: vi.fn(async () => undefined),
    openServerSessionOnMac: vi.fn(async () => undefined),
    fetchTail: vi.fn(async () => undefined),
    createSpectateLink: vi.fn(async () => "https://example.com"),
    terminalApiBasePath: "/tmux",
    setShareConfig: vi.fn(),
    setFocusedSession: vi.fn(),
    handleStop: vi.fn(async () => undefined),
    removeOpenSession: vi.fn(),
    closeStream: vi.fn(),
    recallPrev: vi.fn(),
    setDrafts: vi.fn(),
    setServerSessionDraft: vi.fn(),
    sendServerSessionDraft: vi.fn(),
    sendServerSessionCommand: vi.fn(),
    clearServerSessionDraft: vi.fn(),
    sendServerSessionControlChar: vi.fn(),
    recallNext: vi.fn(),
    setTagsForSession: vi.fn(),
    parseCommaTags: vi.fn(() => []),
    setAliasForSession: vi.fn(),
    inferSessionAlias: vi.fn(() => "alias"),
    adaptCommandForBackend: vi.fn((value: string) => value),
    sendControlToSession: vi.fn(async () => undefined),
    setError: vi.fn(),
    shouldRouteToExternalAi: vi.fn(() => false),
    queueSessionCommand: vi.fn(),
    handleSend: vi.fn(async () => undefined),
    addCommand: vi.fn(),
    togglePinnedSession: vi.fn(),
    setFleetCommand: vi.fn(),
    setFleetCwd: vi.fn(),
    setFleetTargets: vi.fn(),
    setFleetWaitMs: vi.fn(),
    setShellRunWaitMsInput: vi.fn(),
    refreshProcesses: vi.fn(async () => undefined),
    refreshSessionPresence: vi.fn(async () => undefined),
    setSessionReadOnlyValue: vi.fn(async () => undefined),
    requestShellSuggestions: vi.fn(async () => undefined),
    explainSessionError: vi.fn(async () => undefined),
    suggestSessionErrorFixes: vi.fn(async () => undefined),
    setWatchEnabled: vi.fn(),
    setWatchPattern: vi.fn(),
    clearWatchAlerts: vi.fn(),
    setTerminalPreset: vi.fn(),
    setTerminalFontFamily: vi.fn(),
    setTerminalFontSize: vi.fn(),
    setTerminalBackgroundOpacity: vi.fn(),
    flushSessionQueue: vi.fn(),
    removeQueuedCommand: vi.fn(),
    toggleRecording: vi.fn(),
    openPlayback: vi.fn(),
    deleteRecordingWithPlaybackCleanup: vi.fn(),
    setGlassesEnabled: vi.fn(),
    setGlassesBrand: vi.fn(),
    setGlassesTextScale: vi.fn(),
    setGlassesVoiceAutoSend: vi.fn(),
    setGlassesVoiceLoop: vi.fn(),
    setGlassesWakePhraseEnabled: vi.fn(),
    setGlassesWakePhrase: vi.fn(),
    setGlassesMinimalMode: vi.fn(),
    setGlassesVadEnabled: vi.fn(),
    setGlassesVadSilenceMs: vi.fn(),
    setGlassesVadSensitivityDb: vi.fn(),
    setGlassesLoopCaptureMs: vi.fn(),
    setGlassesHeadsetPttEnabled: vi.fn(),
    voicePermissionStatus: "granted",
    requestVoicePermission: vi.fn(async () => "granted"),
    startVoiceCapture: vi.fn(async () => undefined),
    stopVoiceCaptureIntoSession: vi.fn(async () => undefined),
    stopVoiceCaptureIntoServerSession: vi.fn(async () => undefined),
    sendVoiceTranscriptToSession: vi.fn(async () => undefined),
    sendVoiceTranscriptToServerSession: vi.fn(async () => undefined),
    runFleetCommand: vi.fn(async () => undefined),
  } as Record<string, unknown>;
}

describe("useTerminalsViewModel", () => {
  it("surfaces pool-wide summary fields and reconnect-all callback", () => {
    const reconnectAllServers = vi.fn();
    const model = useTerminalsViewModel({
      ...makeBaseArgs(),
      connectedServerCount: 3,
      totalActiveStreams: 8,
      reconnectAllServers,
    });

    expect(model.connectedServerCount).toBe(3);
    expect(model.totalActiveStreams).toBe(8);
    model.onReconnectAllServers();
    expect(reconnectAllServers).toHaveBeenCalledTimes(1);
  });

  it("runs capability refresh through runWithStatus and force flag", async () => {
    const refreshCapabilities = vi.fn(async () => undefined);
    const runWithStatus = vi.fn(async (_label: string, action: () => Promise<void>) => {
      await action();
    });

    const model = useTerminalsViewModel({
      ...makeBaseArgs(),
      refreshCapabilities,
      runWithStatus,
    });

    model.onRefreshCapabilities();
    await Promise.resolve();

    expect(runWithStatus).toHaveBeenCalledTimes(1);
    expect(refreshCapabilities).toHaveBeenCalledWith(true);
  });

  it("runs refresh-all through runWithStatus", async () => {
    const refreshAllServers = vi.fn(async () => undefined);
    const runWithStatus = vi.fn(async (_label: string, action: () => Promise<void>) => {
      await action();
    });

    const model = useTerminalsViewModel({
      ...makeBaseArgs(),
      refreshAllServers,
      runWithStatus,
    });

    model.onRefreshAllServers();
    await Promise.resolve();

    expect(runWithStatus).toHaveBeenCalledTimes(1);
    expect(refreshAllServers).toHaveBeenCalledTimes(1);
  });

  it("routes pool lifecycle actions to connect/disconnect callbacks", () => {
    const connectAllServers = vi.fn();
    const disconnectAllServers = vi.fn();
    const model = useTerminalsViewModel({
      ...makeBaseArgs(),
      connectAllServers,
      disconnectAllServers,
    });

    model.onConnectAllServers();
    model.onDisconnectAllServers();

    expect(connectAllServers).toHaveBeenCalledTimes(1);
    expect(disconnectAllServers).toHaveBeenCalledTimes(1);
  });

  it("routes server-scoped agent approval actions through async callbacks", async () => {
    const approveReadyAgentsForServer = vi.fn(async (_serverId: string) => ["agent-a"]);
    const denyAllPendingAgentsForServer = vi.fn(async (_serverId: string) => ["agent-b"]);
    const model = useTerminalsViewModel({
      ...makeBaseArgs(),
      approveReadyAgentsForServer,
      denyAllPendingAgentsForServer,
    });

    await expect(model.onApproveReadyAgentsForServer("dgx")).resolves.toEqual(["agent-a"]);
    await expect(model.onDenyAllPendingAgentsForServer("dgx")).resolves.toEqual(["agent-b"]);
    expect(approveReadyAgentsForServer).toHaveBeenCalledWith("dgx");
    expect(denyAllPendingAgentsForServer).toHaveBeenCalledWith("dgx");
  });

  it("deduplicates multi-server agent actions before dispatch", async () => {
    const approveReadyAgentsForServers = vi.fn(async (_serverIds: string[]) => ["agent-1", "agent-2"]);
    const denyAllPendingAgentsForServers = vi.fn(async (_serverIds: string[]) => ["agent-3"]);
    const model = useTerminalsViewModel({
      ...makeBaseArgs(),
      approveReadyAgentsForServers,
      denyAllPendingAgentsForServers,
    });

    await expect(model.onApproveReadyAgentsForServers(["dgx", "dgx", " ", "cloud"])).resolves.toEqual([
      "agent-1",
      "agent-2",
    ]);
    await expect(model.onDenyAllPendingAgentsForServers(["cloud", "", "dgx", "cloud"])).resolves.toEqual([
      "agent-3",
    ]);

    expect(approveReadyAgentsForServers).toHaveBeenCalledWith(["dgx", "cloud"]);
    expect(denyAllPendingAgentsForServers).toHaveBeenCalledWith(["cloud", "dgx"]);
  });
});
