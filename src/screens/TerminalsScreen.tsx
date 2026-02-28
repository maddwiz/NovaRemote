import React, { useEffect, useMemo, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { NativeSyntheticEvent, Pressable, ScrollView, Switch, Text, TextInput, TextInputKeyPressEventData, View, useWindowDimensions } from "react-native";

import { useAppContext } from "../context/AppContext";
import { CWD_PLACEHOLDER, DEFAULT_SHELL_WAIT_MS, STORAGE_PROCESS_PANEL_PREFS_PREFIX, isLikelyAiSession } from "../constants";
import { TerminalCard } from "../components/TerminalCard";
import { ProcessKillConfirmModal } from "../components/ProcessKillConfirmModal";
import { styles } from "../theme/styles";
import {
  TERMINAL_BG_OPACITY_OPTIONS,
  TERMINAL_FONT_OPTIONS,
  TERMINAL_MAX_FONT_SIZE,
  TERMINAL_MIN_FONT_SIZE,
  TERMINAL_THEME_PRESETS,
  buildTerminalAppearance,
  getTerminalPreset,
} from "../theme/terminalTheme";
import { ProcessSignal } from "../types";

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
          <Pressable key={session} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => onToggleSessionVisible(session)}>
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
    servers,
    allSessions,
    openSessions,
    tails,
    drafts,
    sendBusy,
    streamLive,
    connectionMeta,
    sendModes,
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
    localAiSessions,
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
    onShowPaywall,
    onSetTagFilter,
    onSetStartCwd,
    onSetStartPrompt,
    onSetStartOpenOnMac,
    onSetStartKind,
    onSetStartAiEngine,
    onRefreshCapabilities,
    onRefreshSessions,
    onOpenServers,
    onStartSession,
    onToggleSessionVisible,
    onSetSessionMode,
    onSetSessionAiEngine,
    onOpenOnMac,
    onSyncSession,
    onExportSession,
    onFocusSession,
    onStopSession,
    onHideSession,
    onHistoryPrev,
    onHistoryNext,
    onSetTags,
    onSetSessionAlias,
    onAutoNameSession,
    onSetDraft,
    onAdaptDraftForBackend,
    onSend,
    onClearDraft,
    onTogglePinSession,
    onSetFleetCommand,
    onSetFleetCwd,
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
    onRunFleet,
  } = useAppContext().terminals;

  const { width } = useWindowDimensions();
  const wantsSplit = width >= 900;
  const splitEnabled = !wantsSplit || isPro;
  const activeBackend = activeServer?.terminalBackend;
  const [layoutMode, setLayoutMode] = useState<"stack" | "tabs" | "grid" | "split">("stack");
  const [activeTabSession, setActiveTabSession] = useState<string | null>(null);
  const [processFilter, setProcessFilter] = useState<string>("");
  const [processSorts, setProcessSorts] = useState<ProcessSortMode[]>(["cpu"]);
  const [processSignal, setProcessSignal] = useState<ProcessSignal>("TERM");
  const [selectedProcessPids, setSelectedProcessPids] = useState<number[]>([]);
  const [pendingProcessKill, setPendingProcessKill] = useState<{ pids: number[]; signal: ProcessSignal } | null>(null);
  const terminalAppearance = useMemo(() => buildTerminalAppearance(terminalTheme), [terminalTheme]);
  const terminalPreset = useMemo(() => getTerminalPreset(terminalTheme.preset), [terminalTheme.preset]);
  const sortedAllSessions = useMemo(() => sortSessionsPinnedFirst(allSessions, pinnedSessions), [allSessions, pinnedSessions]);
  const sortedOpenSessions = useMemo(() => sortSessionsPinnedFirst(openSessions, pinnedSessions), [openSessions, pinnedSessions]);
  const onStartPromptKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const native = event.nativeEvent as TextInputKeyPressEventData & { ctrlKey?: boolean; metaKey?: boolean };
    const key = (native.key || "").toLowerCase();
    if ((native.metaKey || native.ctrlKey) && key === "enter" && connected) {
      onStartSession();
    }
  };

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
    if (sortedOpenSessions.length === 0) {
      if (activeTabSession !== null) {
        setActiveTabSession(null);
      }
      return;
    }
    if (!activeTabSession || !sortedOpenSessions.includes(activeTabSession)) {
      setActiveTabSession(sortedOpenSessions[0]);
    }
  }, [activeTabSession, sortedOpenSessions]);

  const openTerminalCards = useMemo(() => {
    return sortedOpenSessions.map((session) => {
      const output = tails[session] ?? "";
      const draft = drafts[session] ?? "";
      const isSending = Boolean(sendBusy[session]);
      const isLive = Boolean(streamLive[session]);
      const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
      const tags = sessionTags[session] || [];
      const meta = connectionMeta[session];
      const isLocalOnly = localAiSessions.includes(session);
      const aiEngine = sessionAiEngine[session] || (isLocalOnly ? "external" : "auto");
      const watch = watchRules[session] || { enabled: false, pattern: "", lastMatch: null };
      const recording = recordings[session];
      const collaborators = sessionPresence[session] || [];
      const readOnly = Boolean(sessionReadOnly[session]);
      const recordingDuration = recording?.chunks.length ? recording.chunks[recording.chunks.length - 1]?.atMs || 0 : 0;

      return (
        <TerminalCard
          key={session}
          session={session}
          sessionAlias={sessionAliases[session] || ""}
          output={output}
          draft={draft}
          isSending={isSending}
          isLive={isLive}
          isServerConnected={!isLocalOnly && connected}
          connectionState={isLocalOnly ? "disconnected" : meta?.state ?? "disconnected"}
          isLocalOnly={isLocalOnly}
          mode={mode}
          aiAvailable={capabilities.codex || hasExternalLlm}
          shellAvailable={!isLocalOnly && capabilities.terminal}
          canOpenOnMac={!isLocalOnly && capabilities.macAttach}
          canSync={!isLocalOnly}
          canStop={!isLocalOnly}
          aiEngine={aiEngine}
          canUseServerAi={!isLocalOnly && capabilities.codex}
          canUseExternalAi={hasExternalLlm}
          suggestions={suggestionsBySession[session] || []}
          suggestionsBusy={Boolean(suggestionBusyBySession[session])}
          errorHint={errorHintsBySession[session] || null}
          triageBusy={Boolean(triageBusyBySession[session])}
          triageExplanation={triageExplanationBySession[session] || ""}
          triageFixes={triageFixesBySession[session] || []}
          watchEnabled={watch.enabled}
          watchPattern={watch.pattern}
          watchAlerts={watchAlertHistoryBySession[session] || []}
          collaborationAvailable={!isLocalOnly && capabilities.collaboration}
          collaborators={collaborators}
          readOnly={readOnly}
          tags={tags}
          pinned={pinnedSessions.includes(session)}
          queuedItems={commandQueue[session] || []}
          recordingActive={Boolean(recording?.active)}
          recordingChunks={recording?.chunks.length || 0}
          recordingDurationMs={recordingDuration}
          historySuggestions={commandHistory[session] || []}
          terminalBackend={activeBackend}
          terminalViewStyle={terminalAppearance.terminalViewStyle}
          terminalTextStyle={terminalAppearance.terminalTextStyle}
          historyCount={historyCount[session] || 0}
          onSetMode={(nextMode) => onSetSessionMode(session, nextMode)}
          onSetAiEngine={(nextEngine) => onSetSessionAiEngine(session, nextEngine)}
          onOpenOnMac={() => onOpenOnMac(session)}
          onSync={() => onSyncSession(session)}
          onExport={() => onExportSession(session)}
          onFullscreen={() => onFocusSession(session)}
          onStop={() => onStopSession(session)}
          onHide={() => onHideSession(session)}
          onHistoryPrev={() => onHistoryPrev(session)}
          onHistoryNext={() => onHistoryNext(session)}
          onTagsChange={(raw) => onSetTags(session, raw)}
          onSessionAliasChange={(value) => onSetSessionAlias(session, value)}
          onAutoName={() => onAutoNameSession(session)}
          onDraftChange={(value) => onSetDraft(session, value)}
          onAdaptDraftForBackend={() => onAdaptDraftForBackend(session)}
          onRequestSuggestions={() => onRequestSuggestions(session)}
          onUseSuggestion={(value) => onUseSuggestion(session, value)}
          onExplainError={() => onExplainError(session)}
          onSuggestErrorFixes={() => onSuggestErrorFixes(session)}
          onToggleWatch={(enabled) => onToggleWatch(session, enabled)}
          onWatchPatternChange={(pattern) => onSetWatchPattern(session, pattern)}
          onClearWatchAlerts={() => onClearWatchAlerts(session)}
          onRefreshPresence={() => onRefreshSessionPresence(session)}
          onSetReadOnly={(value) => onSetSessionReadOnly(session, value)}
          onTogglePin={() => onTogglePinSession(session)}
          onFlushQueue={() => onFlushQueue(session)}
          onRemoveQueuedCommand={(index) => onRemoveQueuedCommand(session, index)}
          onToggleRecording={() => onToggleRecording(session)}
          onOpenPlayback={() => onOpenPlayback(session)}
          onDeleteRecording={() => onDeleteRecording(session)}
          onSend={() => onSend(session)}
          onClear={() => onClearDraft(session)}
        />
      );
    });
  }, [
    capabilities.codex,
    capabilities.terminal,
    capabilities.macAttach,
    capabilities.collaboration,
    connected,
    connectionMeta,
    drafts,
    hasExternalLlm,
    commandHistory,
    historyCount,
    sessionAliases,
    sessionPresence,
    sessionReadOnly,
    errorHintsBySession,
    triageBusyBySession,
    triageExplanationBySession,
    triageFixesBySession,
    watchAlertHistoryBySession,
    pinnedSessions,
    commandQueue,
    recordings,
    terminalAppearance,
    onClearDraft,
    onFocusSession,
    onHideSession,
    onHistoryNext,
    onHistoryPrev,
    onOpenOnMac,
    onExplainError,
    onSuggestErrorFixes,
    onRequestSuggestions,
    onSend,
    onSetDraft,
    onSetSessionMode,
    onSetSessionAiEngine,
    onSetTags,
    onSetSessionAlias,
    onAutoNameSession,
    onAdaptDraftForBackend,
    onSetWatchPattern,
    onClearWatchAlerts,
    onRefreshSessionPresence,
    onSetSessionReadOnly,
    onStopSession,
    onSyncSession,
    onTogglePinSession,
    onToggleWatch,
    onFlushQueue,
    onRemoveQueuedCommand,
    onToggleRecording,
    onOpenPlayback,
    onDeleteRecording,
    onUseSuggestion,
    localAiSessions,
    sessionAiEngine,
    sendBusy,
    sendModes,
    suggestionBusyBySession,
    suggestionsBySession,
    sessionAliases,
    sessionTags,
    streamLive,
    sortedOpenSessions,
    tails,
    watchRules,
    activeBackend,
  ]);

  const tabActiveIndex = activeTabSession ? sortedOpenSessions.indexOf(activeTabSession) : -1;
  const tabCard = tabActiveIndex >= 0 ? openTerminalCards[tabActiveIndex] : null;
  const renderOpenTerminals = () => {
    if (openTerminalCards.length === 0) {
      return <Text style={styles.emptyText}>Tap a session above to open it.</Text>;
    }

    if (layoutMode === "tabs") {
      return (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {sortedOpenSessions.map((session) => (
              <Pressable
                key={`tab-${session}`}
                style={[styles.chip, activeTabSession === session ? styles.chipActive : null]}
                onPress={() => setActiveTabSession(session)}
              >
                <Text style={[styles.chipText, activeTabSession === session ? styles.chipTextActive : null]}>
                  {sessionAliases[session]?.trim() || session}
                </Text>
              </Pressable>
            ))}
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
              key={`grid-${sortedOpenSessions[index]}`}
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
              key={`split-${sortedOpenSessions[index]}`}
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
            <Pressable key={server.id} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => onToggleFleetTarget(server.id)}>
              <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{server.name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
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
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Connection Health</Text>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.serverSubtitle}>{`Streams ${health.activeStreams}/${health.openSessions}`}</Text>
          <Pressable
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
          <Pressable style={[styles.chip, layoutMode === "stack" ? styles.chipActive : null]} onPress={() => setLayoutMode("stack")}>
            <Text style={[styles.chipText, layoutMode === "stack" ? styles.chipTextActive : null]}>Stack</Text>
          </Pressable>
          <Pressable style={[styles.chip, layoutMode === "tabs" ? styles.chipActive : null]} onPress={() => setLayoutMode("tabs")}>
            <Text style={[styles.chipText, layoutMode === "tabs" ? styles.chipTextActive : null]}>Tabs</Text>
          </Pressable>
          <Pressable style={[styles.chip, layoutMode === "grid" ? styles.chipActive : null]} onPress={() => setLayoutMode("grid")}>
            <Text style={[styles.chipText, layoutMode === "grid" ? styles.chipTextActive : null]}>Grid</Text>
          </Pressable>
          <Pressable style={[styles.chip, layoutMode === "split" ? styles.chipActive : null]} onPress={() => setLayoutMode("split")}>
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
              <Pressable style={[styles.actionButton, processesBusy ? styles.buttonDisabled : null]} onPress={onRefreshProcesses} disabled={processesBusy}>
                <Text style={styles.actionButtonText}>{processesBusy ? "Refreshing..." : "Refresh"}</Text>
              </Pressable>
            </View>

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
                  <Pressable
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
                <Pressable
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
              <Pressable
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
                  <Pressable
                    style={[styles.actionButton, selected ? styles.modeButtonOn : null]}
                    onPress={() =>
                      setSelectedProcessPids((prev) => (prev.includes(process.pid) ? prev.filter((pid) => pid !== process.pid) : [...prev, process.pid]))
                    }
                  >
                    <Text style={styles.actionButtonText}>{selected ? "Selected" : "Select"}</Text>
                  </Pressable>
                  <Pressable style={styles.actionDangerButton} onPress={() => setPendingProcessKill({ pids: [process.pid], signal: processSignal })}>
                    <Text style={styles.actionDangerText}>{`Kill ${processSignal}`}</Text>
                  </Pressable>
                </View>
              </View>
              );
            })}
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
            <Pressable
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
            <Pressable
              key={option.id}
              style={[styles.chip, terminalTheme.fontFamily === option.id ? styles.chipActive : null]}
              onPress={() => onSetTerminalFontFamily(option.id)}
            >
              <Text style={[styles.chipText, terminalTheme.fontFamily === option.id ? styles.chipTextActive : null]}>{option.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.rowInlineSpace}>
          <Pressable
            style={[styles.actionButton, terminalTheme.fontSize <= TERMINAL_MIN_FONT_SIZE ? styles.buttonDisabled : null]}
            onPress={() => onSetTerminalFontSize(terminalTheme.fontSize - 1)}
            disabled={terminalTheme.fontSize <= TERMINAL_MIN_FONT_SIZE}
          >
            <Text style={styles.actionButtonText}>A-</Text>
          </Pressable>
          <Text style={styles.serverSubtitle}>{`Font ${terminalTheme.fontSize}px`}</Text>
          <Pressable
            style={[styles.actionButton, terminalTheme.fontSize >= TERMINAL_MAX_FONT_SIZE ? styles.buttonDisabled : null]}
            onPress={() => onSetTerminalFontSize(terminalTheme.fontSize + 1)}
            disabled={terminalTheme.fontSize >= TERMINAL_MAX_FONT_SIZE}
          >
            <Text style={styles.actionButtonText}>A+</Text>
          </Pressable>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {TERMINAL_BG_OPACITY_OPTIONS.map((opacity) => (
            <Pressable
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
          <Pressable style={[styles.buttonPrimary, styles.flexButton]} onPress={onRefreshSessions} disabled={!connected || !capabilities.terminal}>
            <Text style={styles.buttonPrimaryText}>Refresh Sessions</Text>
          </Pressable>
          <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onOpenServers}>
            <Text style={styles.buttonGhostText}>Manage Servers</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Start New Session</Text>
        <View style={styles.modeRow}>
          <Pressable
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
          <Pressable
            style={[styles.modeButton, startKind === "shell" ? styles.modeButtonOn : null, !capabilities.terminal ? styles.buttonDisabled : null]}
            onPress={() => onSetStartKind("shell")}
            disabled={!capabilities.terminal}
          >
            <Text style={[styles.modeButtonText, startKind === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
          </Pressable>
        </View>

        {startKind === "ai" ? (
          <View style={styles.modeRow}>
            <Pressable style={[styles.modeButton, startAiEngine === "auto" ? styles.modeButtonOn : null]} onPress={() => onSetStartAiEngine("auto")}>
              <Text style={[styles.modeButtonText, startAiEngine === "auto" ? styles.modeButtonTextOn : null]}>AI Auto</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, startAiEngine === "server" ? styles.modeButtonOn : null, !capabilities.codex ? styles.buttonDisabled : null]}
              onPress={() => onSetStartAiEngine("server")}
              disabled={!capabilities.codex}
            >
              <Text style={[styles.modeButtonText, startAiEngine === "server" ? styles.modeButtonTextOn : null]}>Server AI</Text>
            </Pressable>
            <Pressable
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

        <Pressable style={[styles.buttonPrimary, !connected ? styles.buttonDisabled : null]} onPress={onStartSession} disabled={!connected}>
          <Text style={styles.buttonPrimaryText}>Start {startKind === "ai" ? "AI" : "Shell"} Session</Text>
        </Pressable>
      </View>

      {fleetPanel}

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Available Sessions</Text>

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
              <Pressable key={tag} style={[styles.chip, tagFilter === tag ? styles.chipActive : null]} onPress={() => onSetTagFilter(tagFilter === tag ? "" : tag)}>
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
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>iPad Split View</Text>
          <Text style={styles.serverSubtitle}>Split layout is a Pro feature.</Text>
          <Pressable style={styles.buttonPrimary} onPress={onShowPaywall}>
            <Text style={styles.buttonPrimaryText}>Upgrade to Pro</Text>
          </Pressable>
        </View>
        {topPanels}
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>Open Terminals</Text>
          {renderOpenTerminals()}
        </View>
        {processKillModal}
      </>
    );
  }

  if (wantsSplit && splitEnabled) {
    return (
      <>
        <View style={styles.splitRow}>
          <View style={styles.splitLeft}>{topPanels}</View>
          <View style={styles.splitRight}>
            <View style={styles.panel}>
              <Text style={styles.panelLabel}>Open Terminals</Text>
              {renderOpenTerminals()}
            </View>
          </View>
        </View>
        {processKillModal}
      </>
    );
  }

  return (
    <>
      {topPanels}
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Open Terminals</Text>
        {renderOpenTerminals()}
      </View>
      {processKillModal}
    </>
  );
}
