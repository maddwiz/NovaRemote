import React, { useMemo } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";

import { useAppContext } from "../context/AppContext";
import { CWD_PLACEHOLDER, isLikelyAiSession } from "../constants";
import { TerminalCard } from "../components/TerminalCard";
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

function renderSessionChips(
  allSessions: string[],
  openSessions: string[],
  onToggleSessionVisible: (session: string) => void,
  sessionTags: Record<string, string[]>,
  tagFilter: string,
  pinnedSessions: string[]
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
        return (
          <Pressable key={session} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => onToggleSessionVisible(session)}>
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
              {active ? `Open - ${session}` : session}
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
    health,
    capabilities,
    supportedFeatures,
    hasExternalLlm,
    localAiSessions,
    historyCount,
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
    fleetResults,
    suggestionsBySession,
    suggestionBusyBySession,
    watchRules,
    terminalTheme,
    onShowPaywall,
    onSetTagFilter,
    onSetStartCwd,
    onSetStartPrompt,
    onSetStartOpenOnMac,
    onSetStartKind,
    onSetStartAiEngine,
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
    onSetDraft,
    onSend,
    onClearDraft,
    onTogglePinSession,
    onSetFleetCommand,
    onSetFleetCwd,
    onToggleFleetTarget,
    onSetFleetWaitMs,
    onRequestSuggestions,
    onUseSuggestion,
    onToggleWatch,
    onSetWatchPattern,
    onSetTerminalPreset,
    onSetTerminalFontFamily,
    onSetTerminalFontSize,
    onSetTerminalBackgroundOpacity,
    onRunFleet,
  } = useAppContext().terminals;

  const { width } = useWindowDimensions();
  const wantsSplit = width >= 900;
  const splitEnabled = !wantsSplit || isPro;
  const terminalAppearance = useMemo(() => buildTerminalAppearance(terminalTheme), [terminalTheme]);
  const terminalPreset = useMemo(() => getTerminalPreset(terminalTheme.preset), [terminalTheme.preset]);
  const sortedAllSessions = useMemo(() => sortSessionsPinnedFirst(allSessions, pinnedSessions), [allSessions, pinnedSessions]);
  const sortedOpenSessions = useMemo(() => sortSessionsPinnedFirst(openSessions, pinnedSessions), [openSessions, pinnedSessions]);

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

      return (
        <TerminalCard
          key={session}
          session={session}
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
          watchEnabled={watch.enabled}
          watchPattern={watch.pattern}
          tags={tags}
          pinned={pinnedSessions.includes(session)}
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
          onDraftChange={(value) => onSetDraft(session, value)}
          onRequestSuggestions={() => onRequestSuggestions(session)}
          onUseSuggestion={(value) => onUseSuggestion(session, value)}
          onToggleWatch={(enabled) => onToggleWatch(session, enabled)}
          onWatchPatternChange={(pattern) => onSetWatchPattern(session, pattern)}
          onTogglePin={() => onTogglePinSession(session)}
          onSend={() => onSend(session)}
          onClear={() => onClearDraft(session)}
        />
      );
    });
  }, [
    capabilities.codex,
    capabilities.terminal,
    capabilities.macAttach,
    connected,
    connectionMeta,
    drafts,
    hasExternalLlm,
    historyCount,
    pinnedSessions,
    terminalAppearance,
    onClearDraft,
    onFocusSession,
    onHideSession,
    onHistoryNext,
    onHistoryPrev,
    onOpenOnMac,
    onRequestSuggestions,
    onSend,
    onSetDraft,
    onSetSessionMode,
    onSetSessionAiEngine,
    onSetTags,
    onSetWatchPattern,
    onStopSession,
    onSyncSession,
    onTogglePinSession,
    onToggleWatch,
    onUseSuggestion,
    localAiSessions,
    sessionAiEngine,
    sendBusy,
    sendModes,
    suggestionBusyBySession,
    suggestionsBySession,
    sessionTags,
    streamLive,
    sortedOpenSessions,
    tails,
    watchRules,
  ]);

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
        <Text style={styles.serverSubtitle}>{`Streams ${health.activeStreams}/${health.openSessions}`}</Text>
        <Text style={styles.serverSubtitle}>{`Latency ${health.latencyMs !== null ? `${health.latencyMs} ms` : "n/a"}`}</Text>
        <Text style={styles.serverSubtitle}>{`Last ping ${health.lastPingAt ? new Date(health.lastPingAt).toLocaleTimeString() : "never"}`}</Text>
        <Text style={styles.emptyText}>{`Server features: ${supportedFeatures || "none"}`}</Text>
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
          renderSessionChips(sortedAllSessions, openSessions, onToggleSessionVisible, sessionTags, tagFilter, pinnedSessions)
        )}
      </View>
    </>
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
          {openTerminalCards.length === 0 ? <Text style={styles.emptyText}>Tap a session above to open it.</Text> : openTerminalCards}
        </View>
      </>
    );
  }

  if (wantsSplit && splitEnabled) {
    return (
      <View style={styles.splitRow}>
        <View style={styles.splitLeft}>{topPanels}</View>
        <View style={styles.splitRight}>
          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Open Terminals</Text>
            {openTerminalCards.length === 0 ? <Text style={styles.emptyText}>Tap a session above to open it.</Text> : openTerminalCards}
          </View>
        </View>
      </View>
    );
  }

  return (
    <>
      {topPanels}
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Open Terminals</Text>
        {openTerminalCards.length === 0 ? <Text style={styles.emptyText}>Tap a session above to open it.</Text> : openTerminalCards}
      </View>
    </>
  );
}
