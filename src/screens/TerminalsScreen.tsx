import React, { useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { Alert, Modal, NativeSyntheticEvent, Pressable, ScrollView, Switch, Text, TextInput, TextInputKeyPressEventData, View, useWindowDimensions } from "react-native";

import { useAppContext } from "../context/AppContext";
import { CWD_PLACEHOLDER, DEFAULT_SHELL_WAIT_MS, STORAGE_PROCESS_PANEL_PREFS_PREFIX, isLikelyAiSession } from "../constants";
import { AnsiText } from "../components/AnsiText";
import { PageHeroCard } from "../components/PageHeroCard";
import { ServerSwitcherRail } from "../components/ServerSwitcherRail";
import { TerminalCard } from "../components/TerminalCard";
import { ProcessKillConfirmModal } from "../components/ProcessKillConfirmModal";
import { NovaAgentPanel } from "../components/NovaAgentPanel";
import { WorkspaceVoiceChannelsPanel } from "../components/WorkspaceVoiceChannelsPanel";
import { useSharedWorkspaces } from "../hooks/useSharedWorkspaces";
import { useVoiceChannels } from "../hooks/useVoiceChannels";
import { styles } from "../theme/styles";
import { getWorkspacePermissions } from "../workspacePermissions";
import { buildVmHostTargetGroups, buildVmHostVmTypeTargetGroups } from "../fleetTargets";
import { buildOpenTerminalEntries } from "../openTerminalEntries";
import { buildVoiceParticipantDirectory, deriveVoicePresence } from "../voicePresence";
import {
  TERMINAL_BG_OPACITY_OPTIONS,
  TERMINAL_FONT_OPTIONS,
  TERMINAL_MAX_FONT_SIZE,
  TERMINAL_MIN_FONT_SIZE,
  TERMINAL_THEME_PRESETS,
  buildTerminalAppearance,
  getTerminalPreset,
} from "../theme/terminalTheme";
import { GlassesBrand, ProcessSignal } from "../types";

function renderSessionChips(
  allSessions: string[],
  openSessions: string[],
  onToggleSessionVisible: (session: string) => void,
  sessionTags: Record<string, string[]>,
  tagFilter: string,
  pinnedSessions: string[],
  sessionAliases: Record<string, string>
) {
  const normalizedFilter = tagFilter.trim().toLowerCase();
  const pinnedSet = new Set(pinnedSessions);
  const visible = allSessions.filter((session) => {
    if (!normalizedFilter) {
      return true;
    }
    return (sessionTags[session] || []).includes(normalizedFilter);
  });

  if (visible.length === 0) {
    return <Text style={styles.emptyText}>No sessions match the current tag filter.</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
      {visible.map((session) => {
        const active = openSessions.includes(session);
        const label = sessionAliases[session]?.trim() || session;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${active ? "Hide" : "Show"} session ${label}`}
            key={session}
            style={[styles.chip, active ? styles.chipActive : null]}
            onPress={() => onToggleSessionVisible(session)}
          >
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
              {active ? `Open - ${label}` : label}
              {pinnedSet.has(session) ? " • PIN" : ""}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function sortSessionsPinnedFirst(sessions: string[], pinnedSessions: string[]): string[] {
  const pinnedSet = new Set(pinnedSessions);
  return sessions.slice().sort((a, b) => {
    const aPinned = pinnedSet.has(a) ? 1 : 0;
    const bPinned = pinnedSet.has(b) ? 1 : 0;
    if (aPinned !== bPinned) {
      return bPinned - aPinned;
    }
    return a.localeCompare(b);
  });
}

function formatNumber(value: number | undefined, decimals: number = 0): string {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "n/a";
  }
  return value.toFixed(decimals);
}

function sameIdSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const setA = new Set(a);
  return b.every((value) => setA.has(value));
}

function glassesBrandLabel(brand: GlassesBrand): string {
  if (brand === "xreal_x1") {
    return "XREAL X1";
  }
  if (brand === "halo") {
    return "Halo";
  }
  if (brand === "meta_orion") {
    return "Meta Orion";
  }
  if (brand === "meta_ray_ban") {
    return "Meta Ray-Ban";
  }
  if (brand === "viture_pro") {
    return "VITURE Pro";
  }
  return "Custom";
}

function glassesBrandPreset(brand: GlassesBrand): {
  textScale: number;
  loopCaptureMs: number;
  vadSilenceMs: number;
  vadSensitivityDb: number;
  wakePhrase: string;
} {
  if (brand === "halo") {
    return {
      textScale: 1.15,
      loopCaptureMs: 7600,
      vadSilenceMs: 1100,
      vadSensitivityDb: 9,
      wakePhrase: "halo",
    };
  }
  if (brand === "custom") {
    return {
      textScale: 1,
      loopCaptureMs: 6800,
      vadSilenceMs: 900,
      vadSensitivityDb: 8,
      wakePhrase: "nova",
    };
  }
  if (brand === "meta_orion") {
    return {
      textScale: 1,
      loopCaptureMs: 6200,
      vadSilenceMs: 750,
      vadSensitivityDb: 7,
      wakePhrase: "orion",
    };
  }
  if (brand === "meta_ray_ban") {
    return {
      textScale: 1.1,
      loopCaptureMs: 7000,
      vadSilenceMs: 950,
      vadSensitivityDb: 8,
      wakePhrase: "meta",
    };
  }
  if (brand === "viture_pro") {
    return {
      textScale: 1.05,
      loopCaptureMs: 6600,
      vadSilenceMs: 850,
      vadSensitivityDb: 7,
      wakePhrase: "viture",
    };
  }
  return {
    textScale: 1.05,
    loopCaptureMs: 6400,
    vadSilenceMs: 800,
    vadSensitivityDb: 7,
    wakePhrase: "xreal",
  };
}

type ProcessSortMode = "cpu" | "mem" | "uptime" | "name";

function normalizeProcessSorts(input: unknown): ProcessSortMode[] {
  if (!Array.isArray(input)) {
    return ["cpu"];
  }
  const allowed: ProcessSortMode[] = ["cpu", "mem", "uptime", "name"];
  const next = Array.from(new Set(input.filter((entry): entry is ProcessSortMode => allowed.includes(entry as ProcessSortMode))));
  return next.length > 0 ? next : ["cpu"];
}

export function TerminalsScreen() {
  const {
    activeServer,
    connected,
    focusedServerId,
    connections,
    unreadServers,
    connectedServerCount,
    totalActiveStreams,
    poolLifecyclePaused,
    servers,
    allSessions,
    openSessions,
    tails,
    drafts,
    sessionAiEngine,
    startCwd,
    startPrompt,
    startOpenOnMac,
    startKind,
    startAiEngine,
    capabilitiesLoading,
    health,
    capabilities,
    supportedFeatures,
    sysStats,
    hasExternalLlm,
    commandHistory,
    historyCount,
    sessionAliases,
    sessionTags,
    allTags,
    tagFilter,
    pinnedSessions,
    isPro,
    fleetCommand,
    fleetCwd,
    fleetTargets,
    fleetBusy,
    fleetWaitMs,
    shellRunWaitMs,
    fleetResults,
    processes,
    processesBusy,
    sessionPresence,
    sessionReadOnly,
    suggestionsBySession,
    suggestionBusyBySession,
    errorHintsBySession,
    triageBusyBySession,
    triageExplanationBySession,
    triageFixesBySession,
    watchRules,
    watchAlertHistoryBySession,
    terminalTheme,
    commandQueue,
    recordings,
    glassesMode,
    voiceRecording,
    voiceBusy,
    voiceTranscript,
    voiceError,
    voiceMeteringDb,
    onShowPaywall,
    onSetTagFilter,
    onSetStartCwd,
    onSetStartPrompt,
    onSetStartOpenOnMac,
    onSetStartKind,
    onSetStartAiEngine,
    onRefreshCapabilities,
    onRefreshSessions,
    onRefreshAllServers,
    onOpenServers,
    onFocusServer,
    onCreateSession,
    onReconnectServer,
    onReconnectServers,
    onReconnectAllServers,
    onConnectAllServers,
    onDisconnectAllServers,
    onEditServer,
    onOpenSshFallback,
    onStartSession,
    onToggleSessionVisible,
    onSetSessionMode,
    onSetSessionAiEngine,
    onOpenServerSessionOnMac,
    onSyncSession,
    onShareServerSessionLive,
    onExportSession,
    onFocusSession,
    onStopSession,
    onStopServerSession,
    onHideSession,
    onHistoryPrev,
    onHistoryNext,
    onSetTags,
    onSetSessionAlias,
    onAutoNameSession,
    onSetServerSessionDraft,
    onAdaptDraftForBackend,
    onSendServerSessionControlChar,
    onSendServerSessionCommand,
    onSendServerSessionDraft,
    onClearServerSessionDraft,
    onTogglePinSession,
    onSetFleetCommand,
    onSetFleetCwd,
    onSetFleetTargets,
    onToggleFleetTarget,
    onSetFleetWaitMs,
    onSetShellRunWaitMs,
    onRefreshProcesses,
    onKillProcess,
    onKillProcesses,
    onRefreshSessionPresence,
    onSetSessionReadOnly,
    onRequestSuggestions,
    onUseSuggestion,
    onExplainError,
    onSuggestErrorFixes,
    onToggleWatch,
    onSetWatchPattern,
    onClearWatchAlerts,
    onSetTerminalPreset,
    onSetTerminalFontFamily,
    onSetTerminalFontSize,
    onSetTerminalBackgroundOpacity,
    onFlushQueue,
    onRemoveQueuedCommand,
    onToggleRecording,
    onOpenPlayback,
    onDeleteRecording,
    onSetGlassesEnabled,
    onSetGlassesBrand,
    onSetGlassesTextScale,
    onSetGlassesVoiceAutoSend,
    onSetGlassesVoiceLoop,
    onSetGlassesWakePhraseEnabled,
    onSetGlassesWakePhrase,
    onSetGlassesMinimalMode,
    onSetGlassesVadEnabled,
    onSetGlassesVadSilenceMs,
    onSetGlassesVadSensitivityDb,
    onSetGlassesLoopCaptureMs,
    onSetGlassesHeadsetPttEnabled,
    onOpenGlassesMode,
    onOpenVrCommandCenter,
    onVoiceStartCapture,
    onVoiceStopCapture,
    onVoiceSendTranscript,
    onRunFleet,
  } = useAppContext().terminals;

  const { width } = useWindowDimensions();
  const { workspaces: sharedWorkspaces } = useSharedWorkspaces();
  const {
    channels: voiceChannels,
    loading: voiceChannelsLoading,
    backplaneStatus: voiceBackplaneStatus,
    backplaneLastError: voiceBackplaneLastError,
    createChannel,
    deleteChannel,
    joinChannel,
    leaveChannel,
    toggleMute,
    setActiveSpeaker,
    syncChannelParticipants,
  } = useVoiceChannels();
  const wantsSplit = width >= 900;
  const splitEnabled = !wantsSplit || isPro;
  const activeBackend = activeServer?.terminalBackend;
  const [layoutMode, setLayoutMode] = useState<"stack" | "tabs" | "grid" | "split">("stack");
  const [activeTabSession, setActiveTabSession] = useState<string | null>(null);
  const [showAllServerTerminals, setShowAllServerTerminals] = useState(false);
  const [showAdvancedControls, setShowAdvancedControls] = useState<boolean>(() => allSessions.length === 0);
  const [showControlCenter, setShowControlCenter] = useState<boolean>(false);
  const [showAdvancedSessionSetup, setShowAdvancedSessionSetup] = useState<boolean>(() => allSessions.length === 0);
  const [showAdvancedOps, setShowAdvancedOps] = useState<boolean>(false);
  const [showAdvancedAppearance, setShowAdvancedAppearance] = useState<boolean>(false);
  const [showAdvancedCollaboration, setShowAdvancedCollaboration] = useState<boolean>(false);
  const [glassesSession, setGlassesSession] = useState<string | null>(null);
  const [processFilter, setProcessFilter] = useState<string>("");
  const [processSorts, setProcessSorts] = useState<ProcessSortMode[]>(["cpu"]);
  const [processSignal, setProcessSignal] = useState<ProcessSignal>("TERM");
  const [selectedProcessPids, setSelectedProcessPids] = useState<number[]>([]);
  const [pendingProcessKill, setPendingProcessKill] = useState<{ pids: number[]; signal: ProcessSignal } | null>(null);
  const terminalAppearance = useMemo(() => buildTerminalAppearance(terminalTheme), [terminalTheme]);
  const glassesTerminalTextStyle = useMemo(
    () =>
      glassesMode.enabled
        ? [
            terminalAppearance.terminalTextStyle,
            {
              fontSize: Math.max(13, Math.round(13 * glassesMode.textScale)),
              lineHeight: Math.max(18, Math.round(18 * glassesMode.textScale)),
            },
          ]
        : terminalAppearance.terminalTextStyle,
    [glassesMode.enabled, glassesMode.textScale, terminalAppearance.terminalTextStyle]
  );
  const terminalPreset = useMemo(() => getTerminalPreset(terminalTheme.preset), [terminalTheme.preset]);
  const sortedAllSessions = useMemo(() => sortSessionsPinnedFirst(allSessions, pinnedSessions), [allSessions, pinnedSessions]);
  const sortedOpenSessions = useMemo(() => sortSessionsPinnedFirst(openSessions, pinnedSessions), [openSessions, pinnedSessions]);
  const openTerminalEntries = useMemo(
    () =>
      buildOpenTerminalEntries({
        showAllServerTerminals,
        sortedOpenSessions,
        focusedServerId,
        activeServerId: activeServer?.id || null,
        activeServerName: activeServer?.name || null,
        servers,
        connections,
        pinnedSessions,
      }),
    [activeServer?.id, activeServer?.name, connections, focusedServerId, pinnedSessions, servers, showAllServerTerminals, sortedOpenSessions]
  );
  const showServerBadge = connectedServerCount > 1;
  const vmHostTargetGroups = useMemo(() => buildVmHostTargetGroups(servers), [servers]);
  const vmHostVmTypeTargetGroups = useMemo(() => buildVmHostVmTypeTargetGroups(servers), [servers]);
  const disconnectedServerCount = Math.max(0, servers.length - connectedServerCount);
  const heroStats = useMemo(
    () => [
      { label: "Focused", value: activeServer?.name || "No server" },
      { label: "Open", value: `${openTerminalEntries.length}` },
      { label: "Streams", value: `${totalActiveStreams}` },
    ],
    [activeServer?.name, openTerminalEntries.length, totalActiveStreams]
  );
  const voiceParticipantDirectory = useMemo(
    () => buildVoiceParticipantDirectory(sessionPresence, sharedWorkspaces.flatMap((workspace) => workspace.members)),
    [sessionPresence, sharedWorkspaces]
  );

  const queueAgentCommand = (session: string, command: string) => {
    if (!focusedServerId || !session || !command.trim()) {
      return;
    }
    onSendServerSessionCommand(focusedServerId, session, command, "shell");
  };
  const activeServerId = focusedServerId || activeServer?.id || null;
  const canQuickStartAi = capabilities.codex || hasExternalLlm;

  const handleQuickStartSession = (kind: "shell" | "ai") => {
    if (!activeServerId) {
      onOpenServers();
      return;
    }
    if (kind === "shell" && !capabilities.terminal) {
      Alert.alert("Shell unavailable", "The focused server does not support shell sessions.");
      return;
    }
    if (kind === "ai" && !canQuickStartAi) {
      Alert.alert("AI unavailable", "Configure server AI or an external LLM profile first.");
      return;
    }
    void onCreateSession(activeServerId, kind).catch((error: unknown) => {
      Alert.alert("Could not start session", error instanceof Error ? error.message : String(error));
    });
  };

  const onStartPromptKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const native = event.nativeEvent as TextInputKeyPressEventData & { ctrlKey?: boolean; metaKey?: boolean };
    const key = (native.key || "").toLowerCase();
    if ((native.metaKey || native.ctrlKey) && key === "enter" && connected) {
      onStartSession();
    }
  };

  useEffect(() => {
    if (showAllServerTerminals && connectedServerCount < 2) {
      setShowAllServerTerminals(false);
    }
  }, [connectedServerCount, showAllServerTerminals]);

  useEffect(() => {
    if (typeof setActiveSpeaker !== "function") {
      return;
    }
    const joinedChannels = voiceChannels.filter((channel) => channel.joined);
    if (joinedChannels.length === 0) {
      return;
    }
    joinedChannels.forEach((joinedChannel) => {
      const currentSpeakerId = (joinedChannel.activeSpeakerId || "").trim().toLowerCase();
      if (voiceRecording) {
        if (currentSpeakerId === "local-user") {
          return;
        }
        setActiveSpeaker(joinedChannel.id, "local-user");
        return;
      }
      if (currentSpeakerId !== "local-user") {
        return;
      }
      setActiveSpeaker(joinedChannel.id, null);
    });
  }, [setActiveSpeaker, voiceChannels, voiceRecording]);

  useEffect(() => {
    if (typeof syncChannelParticipants !== "function") {
      return;
    }
    const joinedChannels = voiceChannels.filter((channel) => channel.joined);
    if (joinedChannels.length === 0) {
      return;
    }
    if (!focusedServerId) {
      return;
    }
    const presence = deriveVoicePresence(sessionPresence);
    const nextRemoteParticipants = presence.remoteParticipantIds;
    const nextActiveSpeakerId = voiceRecording ? "local-user" : presence.activeRemoteSpeakerId;
    joinedChannels.forEach((joinedChannel) => {
      const workspace = sharedWorkspaces.find((entry) => entry.id === joinedChannel.workspaceId);
      if (!workspace || !workspace.serverIds.includes(focusedServerId)) {
        return;
      }
      const existingRemoteParticipants = (joinedChannel.activeParticipantIds || [])
        .map((participantId) => participantId.trim().toLowerCase())
        .filter((participantId) => participantId && participantId !== "local-user")
        .sort();
      const hasSameParticipants =
        nextRemoteParticipants.length === existingRemoteParticipants.length &&
        nextRemoteParticipants.every((value, index) => value === existingRemoteParticipants[index]);
      const hasSameSpeaker = (joinedChannel.activeSpeakerId || null) === nextActiveSpeakerId;
      if (hasSameParticipants && hasSameSpeaker) {
        return;
      }
      syncChannelParticipants(joinedChannel.id, nextRemoteParticipants, {
        preserveLocalParticipant: true,
        activeSpeakerId: nextActiveSpeakerId,
      });
    });
  }, [focusedServerId, sessionPresence, sharedWorkspaces, syncChannelParticipants, voiceChannels, voiceRecording]);

  useEffect(() => {
    const valid = new Set(processes.map((entry) => entry.pid));
    setSelectedProcessPids((prev) => prev.filter((pid) => valid.has(pid)));
  }, [processes]);

  useEffect(() => {
    let mounted = true;
    async function loadProcessPrefs() {
      if (!activeServer?.id) {
        if (mounted) {
          setProcessFilter("");
          setProcessSorts(["cpu"]);
          setProcessSignal("TERM");
        }
        return;
      }
      const raw = await SecureStore.getItemAsync(`${STORAGE_PROCESS_PANEL_PREFS_PREFIX}.${activeServer.id}`);
      if (!mounted) {
        return;
      }
      if (!raw) {
        setProcessFilter("");
        setProcessSorts(["cpu"]);
        setProcessSignal("TERM");
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { filter?: unknown; sorts?: unknown; signal?: unknown };
        const nextSignal = parsed.signal === "KILL" || parsed.signal === "INT" ? parsed.signal : "TERM";
        setProcessFilter(typeof parsed.filter === "string" ? parsed.filter : "");
        setProcessSorts(normalizeProcessSorts(parsed.sorts));
        setProcessSignal(nextSignal);
      } catch {
        setProcessFilter("");
        setProcessSorts(["cpu"]);
        setProcessSignal("TERM");
      }
    }
    void loadProcessPrefs();
    return () => {
      mounted = false;
    };
  }, [activeServer?.id]);

  useEffect(() => {
    if (!activeServer?.id) {
      return;
    }
    void SecureStore.setItemAsync(
      `${STORAGE_PROCESS_PANEL_PREFS_PREFIX}.${activeServer.id}`,
      JSON.stringify({ filter: processFilter, sorts: processSorts, signal: processSignal })
    );
  }, [activeServer?.id, processFilter, processSignal, processSorts]);

  const visibleProcesses = useMemo(() => {
    const needle = processFilter.trim().toLowerCase();
    const filtered = processes.filter((entry) => {
      if (!needle) {
        return true;
      }
      return (
        String(entry.pid).includes(needle) ||
        entry.name.toLowerCase().includes(needle) ||
        (entry.user || "").toLowerCase().includes(needle) ||
        (entry.command || "").toLowerCase().includes(needle)
      );
    });

    const sorted = filtered.slice().sort((a, b) => {
      for (const mode of processSorts) {
        if (mode === "name") {
          const diff = a.name.localeCompare(b.name);
          if (diff !== 0) {
            return diff;
          }
          continue;
        }
        if (mode === "mem") {
          const diff = (b.mem_percent || 0) - (a.mem_percent || 0);
          if (diff !== 0) {
            return diff;
          }
          continue;
        }
        if (mode === "uptime") {
          const diff = (b.uptime_seconds || 0) - (a.uptime_seconds || 0);
          if (diff !== 0) {
            return diff;
          }
          continue;
        }
        const diff = (b.cpu_percent || 0) - (a.cpu_percent || 0);
        if (diff !== 0) {
          return diff;
        }
      }
      return a.pid - b.pid;
    });
    return sorted;
  }, [processFilter, processSorts, processes]);

  useEffect(() => {
    if (openTerminalEntries.length === 0) {
      if (activeTabSession !== null) {
        setActiveTabSession(null);
      }
      return;
    }
    if (!activeTabSession || !openTerminalEntries.some((entry) => entry.key === activeTabSession)) {
      setActiveTabSession(openTerminalEntries[0].key);
    }
  }, [activeTabSession, openTerminalEntries]);

  useEffect(() => {
    if (sortedOpenSessions.length === 0) {
      if (glassesSession !== null) {
        setGlassesSession(null);
      }
      return;
    }
    if (!glassesSession || !sortedOpenSessions.includes(glassesSession)) {
      setGlassesSession(sortedOpenSessions[0]);
    }
  }, [glassesSession, sortedOpenSessions]);

  const openTerminalCards = useMemo(() => {
    return openTerminalEntries.map((entry) => {
      const { session, serverId, serverName, connection, isFocusedServer } = entry;
      const scopedCapabilities = connection?.capabilities || capabilities;
      const scopedConnected = typeof connection?.connected === "boolean" ? connection.connected : connected;
      const scopedLocalAiSessions = connection?.localAiSessions || [];
      const scopedTails = connection?.tails || {};
      const scopedDrafts = connection?.drafts || {};
      const scopedSendBusy = connection?.sendBusy || {};
      const scopedStreamLive = connection?.streamLive || {};
      const scopedSendModes = connection?.sendModes || {};
      const scopedConnectionMeta = connection?.connectionMeta || {};
      const output = scopedTails[session] ?? "";
      const draft = scopedDrafts[session] ?? "";
      const isSending = Boolean(scopedSendBusy[session]);
      const isLive = Boolean(scopedStreamLive[session]);
      const mode = scopedSendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
      const meta = scopedConnectionMeta[session];
      const isLocalOnly = scopedLocalAiSessions.includes(session);
      const aiEngine = isFocusedServer
        ? sessionAiEngine[session] || (isLocalOnly ? "external" : "auto")
        : isLocalOnly
          ? "external"
          : "auto";
      const watch = isFocusedServer ? watchRules[session] || { enabled: false, pattern: "", lastMatch: null } : { enabled: false, pattern: "", lastMatch: null };
      const recording = isFocusedServer ? recordings[session] : undefined;
      const collaborators = isFocusedServer ? sessionPresence[session] || [] : [];
      const readOnly = isFocusedServer ? Boolean(sessionReadOnly[session]) : false;
      const recordingDuration = recording?.chunks.length ? recording.chunks[recording.chunks.length - 1]?.atMs || 0 : 0;
      const sessionAlias = isFocusedServer ? sessionAliases[session] || "" : "";
      const tags = isFocusedServer ? sessionTags[session] || [] : [];
      const pinned = isFocusedServer ? pinnedSessions.includes(session) : false;
      const queuedItems = isFocusedServer ? commandQueue[session] || [] : [];
      const suggestions = isFocusedServer ? suggestionsBySession[session] || [] : [];
      const suggestionsBusy = isFocusedServer ? Boolean(suggestionBusyBySession[session]) : false;
      const errorHint = isFocusedServer ? errorHintsBySession[session] || null : null;
      const triageBusy = isFocusedServer ? Boolean(triageBusyBySession[session]) : false;
      const triageExplanation = isFocusedServer ? triageExplanationBySession[session] || "" : "";
      const triageFixes = isFocusedServer ? triageFixesBySession[session] || [] : [];
      const watchAlerts = isFocusedServer ? watchAlertHistoryBySession[session] || [] : [];
      const historySuggestions = isFocusedServer ? commandHistory[session] || [] : [];
      const scopedBackend = connection?.server.terminalBackend || (isFocusedServer ? activeBackend : undefined);
      const historyValue = isFocusedServer ? historyCount[session] || 0 : 0;

      return (
        <TerminalCard
          key={entry.key}
          session={session}
          sessionAlias={sessionAlias}
          serverLabel={serverName}
          showServerLabel={showServerBadge}
          output={output}
          draft={draft}
          isSending={isSending}
          isLive={isLive}
          isServerConnected={!isLocalOnly && scopedConnected}
          connectionState={isLocalOnly ? "disconnected" : meta?.state ?? "disconnected"}
          isLocalOnly={isLocalOnly}
          mode={mode}
          aiAvailable={isFocusedServer ? scopedCapabilities.codex || hasExternalLlm : false}
          shellAvailable={isFocusedServer ? !isLocalOnly && scopedCapabilities.terminal : false}
          canOpenOnMac={!isLocalOnly && scopedCapabilities.macAttach}
          canSync={isFocusedServer && !isLocalOnly}
          canShareLive={!isLocalOnly && scopedCapabilities.spectate}
          canStop={isFocusedServer && !isLocalOnly}
          aiEngine={aiEngine}
          canUseServerAi={isFocusedServer && !isLocalOnly && scopedCapabilities.codex}
          canUseExternalAi={isFocusedServer && hasExternalLlm}
          suggestions={suggestions}
          suggestionsBusy={suggestionsBusy}
          errorHint={errorHint}
          triageBusy={triageBusy}
          triageExplanation={triageExplanation}
          triageFixes={triageFixes}
          watchEnabled={watch.enabled}
          watchPattern={watch.pattern}
          watchAlerts={watchAlerts}
          collaborationAvailable={!isLocalOnly && scopedCapabilities.collaboration}
          collaborators={collaborators}
          readOnly={readOnly}
          tags={tags}
          pinned={pinned}
          queuedItems={queuedItems}
          recordingActive={Boolean(recording?.active)}
          recordingChunks={recording?.chunks.length || 0}
          recordingDurationMs={recordingDuration}
          historySuggestions={historySuggestions}
          terminalBackend={scopedBackend}
          terminalViewStyle={terminalAppearance.terminalViewStyle}
          terminalTextStyle={glassesTerminalTextStyle}
          historyCount={historyValue}
          onSetMode={(nextMode) => {
            if (isFocusedServer) {
              onSetSessionMode(session, nextMode);
              return;
            }
            onFocusServer(serverId);
          }}
          onSetAiEngine={(nextEngine) => {
            if (isFocusedServer) {
              onSetSessionAiEngine(session, nextEngine);
              return;
            }
            onFocusServer(serverId);
          }}
          onOpenOnMac={() => onOpenServerSessionOnMac(serverId, session)}
          onSync={() => {
            if (isFocusedServer) {
              onSyncSession(session);
              return;
            }
            onFocusServer(serverId);
          }}
          onShareLive={() => onShareServerSessionLive(serverId, session)}
          onExport={() => {
            if (isFocusedServer) {
              onExportSession(session);
              return;
            }
            onFocusServer(serverId);
          }}
          onFullscreen={() => {
            if (isFocusedServer) {
              onFocusSession(session);
              return;
            }
            onFocusServer(serverId);
          }}
          onStop={() => {
            if (isFocusedServer) {
              onStopSession(session);
              return;
            }
            if (typeof onStopServerSession === "function") {
              onStopServerSession(serverId, session);
              return;
            }
            onSendServerSessionControlChar(serverId, session, "\u0003");
          }}
          onHide={() => {
            if (isFocusedServer) {
              onHideSession(session);
              return;
            }
            onFocusServer(serverId);
          }}
          onHistoryPrev={() => {
            if (isFocusedServer) {
              onHistoryPrev(session);
            }
          }}
          onHistoryNext={() => {
            if (isFocusedServer) {
              onHistoryNext(session);
            }
          }}
          onTagsChange={(raw) => {
            if (isFocusedServer) {
              onSetTags(session, raw);
            }
          }}
          onSessionAliasChange={(value) => {
            if (isFocusedServer) {
              onSetSessionAlias(session, value);
            }
          }}
          onAutoName={() => {
            if (isFocusedServer) {
              onAutoNameSession(session);
            }
          }}
          onDraftChange={(value) => onSetServerSessionDraft(serverId, session, value)}
          onAdaptDraftForBackend={() => {
            if (isFocusedServer) {
              onAdaptDraftForBackend(session);
            }
          }}
          onSendControlChar={(value) => onSendServerSessionControlChar(serverId, session, value)}
          onRequestSuggestions={() => {
            if (isFocusedServer) {
              onRequestSuggestions(session);
            }
          }}
          onUseSuggestion={(value) => {
            if (isFocusedServer) {
              onUseSuggestion(session, value);
            }
          }}
          onExplainError={() => {
            if (isFocusedServer) {
              onExplainError(session);
            }
          }}
          onSuggestErrorFixes={() => {
            if (isFocusedServer) {
              onSuggestErrorFixes(session);
            }
          }}
          onToggleWatch={(enabled) => {
            if (isFocusedServer) {
              onToggleWatch(session, enabled);
            }
          }}
          onWatchPatternChange={(pattern) => {
            if (isFocusedServer) {
              onSetWatchPattern(session, pattern);
            }
          }}
          onClearWatchAlerts={() => {
            if (isFocusedServer) {
              onClearWatchAlerts(session);
            }
          }}
          onRefreshPresence={() => {
            if (isFocusedServer) {
              onRefreshSessionPresence(session);
            }
          }}
          onSetReadOnly={(value) => {
            if (isFocusedServer) {
              onSetSessionReadOnly(session, value);
            }
          }}
          onTogglePin={() => {
            if (isFocusedServer) {
              onTogglePinSession(session);
            }
          }}
          onFlushQueue={() => {
            if (isFocusedServer) {
              onFlushQueue(session);
            }
          }}
          onRemoveQueuedCommand={(index) => {
            if (isFocusedServer) {
              onRemoveQueuedCommand(session, index);
            }
          }}
          onToggleRecording={() => {
            if (isFocusedServer) {
              onToggleRecording(session);
            }
          }}
          onOpenPlayback={() => {
            if (isFocusedServer) {
              onOpenPlayback(session);
            }
          }}
          onDeleteRecording={() => {
            if (isFocusedServer) {
              onDeleteRecording(session);
            }
          }}
          onSend={() => onSendServerSessionDraft(serverId, session)}
          onClear={() => onClearServerSessionDraft(serverId, session)}
        />
      );
    });
  }, [
    activeBackend,
    capabilities,
    commandHistory,
    commandQueue,
    connected,
    errorHintsBySession,
    glassesTerminalTextStyle,
    hasExternalLlm,
    historyCount,
    onAdaptDraftForBackend,
    onAutoNameSession,
    onClearServerSessionDraft,
    onClearWatchAlerts,
    onDeleteRecording,
    onExplainError,
    onExportSession,
    onFlushQueue,
    onFocusServer,
    onFocusSession,
    onHideSession,
    onHistoryNext,
    onHistoryPrev,
    onOpenPlayback,
    onOpenServerSessionOnMac,
    onRefreshSessionPresence,
    onRemoveQueuedCommand,
    onRequestSuggestions,
    onSendServerSessionControlChar,
    onSendServerSessionDraft,
    onSetServerSessionDraft,
    onSetSessionAiEngine,
    onSetSessionAlias,
    onSetSessionMode,
    onSetSessionReadOnly,
    onSetTags,
    onSetWatchPattern,
    onShareServerSessionLive,
    onStopSession,
    onSuggestErrorFixes,
    onSyncSession,
    onTogglePinSession,
    onToggleRecording,
    onToggleWatch,
    onUseSuggestion,
    openTerminalEntries,
    pinnedSessions,
    recordings,
    sessionAiEngine,
    sessionAliases,
    sessionPresence,
    sessionReadOnly,
    sessionTags,
    suggestionBusyBySession,
    suggestionsBySession,
    terminalAppearance.terminalViewStyle,
    triageBusyBySession,
    triageExplanationBySession,
    triageFixesBySession,
    watchAlertHistoryBySession,
    watchRules,
    showServerBadge,
  ]);

  const tabActiveIndex = activeTabSession ? openTerminalEntries.findIndex((entry) => entry.key === activeTabSession) : -1;
  const tabCard = tabActiveIndex >= 0 ? openTerminalCards[tabActiveIndex] : null;
  const glassesActiveSession = glassesSession && sortedOpenSessions.includes(glassesSession)
    ? glassesSession
    : sortedOpenSessions[0] || null;
  const glassesOutput = glassesActiveSession ? tails[glassesActiveSession] || "" : "";
  const glassesDraft = glassesActiveSession ? drafts[glassesActiveSession] || "" : "";
  const glassesSessionLabel = glassesActiveSession ? sessionAliases[glassesActiveSession]?.trim() || glassesActiveSession : "No session";
  const glassesTextStyle = useMemo(
    () => [
      terminalAppearance.terminalTextStyle,
      {
        fontSize: Math.max(13, Math.round(14 * glassesMode.textScale)),
        lineHeight: Math.max(18, Math.round(20 * glassesMode.textScale)),
      },
    ],
    [glassesMode.textScale, terminalAppearance.terminalTextStyle]
  );
  const renderOpenTerminals = () => {
    if (openTerminalCards.length === 0) {
      return <Text style={styles.emptyText}>{showAllServerTerminals ? "No open sessions across the server pool." : "Tap a session above to open it."}</Text>;
    }

    if (layoutMode === "tabs") {
      return (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {openTerminalEntries.map((entry) => {
              const alias = entry.isFocusedServer ? sessionAliases[entry.session]?.trim() || entry.session : entry.session;
              const label = showAllServerTerminals ? `${entry.serverName} • ${alias}` : alias;
              return (
                <Pressable accessibilityRole="button"
                  accessibilityLabel={`Select open session ${label}`}
                  key={`tab-${entry.key}`}
                  style={[styles.chip, activeTabSession === entry.key ? styles.chipActive : null]}
                  onPress={() => setActiveTabSession(entry.key)}
                >
                  <Text style={[styles.chipText, activeTabSession === entry.key ? styles.chipTextActive : null]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {tabCard}
        </>
      );
    }

    if (layoutMode === "grid") {
      const gridColumns = wantsSplit ? 2 : 1;
      return (
        <View style={styles.actionsWrap}>
          {openTerminalCards.map((card, index) => (
            <View
              key={`grid-${openTerminalEntries[index]?.key || index}`}
              style={{
                width: gridColumns === 2 ? "49%" : "100%",
              }}
            >
              {card}
            </View>
          ))}
        </View>
      );
    }

    if (layoutMode === "split") {
      if (openTerminalCards.length === 1) {
        return openTerminalCards[0];
      }
      return (
        <View style={styles.actionsWrap}>
          {openTerminalCards.slice(0, 2).map((card, index) => (
            <View
              key={`split-${openTerminalEntries[index]?.key || index}`}
              style={{
                width: wantsSplit ? "49%" : "100%",
              }}
            >
              {card}
            </View>
          ))}
        </View>
      );
    }

    return openTerminalCards;
  };

  const fleetPanel = (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>Fleet Execute</Text>
      <Text style={styles.serverSubtitle}>Run one shell command across multiple servers with grouped output.</Text>

      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={fleetCommand}
        onChangeText={onSetFleetCommand}
        placeholder="Command to run on all selected servers"
        placeholderTextColor="#7f7aa8"
        multiline
      />
      <TextInput
        style={styles.input}
        value={fleetCwd}
        onChangeText={onSetFleetCwd}
        placeholder={CWD_PLACEHOLDER}
        placeholderTextColor="#7f7aa8"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        value={fleetWaitMs}
        onChangeText={(value) => onSetFleetWaitMs(value.replace(/[^0-9]/g, ""))}
        placeholder="Wait ms (default 5000)"
        placeholderTextColor="#7f7aa8"
        keyboardType="number-pad"
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {servers.map((server) => {
          const active = fleetTargets.includes(server.id);
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${active ? "Remove" : "Add"} ${server.name} as fleet target`} key={server.id} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => onToggleFleetTarget(server.id)}>
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{server.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {vmHostTargetGroups.length > 0 ? (
        <>
          <Text style={styles.serverSubtitle}>VM Host Targets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {vmHostTargetGroups.map((group) => {
              const active = group.serverIds.length > 0 && sameIdSet(fleetTargets, group.serverIds);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Apply VM host ${group.label} as fleet targets`}
                  key={`fleet-vmhost-${group.key}`}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => onSetFleetTargets(group.serverIds)}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{`${group.label} (${group.serverIds.length})`}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {vmHostVmTypeTargetGroups.length > 0 ? (
        <>
          <Text style={styles.serverSubtitle}>VM Type Targets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {vmHostVmTypeTargetGroups.map((group) => {
              const active = group.serverIds.length > 0 && sameIdSet(fleetTargets, group.serverIds);
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Apply ${group.label} as fleet targets`}
                  key={`fleet-vmtype-${group.key}`}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => onSetFleetTargets(group.serverIds)}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                    {`${group.label} (${group.serverIds.length})`}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </>
      ) : null}

      {sharedWorkspaces.length > 0 ? (
        <>
          <Text style={styles.serverSubtitle}>Workspace Targets</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {sharedWorkspaces.map((workspace) => {
              const targetIds = workspace.serverIds.filter((serverId) => servers.some((server) => server.id === serverId));
              const permissions = getWorkspacePermissions(workspace);
              const active = targetIds.length > 0 && sameIdSet(fleetTargets, targetIds);
              const disabled = targetIds.length === 0 || !permissions.canUseFleetTargets;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Apply workspace ${workspace.name} as fleet targets`}
                  key={`fleet-workspace-${workspace.id}`}
                  style={[styles.chip, active ? styles.chipActive : null, disabled ? styles.buttonDisabled : null]}
                  onPress={() => {
                    if (disabled) {
                      return;
                    }
                    onSetFleetTargets(targetIds);
                  }}
                  disabled={disabled}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                    {`${workspace.name} (${targetIds.length})${permissions.canUseFleetTargets ? "" : " • view only"}`}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear all fleet targets"
              style={[styles.chip, fleetTargets.length === 0 ? styles.chipActive : null]}
              onPress={() => onSetFleetTargets([])}
            >
              <Text style={[styles.chipText, fleetTargets.length === 0 ? styles.chipTextActive : null]}>Clear</Text>
            </Pressable>
          </ScrollView>
        </>
      ) : null}

      <Pressable accessibilityRole="button"
        accessibilityLabel="Run command across selected servers"
        style={[styles.buttonPrimary, fleetBusy ? styles.buttonDisabled : null]}
        onPress={onRunFleet}
        disabled={fleetBusy || !capabilities.terminal}
      >
        <Text style={styles.buttonPrimaryText}>{fleetBusy ? "Running Fleet Command..." : "Run Across Fleet"}</Text>
      </Pressable>

      {!capabilities.terminal ? <Text style={styles.emptyText}>Current server does not advertise terminal session support.</Text> : null}

      {fleetResults.length > 0 ? (
        <View style={styles.serverListWrap}>
          {fleetResults.map((result) => (
            <View key={`${result.serverId}-${result.session || "none"}`} style={styles.terminalCard}>
              <View style={styles.terminalNameRow}>
                <Text style={styles.terminalName}>{result.serverName}</Text>
                <Text style={[styles.livePill, result.ok ? styles.livePillOn : styles.livePillOff]}>{result.ok ? "OK" : "ERR"}</Text>
              </View>
              <Text style={styles.serverSubtitle}>{result.session ? `Session ${result.session}` : "No session"}</Text>
              <Text style={styles.emptyText}>{result.error || result.output.slice(0, 1000) || "No output"}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );

  const topPanels = (
    <>
      <ServerSwitcherRail
        servers={servers}
        connections={connections}
        focusedServerId={focusedServerId}
        onFocusServer={onFocusServer}
        onReconnectServer={onReconnectServer}
        onReconnectServers={onReconnectServers}
        onEditServer={onEditServer}
        onAddServer={onOpenServers}
        unreadServers={unreadServers}
      />

      <View style={styles.serverPoolSummary}>
        <View style={styles.serverPoolSummaryMetrics}>
          <Text style={styles.serverPoolSummaryText}>{`Connected ${connectedServerCount}/${servers.length}`}</Text>
          <Text style={styles.serverPoolSummaryText}>{`Live streams ${totalActiveStreams}`}</Text>
          <Text style={styles.serverPoolSummaryText}>{`Unread ${unreadServers.size}`}</Text>
        </View>
        <View style={styles.serverPoolSummaryStack}>
          <Text style={styles.serverSubtitle}>
            {poolLifecyclePaused
              ? "Pool paused. Streams are stopped until resumed."
              : disconnectedServerCount > 0
                ? `${disconnectedServerCount} server(s) disconnected`
                : "All configured servers are connected"}
          </Text>
          <View style={styles.serverPoolSummaryActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={poolLifecyclePaused ? "Resume connection pool" : "Pause connection pool"}
              style={[styles.actionButton, servers.length === 0 ? styles.buttonDisabled : null]}
              disabled={servers.length === 0}
              onPress={poolLifecyclePaused ? onConnectAllServers : onDisconnectAllServers}
            >
              <Text style={styles.actionButtonText}>{poolLifecyclePaused ? "Resume Pool" : "Pause Pool"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Refresh sessions for all connected servers"
              style={[styles.actionButton, connectedServerCount === 0 ? styles.buttonDisabled : null]}
              disabled={connectedServerCount === 0}
              onPress={onRefreshAllServers}
            >
              <Text style={styles.actionButtonText}>Refresh All</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reconnect all connected servers"
              style={[styles.actionButton, connectedServerCount === 0 ? styles.buttonDisabled : null]}
              disabled={connectedServerCount === 0}
              onPress={onReconnectAllServers}
            >
              <Text style={styles.actionButtonText}>Reconnect All</Text>
            </Pressable>
          </View>
        </View>
        <View style={styles.serverPoolSummaryStack}>
          <View style={styles.serverPoolSummaryModes}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show terminals for focused server"
              style={[styles.chip, !showAllServerTerminals ? styles.chipActive : null]}
              onPress={() => setShowAllServerTerminals(false)}
            >
              <Text style={[styles.chipText, !showAllServerTerminals ? styles.chipTextActive : null]}>Focused</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show terminals for all servers"
              style={[styles.chip, showAllServerTerminals ? styles.chipActive : null, connectedServerCount < 2 ? styles.buttonDisabled : null]}
              onPress={() => setShowAllServerTerminals(true)}
              disabled={connectedServerCount < 2}
            >
              <Text style={[styles.chipText, showAllServerTerminals ? styles.chipTextActive : null]}>All Servers</Text>
            </Pressable>
          </View>
          <Text style={styles.serverSubtitle}>
            {showAllServerTerminals ? "Showing pooled open sessions from every server." : "Showing only sessions from the focused server."}
          </Text>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Connection Health</Text>
        <View style={[styles.rowInlineSpace, styles.rowInlineSpaceWrap]}>
          <Text style={styles.serverSubtitle}>{`Streams ${health.activeStreams}/${health.openSessions}`}</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Recheck server capabilities"
            style={[styles.actionButton, !connected || capabilitiesLoading ? styles.buttonDisabled : null]}
            onPress={onRefreshCapabilities}
            disabled={!connected || capabilitiesLoading}
          >
            <Text style={styles.actionButtonText}>{capabilitiesLoading ? "Checking..." : "Recheck Features"}</Text>
          </Pressable>
        </View>
        <Text style={styles.serverSubtitle}>{`Latency ${health.latencyMs !== null ? `${health.latencyMs} ms` : "n/a"}`}</Text>
        <Text style={styles.serverSubtitle}>{`Last ping ${health.lastPingAt ? new Date(health.lastPingAt).toLocaleTimeString() : "never"}`}</Text>
        <Text style={styles.emptyText}>{`Server features: ${supportedFeatures || "none"}`}</Text>
      </View>

      <NovaAgentPanel
        server={activeServer}
        serverId={focusedServerId}
        serverName={activeServer?.name || null}
        sessions={sortedOpenSessions}
        isPro={isPro}
        onShowPaywall={onShowPaywall}
        onQueueCommand={queueAgentCommand}
        surface="panel"
      />

      <WorkspaceVoiceChannelsPanel
        workspaces={sharedWorkspaces}
        channels={voiceChannels}
        loading={voiceChannelsLoading}
        onCreateChannel={(workspaceId, name) => createChannel({ workspaceId, name })}
        onDeleteChannel={deleteChannel}
        onJoinChannel={joinChannel}
        onLeaveChannel={leaveChannel}
        onToggleMute={toggleMute}
        participantDirectory={voiceParticipantDirectory}
        backplaneStatus={voiceBackplaneStatus}
        backplaneError={voiceBackplaneLastError}
        onOpenServers={onOpenServers}
      />

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>On-the-Go Glasses Mode</Text>
        <Text style={styles.serverSubtitle}>Profiled for XREAL X1 and Halo mirrored displays with voice-to-AI control.</Text>

        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Enable HUD</Text>
          <Switch
            accessibilityLabel="Enable glasses HUD mode"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.enabled ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.enabled}
            onValueChange={onSetGlassesEnabled}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {(
            ["xreal_x1", "halo", "meta_orion", "meta_ray_ban", "viture_pro", "custom"] as GlassesBrand[]
          ).map((brand) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Set glasses brand to ${glassesBrandLabel(brand)}`}
              key={`glasses-brand-${brand}`}
              style={[styles.chip, glassesMode.brand === brand ? styles.chipActive : null]}
              onPress={() => onSetGlassesBrand(brand)}
            >
              <Text style={[styles.chipText, glassesMode.brand === brand ? styles.chipTextActive : null]}>{glassesBrandLabel(brand)}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apply ${glassesBrandLabel(glassesMode.brand)} glasses preset`}
          accessibilityHint="Sets recommended text and voice loop values for this glasses brand."
          style={styles.actionButton}
          onPress={() => {
            const preset = glassesBrandPreset(glassesMode.brand);
            onSetGlassesTextScale(preset.textScale);
            onSetGlassesLoopCaptureMs(preset.loopCaptureMs);
            onSetGlassesVadSilenceMs(preset.vadSilenceMs);
            onSetGlassesVadSensitivityDb(preset.vadSensitivityDb);
            if (!glassesMode.wakePhraseEnabled || !glassesMode.wakePhrase.trim()) {
              onSetGlassesWakePhrase(preset.wakePhrase);
            }
          }}
        >
          <Text style={styles.actionButtonText}>{`Apply ${glassesBrandLabel(glassesMode.brand)} preset`}</Text>
        </Pressable>

        <View style={styles.rowInlineSpace}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Decrease glasses text scale"
            style={[styles.actionButton, glassesMode.textScale <= 0.85 ? styles.buttonDisabled : null]}
            disabled={glassesMode.textScale <= 0.85}
            onPress={() => onSetGlassesTextScale(glassesMode.textScale - 0.05)}
          >
            <Text style={styles.actionButtonText}>Text -</Text>
          </Pressable>
          <Text style={styles.serverSubtitle}>{`${glassesBrandLabel(glassesMode.brand)} • ${Math.round(glassesMode.textScale * 100)}% text`}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Increase glasses text scale"
            style={[styles.actionButton, glassesMode.textScale >= 1.6 ? styles.buttonDisabled : null]}
            disabled={glassesMode.textScale >= 1.6}
            onPress={() => onSetGlassesTextScale(glassesMode.textScale + 0.05)}
          >
            <Text style={styles.actionButtonText}>Text +</Text>
          </Pressable>
        </View>

        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Auto-send voice transcript</Text>
          <Switch
            accessibilityLabel="Toggle auto send voice transcript"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.voiceAutoSend ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.voiceAutoSend}
            onValueChange={onSetGlassesVoiceAutoSend}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Continuous voice loop</Text>
          <Switch
            accessibilityLabel="Toggle continuous voice loop"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.voiceLoop ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.voiceLoop}
            onValueChange={onSetGlassesVoiceLoop}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Require wake phrase</Text>
          <Switch
            accessibilityLabel="Toggle wake phrase requirement"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.wakePhraseEnabled ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.wakePhraseEnabled}
            onValueChange={onSetGlassesWakePhraseEnabled}
          />
        </View>
        {glassesMode.wakePhraseEnabled ? (
          <TextInput
            style={styles.input}
            value={glassesMode.wakePhrase}
            onChangeText={onSetGlassesWakePhrase}
            placeholder="Wake phrase (example: nova)"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Minimal on-the-go layout</Text>
          <Switch
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.minimalMode ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.minimalMode}
            onValueChange={onSetGlassesMinimalMode}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Server VAD assist</Text>
          <Switch
            accessibilityLabel="Toggle server VAD assist"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.vadEnabled ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.vadEnabled}
            onValueChange={onSetGlassesVadEnabled}
          />
        </View>
        <TextInput
          style={styles.input}
          value={String(glassesMode.loopCaptureMs)}
          onChangeText={(value) => onSetGlassesLoopCaptureMs(Number.parseInt(value.replace(/[^0-9]/g, ""), 10) || 0)}
          placeholder="Loop capture ms (1500-30000)"
          placeholderTextColor="#7f7aa8"
          keyboardType="number-pad"
        />
        {glassesMode.vadEnabled ? (
          <>
            <TextInput
              style={styles.input}
              value={String(glassesMode.vadSilenceMs)}
              onChangeText={(value) => onSetGlassesVadSilenceMs(Number.parseInt(value.replace(/[^0-9]/g, ""), 10) || 0)}
              placeholder="VAD silence ms (250-5000)"
              placeholderTextColor="#7f7aa8"
              keyboardType="number-pad"
            />
            <TextInput
              style={styles.input}
              value={String(glassesMode.vadSensitivityDb)}
              onChangeText={(value) => onSetGlassesVadSensitivityDb(Number.parseFloat(value.replace(/[^0-9.]/g, "")) || 0)}
              placeholder="VAD sensitivity dB above ambient (2-20)"
              placeholderTextColor="#7f7aa8"
              keyboardType="decimal-pad"
            />
          </>
        ) : null}
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>BT remote push-to-talk keys</Text>
          <Switch
            accessibilityLabel="Toggle Bluetooth push to talk keys"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.headsetPttEnabled ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.headsetPttEnabled}
            onValueChange={onSetGlassesHeadsetPttEnabled}
          />
        </View>

        {glassesMode.enabled ? (
          <>
            <Text style={styles.serverSubtitle}>{`Target session: ${glassesSessionLabel}`}</Text>
            {sortedOpenSessions.length > 0 ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {sortedOpenSessions.map((session) => (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Select glasses target session ${sessionAliases[session]?.trim() || session}`}
                    key={`glasses-session-${session}`}
                    style={[styles.chip, glassesActiveSession === session ? styles.chipActive : null]}
                    onPress={() => setGlassesSession(session)}
                  >
                    <Text style={[styles.chipText, glassesActiveSession === session ? styles.chipTextActive : null]}>
                      {sessionAliases[session]?.trim() || session}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <Text style={styles.emptyText}>Open a terminal session to use glasses mode.</Text>
            )}

            <View style={styles.actionsWrap}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start glasses voice capture"
                style={[styles.actionButton, voiceRecording || voiceBusy ? styles.buttonDisabled : null]}
                disabled={voiceRecording || voiceBusy}
                onPress={onVoiceStartCapture}
              >
                <Text style={styles.actionButtonText}>Start Voice</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Stop glasses voice capture and transcribe"
                style={[styles.actionButton, !voiceRecording || voiceBusy || !glassesActiveSession ? styles.buttonDisabled : null]}
                disabled={!voiceRecording || voiceBusy || !glassesActiveSession}
                onPress={() => {
                  if (glassesActiveSession) {
                    onVoiceStopCapture(glassesActiveSession);
                  }
                }}
              >
                <Text style={styles.actionButtonText}>{voiceBusy ? "Transcribing..." : "Stop + Transcribe"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send glasses transcript"
                style={[styles.actionButton, !voiceTranscript.trim() || voiceBusy || !glassesActiveSession ? styles.buttonDisabled : null]}
                disabled={!voiceTranscript.trim() || voiceBusy || !glassesActiveSession}
                onPress={() => {
                  if (glassesActiveSession) {
                    onVoiceSendTranscript(glassesActiveSession);
                  }
                }}
              >
                <Text style={styles.actionButtonText}>Send Transcript</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open spatial glasses HUD"
                accessibilityHint="Opens the dedicated multi-panel glasses route with cross-server voice control."
                style={[styles.buttonPrimary, !glassesActiveSession ? styles.buttonDisabled : null]}
                disabled={!glassesActiveSession}
                onPress={onOpenGlassesMode}
              >
                <Text style={styles.buttonPrimaryText}>Open Spatial HUD</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open VR command center"
                accessibilityHint="Opens the VR command center preview with pooled server runtime controls."
                style={[styles.buttonGhost, !glassesActiveSession ? styles.buttonDisabled : null]}
                disabled={!glassesActiveSession}
                onPress={onOpenVrCommandCenter}
              >
                <Text style={styles.buttonGhostText}>Open VR Command Center</Text>
              </Pressable>
            </View>

            <Text style={styles.emptyText}>
              {voiceRecording
                ? "Listening... speak your command clearly."
                : voiceBusy
                ? "Processing voice input..."
                : glassesMode.voiceLoop
                ? "Voice loop is enabled. Stop + Transcribe will auto re-arm capture."
                : "Open Spatial HUD to route voice commands across multiple servers and panels."}
            </Text>
            {voiceError ? <Text style={styles.emptyText}>{`Voice error: ${voiceError}`}</Text> : null}
            {voiceTranscript.trim() ? <Text style={styles.serverSubtitle}>{`Transcript: ${voiceTranscript}`}</Text> : null}
            {voiceRecording && typeof voiceMeteringDb === "number" ? (
              <Text style={styles.emptyText}>{`Mic level ${Math.round(voiceMeteringDb)} dB`}</Text>
            ) : null}

            <View style={[styles.terminalView, { minHeight: 120, maxHeight: 220 }]}>
              <AnsiText
                text={glassesOutput || "Waiting for terminal output..."}
                style={glassesTextStyle}
              />
            </View>
            {glassesDraft.trim() ? <Text style={styles.emptyText}>{`Draft: ${glassesDraft}`}</Text> : null}
          </>
        ) : (
          <Text style={styles.emptyText}>
            Enable HUD mode for a glasses-optimized terminal view with voice input.
          </Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Shell Wait Timeout</Text>
        <Text style={styles.serverSubtitle}>Controls `/shell/run wait_ms` for regular shell sends.</Text>
        <TextInput
          style={styles.input}
          value={shellRunWaitMs}
          onChangeText={onSetShellRunWaitMs}
          placeholder={`Wait ms (default ${DEFAULT_SHELL_WAIT_MS})`}
          placeholderTextColor="#7f7aa8"
          keyboardType="number-pad"
        />
        <Text style={styles.emptyText}>Range: 400-120000ms. Higher values wait longer for command output before returning.</Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Terminal Layout</Text>
        <View style={styles.actionsWrap}>
          <Pressable accessibilityRole="button" accessibilityLabel="Set terminal layout to stack" style={[styles.chip, layoutMode === "stack" ? styles.chipActive : null]} onPress={() => setLayoutMode("stack")}>
            <Text style={[styles.chipText, layoutMode === "stack" ? styles.chipTextActive : null]}>Stack</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Set terminal layout to tabs" style={[styles.chip, layoutMode === "tabs" ? styles.chipActive : null]} onPress={() => setLayoutMode("tabs")}>
            <Text style={[styles.chipText, layoutMode === "tabs" ? styles.chipTextActive : null]}>Tabs</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Set terminal layout to grid" style={[styles.chip, layoutMode === "grid" ? styles.chipActive : null]} onPress={() => setLayoutMode("grid")}>
            <Text style={[styles.chipText, layoutMode === "grid" ? styles.chipTextActive : null]}>Grid</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Set terminal layout to split" style={[styles.chip, layoutMode === "split" ? styles.chipActive : null]} onPress={() => setLayoutMode("split")}>
            <Text style={[styles.chipText, layoutMode === "split" ? styles.chipTextActive : null]}>Split</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Resource Dashboard</Text>
        {capabilities.sysStats ? (
          <>
            <Text style={styles.serverSubtitle}>{`Host ${sysStats?.host || "n/a"} (${sysStats?.platform || "unknown"})`}</Text>
            <Text style={styles.serverSubtitle}>{`CPU ${formatNumber(sysStats?.cpu_percent, 1)}%`}</Text>
            <Text style={styles.serverSubtitle}>{`Memory ${formatNumber(sysStats?.mem_percent, 1)}%`}</Text>
            <Text style={styles.serverSubtitle}>{`Disk ${formatNumber(sysStats?.disk_percent, 1)}%`}</Text>
            <Text style={styles.serverSubtitle}>{`Load ${formatNumber(sysStats?.load_1m, 2)} / ${formatNumber(sysStats?.load_5m, 2)} / ${formatNumber(sysStats?.load_15m, 2)}`}</Text>
            <Text style={styles.serverSubtitle}>{`Uptime ${formatNumber(sysStats?.uptime_seconds, 0)}s`}</Text>
          </>
        ) : (
          <Text style={styles.emptyText}>This server does not expose `/sys/stats`.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Process Manager</Text>
        {capabilities.processes ? (
          <>
            <View style={styles.rowInlineSpace}>
              <Text style={styles.serverSubtitle}>{`${visibleProcesses.length} / ${processes.length} processes`}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Refresh process list" style={[styles.actionButton, processesBusy ? styles.buttonDisabled : null]} onPress={onRefreshProcesses} disabled={processesBusy}>
                <Text style={styles.actionButtonText}>{processesBusy ? "Refreshing..." : "Refresh"}</Text>
              </Pressable>
            </View>
            {processesBusy && processes.length === 0 ? <Text style={styles.emptyText}>Loading processes...</Text> : null}

            <TextInput
              style={styles.input}
              value={processFilter}
              onChangeText={setProcessFilter}
              placeholder="Filter by pid/name/user/command"
              placeholderTextColor="#7f7aa8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {(["cpu", "mem", "uptime", "name"] as ProcessSortMode[]).map((sortMode) => {
                const index = processSorts.indexOf(sortMode);
                const active = index >= 0;
                return (
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={`Prioritize process sort by ${sortMode}`}
                    key={`sort-${sortMode}`}
                    style={[styles.chip, active ? styles.chipActive : null]}
                    onPress={() => setProcessSorts((prev) => [sortMode, ...prev.filter((entry) => entry !== sortMode)])}
                    onLongPress={() =>
                      setProcessSorts((prev) => {
                        const next = prev.filter((entry) => entry !== sortMode);
                        return next.length > 0 ? next : ["cpu"];
                      })
                    }
                  >
                    <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                      {active ? `#${index + 1} ${sortMode}` : `+ ${sortMode}`}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.emptyText}>Tap to prioritize sort. Long-press to remove from sort chain.</Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {(["TERM", "KILL", "INT"] as ProcessSignal[]).map((signal) => (
              <Pressable accessibilityRole="button"
                accessibilityLabel={`Set process kill signal ${signal}`}
                key={`signal-${signal}`}
                style={[styles.chip, processSignal === signal ? styles.chipActive : null]}
                onPress={() => setProcessSignal(signal)}
              >
                  <Text style={[styles.chipText, processSignal === signal ? styles.chipTextActive : null]}>{signal}</Text>
                </Pressable>
              ))}
            </ScrollView>

            <View style={styles.rowInlineSpace}>
              <Text style={styles.serverSubtitle}>{`${selectedProcessPids.length} selected`}</Text>
              <Pressable accessibilityRole="button"
                accessibilityLabel={`Kill ${selectedProcessPids.length} selected processes`}
                accessibilityHint="Opens confirmation before sending signal to selected process IDs."
                style={[styles.actionDangerButton, selectedProcessPids.length === 0 ? styles.buttonDisabled : null]}
                disabled={selectedProcessPids.length === 0}
                onPress={() => setPendingProcessKill({ pids: selectedProcessPids, signal: processSignal })}
              >
                <Text style={styles.actionDangerText}>{`Kill Selected (${processSignal})`}</Text>
              </Pressable>
            </View>

            {visibleProcesses.slice(0, 20).map((process) => {
              const selected = selectedProcessPids.includes(process.pid);
              return (
              <View key={`proc-${process.pid}`} style={styles.serverCard}>
                <Text style={styles.serverName}>{`${process.name} (PID ${process.pid})`}</Text>
                <Text style={styles.serverSubtitle}>{`CPU ${formatNumber(process.cpu_percent, 1)}% · MEM ${formatNumber(process.mem_percent, 1)}% · Uptime ${formatNumber(process.uptime_seconds, 0)}s`}</Text>
                {process.command ? <Text style={styles.emptyText}>{process.command}</Text> : null}
                <View style={styles.actionsWrap}>
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={selected ? `Deselect process ${process.pid}` : `Select process ${process.pid}`}
                    style={[styles.actionButton, selected ? styles.modeButtonOn : null]}
                    onPress={() =>
                      setSelectedProcessPids((prev) => (prev.includes(process.pid) ? prev.filter((pid) => pid !== process.pid) : [...prev, process.pid]))
                    }
                  >
                    <Text style={styles.actionButtonText}>{selected ? "Selected" : "Select"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Kill process ${process.pid}`}
                    accessibilityHint={`Opens confirmation to send ${processSignal} to process ${process.pid}.`}
                    style={styles.actionDangerButton}
                    onPress={() => setPendingProcessKill({ pids: [process.pid], signal: processSignal })}
                  >
                    <Text style={styles.actionDangerText}>{`Kill ${processSignal}`}</Text>
                  </Pressable>
                </View>
              </View>
              );
            })}
            {visibleProcesses.length === 0 ? (
              <Text style={styles.emptyText}>
                {processes.length === 0
                  ? "No processes reported by the server yet."
                  : "No processes match the current filter."}
              </Text>
            ) : null}
            {visibleProcesses.length > 20 ? <Text style={styles.emptyText}>Showing top 20 matching processes.</Text> : null}
          </>
        ) : (
          <Text style={styles.emptyText}>This server does not expose `/proc/list` and `/proc/kill`.</Text>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Terminal Theme</Text>
        <Text style={styles.serverSubtitle}>{`${terminalPreset.label} | ${terminalTheme.fontSize}px | ${Math.round(terminalTheme.backgroundOpacity * 100)}% bg`}</Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TERMINAL_THEME_PRESETS.map((preset) => (
            <Pressable accessibilityRole="button"
              accessibilityLabel={`Use ${preset.label} terminal theme`}
              key={preset.id}
              style={[styles.chip, terminalTheme.preset === preset.id ? styles.chipActive : null]}
              onPress={() => onSetTerminalPreset(preset.id)}
            >
              <Text style={[styles.chipText, terminalTheme.preset === preset.id ? styles.chipTextActive : null]}>{preset.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TERMINAL_FONT_OPTIONS.map((option) => (
            <Pressable accessibilityRole="button"
              accessibilityLabel={`Use ${option.label} terminal font`}
              key={option.id}
              style={[styles.chip, terminalTheme.fontFamily === option.id ? styles.chipActive : null]}
              onPress={() => onSetTerminalFontFamily(option.id)}
            >
              <Text style={[styles.chipText, terminalTheme.fontFamily === option.id ? styles.chipTextActive : null]}>{option.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.rowInlineSpace}>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Decrease terminal font size"
            style={[styles.actionButton, terminalTheme.fontSize <= TERMINAL_MIN_FONT_SIZE ? styles.buttonDisabled : null]}
            onPress={() => onSetTerminalFontSize(terminalTheme.fontSize - 1)}
            disabled={terminalTheme.fontSize <= TERMINAL_MIN_FONT_SIZE}
          >
            <Text style={styles.actionButtonText}>A-</Text>
          </Pressable>
          <Text style={styles.serverSubtitle}>{`Font ${terminalTheme.fontSize}px`}</Text>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Increase terminal font size"
            style={[styles.actionButton, terminalTheme.fontSize >= TERMINAL_MAX_FONT_SIZE ? styles.buttonDisabled : null]}
            onPress={() => onSetTerminalFontSize(terminalTheme.fontSize + 1)}
            disabled={terminalTheme.fontSize >= TERMINAL_MAX_FONT_SIZE}
          >
            <Text style={styles.actionButtonText}>A+</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TERMINAL_BG_OPACITY_OPTIONS.map((opacity) => (
            <Pressable accessibilityRole="button"
              accessibilityLabel={`Set terminal background opacity to ${Math.round(opacity * 100)} percent`}
              key={String(opacity)}
              style={[styles.chip, Math.abs(terminalTheme.backgroundOpacity - opacity) < 0.01 ? styles.chipActive : null]}
              onPress={() => onSetTerminalBackgroundOpacity(opacity)}
            >
              <Text
                style={[styles.chipText, Math.abs(terminalTheme.backgroundOpacity - opacity) < 0.01 ? styles.chipTextActive : null]}
              >{`${Math.round(opacity * 100)}% Background`}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Active Server</Text>
        <Text style={styles.serverTitle}>{activeServer?.name || "No server selected"}</Text>
        <Text style={styles.serverSubtitle}>{activeServer?.baseUrl || "Go to Servers tab to add one"}</Text>

        <View style={styles.rowInlineSpace}>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh terminal sessions" style={[styles.buttonPrimary, styles.flexButton]} onPress={onRefreshSessions} disabled={!connected || !capabilities.terminal}>
            <Text style={styles.buttonPrimaryText}>Refresh Sessions</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Open server management" style={[styles.buttonGhost, styles.flexButton]} onPress={onOpenServers}>
            <Text style={styles.buttonGhostText}>Manage Servers</Text>
          </Pressable>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open direct SSH fallback"
          accessibilityHint="Launches an installed SSH app using this server's ssh settings."
          style={[styles.buttonGhost, !activeServer?.sshHost ? styles.buttonDisabled : null]}
          onPress={onOpenSshFallback}
          disabled={!activeServer?.sshHost}
        >
          <Text style={styles.buttonGhostText}>
            {activeServer?.sshHost ? `Open SSH (${activeServer.sshUser ? `${activeServer.sshUser}@` : ""}${activeServer.sshHost})` : "Configure SSH in Servers tab"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Start New Session</Text>
        <View style={styles.modeRow}>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Set new session type to AI"
            style={[
              styles.modeButton,
              startKind === "ai" ? styles.modeButtonOn : null,
              !(capabilities.codex || hasExternalLlm) ? styles.buttonDisabled : null,
            ]}
            onPress={() => onSetStartKind("ai")}
            disabled={!(capabilities.codex || hasExternalLlm)}
          >
            <Text style={[styles.modeButtonText, startKind === "ai" ? styles.modeButtonTextOn : null]}>AI</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Set new session type to shell"
            style={[styles.modeButton, startKind === "shell" ? styles.modeButtonOn : null, !capabilities.terminal ? styles.buttonDisabled : null]}
            onPress={() => onSetStartKind("shell")}
            disabled={!capabilities.terminal}
          >
            <Text style={[styles.modeButtonText, startKind === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
          </Pressable>
        </View>

        {startKind === "ai" ? (
          <View style={styles.modeRow}>
            <Pressable accessibilityRole="button" accessibilityLabel="Set AI engine to auto" style={[styles.modeButton, startAiEngine === "auto" ? styles.modeButtonOn : null]} onPress={() => onSetStartAiEngine("auto")}>
              <Text style={[styles.modeButtonText, startAiEngine === "auto" ? styles.modeButtonTextOn : null]}>AI Auto</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              accessibilityLabel="Set AI engine to server AI"
              style={[styles.modeButton, startAiEngine === "server" ? styles.modeButtonOn : null, !capabilities.codex ? styles.buttonDisabled : null]}
              onPress={() => onSetStartAiEngine("server")}
              disabled={!capabilities.codex}
            >
              <Text style={[styles.modeButtonText, startAiEngine === "server" ? styles.modeButtonTextOn : null]}>Server AI</Text>
            </Pressable>
            <Pressable accessibilityRole="button"
              accessibilityLabel="Set AI engine to external LLM"
              style={[styles.modeButton, startAiEngine === "external" ? styles.modeButtonOn : null, !hasExternalLlm ? styles.buttonDisabled : null]}
              onPress={() => onSetStartAiEngine("external")}
              disabled={!hasExternalLlm}
            >
              <Text style={[styles.modeButtonText, startAiEngine === "external" ? styles.modeButtonTextOn : null]}>External AI</Text>
            </Pressable>
          </View>
        ) : null}

        <TextInput
          style={styles.input}
          value={startCwd}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={CWD_PLACEHOLDER}
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetStartCwd}
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={startPrompt}
          multiline
          placeholder={startKind === "ai" ? "Optional first message" : "Optional first command"}
          placeholderTextColor="#7f7aa8"
          onKeyPress={onStartPromptKeyPress}
          onChangeText={onSetStartPrompt}
        />

        {startKind === "ai" && capabilities.codex ? (
          <View style={styles.rowInlineSpace}>
            <Text style={styles.switchLabel}>Open session on Mac Terminal</Text>
            <Switch
              accessibilityLabel="Open new AI session on Mac Terminal"
              trackColor={{ false: "#33596c", true: "#0ea8c8" }}
              thumbColor={startOpenOnMac ? "#d4fdff" : "#d3dee5"}
              value={startOpenOnMac}
              onValueChange={onSetStartOpenOnMac}
            />
          </View>
        ) : null}

        {startKind === "ai" && (startAiEngine === "external" || (startAiEngine === "auto" && !capabilities.codex)) ? (
          <Text style={styles.emptyText}>This will create a local AI session powered by your active external LLM profile.</Text>
        ) : null}

        <Pressable accessibilityRole="button" accessibilityLabel={`Start ${startKind === "ai" ? "AI" : "shell"} session`} style={[styles.buttonPrimary, !connected ? styles.buttonDisabled : null]} onPress={onStartSession} disabled={!connected}>
          <Text style={styles.buttonPrimaryText}>Start {startKind === "ai" ? "AI" : "Shell"} Session</Text>
        </Pressable>
      </View>

      {fleetPanel}

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Available Sessions</Text>
        {showAllServerTerminals ? (
          <Text style={styles.serverSubtitle}>
            Session chips below still control visibility for the currently focused server.
          </Text>
        ) : null}

        <TextInput
          style={styles.input}
          value={tagFilter}
          onChangeText={onSetTagFilter}
          placeholder="Filter by tag"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {allTags.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {allTags.map((tag) => (
              <Pressable accessibilityRole="button" accessibilityLabel={`${tagFilter === tag ? "Clear" : "Apply"} tag filter ${tag}`} key={tag} style={[styles.chip, tagFilter === tag ? styles.chipActive : null]} onPress={() => onSetTagFilter(tagFilter === tag ? "" : tag)}>
                <Text style={[styles.chipText, tagFilter === tag ? styles.chipTextActive : null]}>{tag}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {allSessions.length === 0 ? (
          <Text style={styles.emptyText}>No sessions found yet.</Text>
        ) : (
          renderSessionChips(sortedAllSessions, openSessions, onToggleSessionVisible, sessionTags, tagFilter, pinnedSessions, sessionAliases)
        )}
      </View>
    </>
  );
  const topPanelChildren = React.Children.toArray(
    (topPanels as React.ReactElement<{ children?: React.ReactNode }>).props.children
  );
  const primaryPanels = topPanelChildren.slice(0, 1);
  const advancedPanels = topPanelChildren.slice(1);
  const connectionPanels = [advancedPanels[0], advancedPanels[1]].filter(Boolean);
  const collabAiPanels = [advancedPanels[2], advancedPanels[3]].filter(Boolean);
  const appearancePanels = [advancedPanels[4], advancedPanels[6], advancedPanels[9]].filter(Boolean);
  const opsPanels = [advancedPanels[5], advancedPanels[7], advancedPanels[8], advancedPanels[12]].filter(Boolean);
  const sessionSetupPanels = [advancedPanels[10], advancedPanels[11], advancedPanels[13]].filter(Boolean);

  const openTerminalsTitle = showAllServerTerminals ? "Open Terminals (All Servers)" : "Open Terminals";
  const quickStartPanel = (
    <View style={[styles.panel, styles.workspaceHero]}>
      <Text style={styles.workspaceHeroTitle}>Terminal Workspace</Text>
      <Text style={styles.workspaceHeroSubtitle}>
        {poolLifecyclePaused
          ? "Connection pool paused"
          : disconnectedServerCount > 0
            ? `${connectedServerCount}/${servers.length} online`
            : "All servers online"}
      </Text>
      <View style={styles.workspaceHeroActions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new shell terminal now"
          style={[styles.buttonPrimary, !connected || !capabilities.terminal ? styles.buttonDisabled : null]}
          onPress={() => handleQuickStartSession("shell")}
          disabled={!connected || !capabilities.terminal}
        >
          <Text style={styles.buttonPrimaryText}>New Shell</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Start a new AI terminal now"
          style={[styles.buttonGhost, !connected || !canQuickStartAi ? styles.buttonDisabled : null]}
          onPress={() => handleQuickStartSession("ai")}
          disabled={!connected || !canQuickStartAi}
        >
          <Text style={styles.buttonGhostText}>New AI</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open control center"
          style={styles.actionButton}
          onPress={() => setShowControlCenter(true)}
        >
          <Text style={styles.actionButtonText}>Actions</Text>
        </Pressable>
      </View>
      <View style={styles.serverPoolSummaryModes}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show terminals for focused server"
          style={[styles.chip, !showAllServerTerminals ? styles.chipActive : null]}
          onPress={() => setShowAllServerTerminals(false)}
        >
          <Text style={[styles.chipText, !showAllServerTerminals ? styles.chipTextActive : null]}>Focused</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Show terminals for all servers"
          style={[
            styles.chip,
            showAllServerTerminals ? styles.chipActive : null,
            connectedServerCount < 2 ? styles.buttonDisabled : null,
          ]}
          onPress={() => setShowAllServerTerminals(true)}
          disabled={connectedServerCount < 2}
        >
          <Text style={[styles.chipText, showAllServerTerminals ? styles.chipTextActive : null]}>All</Text>
        </Pressable>
      </View>
    </View>
  );

  const controlCenterModal = (
    <Modal
      visible={showControlCenter}
      transparent
      animationType="fade"
      onRequestClose={() => setShowControlCenter(false)}
    >
      <Pressable style={styles.overlayBackdrop} onPress={() => setShowControlCenter(false)}>
        <Pressable
          style={[styles.overlayCard, styles.controlCenterCard]}
          onPress={(event) => {
            event.stopPropagation();
          }}
        >
          <View style={[styles.rowInlineSpace, styles.rowInlineSpaceWrap]}>
            <Text style={styles.panelLabel}>Control Center</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close control center"
              style={styles.buttonGhost}
              onPress={() => setShowControlCenter(false)}
            >
              <Text style={styles.buttonGhostText}>Close</Text>
            </Pressable>
          </View>
          <Text style={styles.serverSubtitle}>
            All advanced settings stay here so daily terminal work stays clean.
          </Text>
          <ScrollView
            style={styles.controlCenterScroll}
            contentContainerStyle={styles.controlCenterScrollContent}
            showsVerticalScrollIndicator
          >
            {connectionPanels}

            <View style={styles.panel}>
              <View style={[styles.rowInlineSpace, styles.rowInlineSpaceWrap]}>
                <Text style={styles.panelLabel}>Session Setup</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showAdvancedSessionSetup ? "Hide session setup controls" : "Show session setup controls"}
                  style={styles.actionButton}
                  onPress={() => setShowAdvancedSessionSetup((prev) => !prev)}
                >
                  <Text style={styles.actionButtonText}>{showAdvancedSessionSetup ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>
              <Text style={styles.serverSubtitle}>
                Active server actions, session creation, and available session management.
              </Text>
            </View>
            {showAdvancedSessionSetup ? sessionSetupPanels : null}

            <View style={styles.panel}>
              <View style={[styles.rowInlineSpace, styles.rowInlineSpaceWrap]}>
                <Text style={styles.panelLabel}>Ops & Fleet</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showAdvancedOps ? "Hide operations and fleet controls" : "Show operations and fleet controls"}
                  style={styles.actionButton}
                  onPress={() => setShowAdvancedOps((prev) => !prev)}
                >
                  <Text style={styles.actionButtonText}>{showAdvancedOps ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>
              <Text style={styles.serverSubtitle}>
                Shell wait, resource dashboard, process manager, and fleet execution.
              </Text>
            </View>
            {showAdvancedOps ? opsPanels : null}

            <View style={styles.panel}>
              <View style={[styles.rowInlineSpace, styles.rowInlineSpaceWrap]}>
                <Text style={styles.panelLabel}>Appearance & Devices</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showAdvancedAppearance ? "Hide appearance and device controls" : "Show appearance and device controls"}
                  style={styles.actionButton}
                  onPress={() => setShowAdvancedAppearance((prev) => !prev)}
                >
                  <Text style={styles.actionButtonText}>{showAdvancedAppearance ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>
              <Text style={styles.serverSubtitle}>
                Layout mode, terminal theme, and glasses or VR controls.
              </Text>
            </View>
            {showAdvancedAppearance ? appearancePanels : null}

            <View style={styles.panel}>
              <View style={[styles.rowInlineSpace, styles.rowInlineSpaceWrap]}>
                <Text style={styles.panelLabel}>Collaboration & AI</Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={showAdvancedCollaboration ? "Hide collaboration and AI controls" : "Show collaboration and AI controls"}
                  style={styles.actionButton}
                  onPress={() => setShowAdvancedCollaboration((prev) => !prev)}
                >
                  <Text style={styles.actionButtonText}>{showAdvancedCollaboration ? "Hide" : "Show"}</Text>
                </Pressable>
              </View>
              <Text style={styles.serverSubtitle}>
                Agent tools and shared workspace voice channels.
              </Text>
            </View>
            {showAdvancedCollaboration ? collabAiPanels : null}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );

  const processKillModal = (
    <ProcessKillConfirmModal
      visible={Boolean(pendingProcessKill)}
      pids={pendingProcessKill?.pids || []}
      signal={pendingProcessKill?.signal || "TERM"}
      onCancel={() => setPendingProcessKill(null)}
      onConfirm={() => {
        if (!pendingProcessKill) {
          return;
        }
        const targetPids = pendingProcessKill.pids;
        if (targetPids.length === 1) {
          onKillProcess(targetPids[0], pendingProcessKill.signal);
        } else {
          onKillProcesses(targetPids, pendingProcessKill.signal);
        }
        setSelectedProcessPids((prev) => prev.filter((pid) => !targetPids.includes(pid)));
        setPendingProcessKill(null);
      }}
    />
  );

  if (wantsSplit && !splitEnabled) {
    return (
      <>
        <PageHeroCard
          eyebrow="Terminal Deck"
          title="Launch sessions, monitor streams, and control the pool."
          summary="Start shell or AI sessions fast, watch live output, and keep deeper controls in the control center."
          tone="pink"
          stats={heroStats}
        />
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>iPad Split View</Text>
          <Text style={styles.serverSubtitle}>Split layout is a Pro feature.</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Open Pro upgrade paywall" style={styles.buttonPrimary} onPress={onShowPaywall}>
            <Text style={styles.buttonPrimaryText}>Upgrade to Pro</Text>
          </Pressable>
        </View>
        {primaryPanels}
        {quickStartPanel}
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>{openTerminalsTitle}</Text>
          {renderOpenTerminals()}
        </View>
        {controlCenterModal}
        {processKillModal}
      </>
    );
  }

  if (wantsSplit && splitEnabled) {
    return (
      <>
        <PageHeroCard
          eyebrow="Terminal Deck"
          title="Launch sessions, monitor streams, and control the pool."
          summary="Start shell or AI sessions fast, watch live output, and keep deeper controls in the control center."
          tone="pink"
          stats={heroStats}
        />
        <View style={styles.splitRow}>
          <View style={styles.splitLeft}>
            {primaryPanels}
            {quickStartPanel}
          </View>
          <View style={styles.splitRight}>
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>{openTerminalsTitle}</Text>
              {renderOpenTerminals()}
            </View>
          </View>
        </View>
        {controlCenterModal}
        {processKillModal}
      </>
    );
  }

  return (
    <>
      <PageHeroCard
        eyebrow="Terminal Deck"
        title="Launch sessions, monitor streams, and control the pool."
        summary="Start shell or AI sessions fast, watch live output, and keep deeper controls in the control center."
        tone="pink"
        stats={heroStats}
      />
      {primaryPanels}
      {quickStartPanel}
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>{openTerminalsTitle}</Text>
        {renderOpenTerminals()}
      </View>
      {controlCenterModal}
      {processKillModal}
    </>
  );
}
