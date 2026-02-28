import React, { useMemo } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View, useWindowDimensions } from "react-native";

import { CWD_PLACEHOLDER, isLikelyAiSession } from "../constants";
import { styles } from "../theme/styles";
import { HealthMetrics, ServerProfile, SessionConnectionMeta, TerminalSendMode } from "../types";
import { TerminalCard } from "../components/TerminalCard";

type TerminalsScreenProps = {
  activeServer: ServerProfile | null;
  connected: boolean;
  allSessions: string[];
  openSessions: string[];
  tails: Record<string, string>;
  drafts: Record<string, string>;
  sendBusy: Record<string, boolean>;
  streamLive: Record<string, boolean>;
  connectionMeta: Record<string, SessionConnectionMeta>;
  sendModes: Record<string, TerminalSendMode>;
  startCwd: string;
  startPrompt: string;
  startOpenOnMac: boolean;
  startKind: TerminalSendMode;
  health: HealthMetrics;
  historyCount: Record<string, number>;
  sessionTags: Record<string, string[]>;
  allTags: string[];
  tagFilter: string;
  isPro: boolean;
  onShowPaywall: () => void;
  onSetTagFilter: (value: string) => void;
  onSetStartCwd: (value: string) => void;
  onSetStartPrompt: (value: string) => void;
  onSetStartOpenOnMac: (value: boolean) => void;
  onSetStartKind: (value: TerminalSendMode) => void;
  onRefreshSessions: () => void;
  onOpenServers: () => void;
  onStartSession: () => void;
  onToggleSessionVisible: (session: string) => void;
  onSetSessionMode: (session: string, mode: TerminalSendMode) => void;
  onOpenOnMac: (session: string) => void;
  onSyncSession: (session: string) => void;
  onFocusSession: (session: string) => void;
  onStopSession: (session: string) => void;
  onHideSession: (session: string) => void;
  onHistoryPrev: (session: string) => void;
  onHistoryNext: (session: string) => void;
  onSetTags: (session: string, raw: string) => void;
  onSetDraft: (session: string, value: string) => void;
  onSend: (session: string) => void;
  onClearDraft: (session: string) => void;
};

function renderSessionChips(
  allSessions: string[],
  openSessions: string[],
  onToggleSessionVisible: (session: string) => void,
  sessionTags: Record<string, string[]>,
  tagFilter: string
) {
  const normalizedFilter = tagFilter.trim().toLowerCase();
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
            <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{active ? `Open - ${session}` : session}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

export function TerminalsScreen({
  activeServer,
  connected,
  allSessions,
  openSessions,
  tails,
  drafts,
  sendBusy,
  streamLive,
  connectionMeta,
  sendModes,
  startCwd,
  startPrompt,
  startOpenOnMac,
  startKind,
  health,
  historyCount,
  sessionTags,
  allTags,
  tagFilter,
  isPro,
  onShowPaywall,
  onSetTagFilter,
  onSetStartCwd,
  onSetStartPrompt,
  onSetStartOpenOnMac,
  onSetStartKind,
  onRefreshSessions,
  onOpenServers,
  onStartSession,
  onToggleSessionVisible,
  onSetSessionMode,
  onOpenOnMac,
  onSyncSession,
  onFocusSession,
  onStopSession,
  onHideSession,
  onHistoryPrev,
  onHistoryNext,
  onSetTags,
  onSetDraft,
  onSend,
  onClearDraft,
}: TerminalsScreenProps) {
  const { width } = useWindowDimensions();
  const wantsSplit = width >= 900;
  const splitEnabled = !wantsSplit || isPro;

  const openTerminalCards = useMemo(() => {
    return openSessions.map((session) => {
      const output = tails[session] ?? "";
      const draft = drafts[session] ?? "";
      const isSending = Boolean(sendBusy[session]);
      const isLive = Boolean(streamLive[session]);
      const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
      const tags = sessionTags[session] || [];
      const meta = connectionMeta[session];

      return (
        <TerminalCard
          key={session}
          session={session}
          output={output}
          draft={draft}
          isSending={isSending}
          isLive={isLive}
          connectionState={meta?.state ?? "disconnected"}
          mode={mode}
          tags={tags}
          historyCount={historyCount[session] || 0}
          onSetMode={(nextMode) => onSetSessionMode(session, nextMode)}
          onOpenOnMac={() => onOpenOnMac(session)}
          onSync={() => onSyncSession(session)}
          onFullscreen={() => onFocusSession(session)}
          onStop={() => onStopSession(session)}
          onHide={() => onHideSession(session)}
          onHistoryPrev={() => onHistoryPrev(session)}
          onHistoryNext={() => onHistoryNext(session)}
          onTagsChange={(raw) => onSetTags(session, raw)}
          onDraftChange={(value) => onSetDraft(session, value)}
          onSend={() => onSend(session)}
          onClear={() => onClearDraft(session)}
        />
      );
    });
  }, [
    connectionMeta,
    drafts,
    historyCount,
    onClearDraft,
    onFocusSession,
    onHideSession,
    onHistoryNext,
    onHistoryPrev,
    onOpenOnMac,
    onSend,
    onSetDraft,
    onSetSessionMode,
    onSetTags,
    onStopSession,
    onSyncSession,
    openSessions,
    sendBusy,
    sendModes,
    sessionTags,
    streamLive,
    tails,
  ]);

  const topPanels = (
    <>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Connection Health</Text>
        <Text style={styles.serverSubtitle}>{`Streams ${health.activeStreams}/${health.openSessions}`}</Text>
        <Text style={styles.serverSubtitle}>{`Latency ${health.latencyMs !== null ? `${health.latencyMs} ms` : "n/a"}`}</Text>
        <Text style={styles.serverSubtitle}>
          {`Last ping ${health.lastPingAt ? new Date(health.lastPingAt).toLocaleTimeString() : "never"}`}
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Active Server</Text>
        <Text style={styles.serverTitle}>{activeServer?.name || "No server selected"}</Text>
        <Text style={styles.serverSubtitle}>{activeServer?.baseUrl || "Go to Servers tab to add one"}</Text>

        <View style={styles.rowInlineSpace}>
          <Pressable style={[styles.buttonPrimary, styles.flexButton]} onPress={onRefreshSessions} disabled={!connected}>
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
          <Pressable style={[styles.modeButton, startKind === "ai" ? styles.modeButtonOn : null]} onPress={() => onSetStartKind("ai")}>
            <Text style={[styles.modeButtonText, startKind === "ai" ? styles.modeButtonTextOn : null]}>AI</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, startKind === "shell" ? styles.modeButtonOn : null]}
            onPress={() => onSetStartKind("shell")}
          >
            <Text style={[styles.modeButtonText, startKind === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
          </Pressable>
        </View>

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

        {startKind === "ai" ? (
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

        <Pressable style={styles.buttonPrimary} onPress={onStartSession} disabled={!connected}>
          <Text style={styles.buttonPrimaryText}>Start {startKind === "ai" ? "AI" : "Shell"} Session</Text>
        </Pressable>
      </View>

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
              <Pressable
                key={tag}
                style={[styles.chip, tagFilter === tag ? styles.chipActive : null]}
                onPress={() => onSetTagFilter(tagFilter === tag ? "" : tag)}
              >
                <Text style={[styles.chipText, tagFilter === tag ? styles.chipTextActive : null]}>{tag}</Text>
              </Pressable>
            ))}
          </ScrollView>
        ) : null}

        {allSessions.length === 0 ? (
          <Text style={styles.emptyText}>No sessions found yet.</Text>
        ) : (
          renderSessionChips(allSessions, openSessions, onToggleSessionVisible, sessionTags, tagFilter)
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
