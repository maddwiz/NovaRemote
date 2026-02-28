import React from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { CWD_PLACEHOLDER, isLikelyAiSession } from "../constants";
import { styles } from "../theme/styles";
import { ServerProfile, TerminalSendMode } from "../types";
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
  sendModes: Record<string, TerminalSendMode>;
  startCwd: string;
  startPrompt: string;
  startOpenOnMac: boolean;
  startKind: TerminalSendMode;
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
  onSetDraft: (session: string, value: string) => void;
  onSend: (session: string) => void;
  onClearDraft: (session: string) => void;
};

export function TerminalsScreen({
  activeServer,
  connected,
  allSessions,
  openSessions,
  tails,
  drafts,
  sendBusy,
  streamLive,
  sendModes,
  startCwd,
  startPrompt,
  startOpenOnMac,
  startKind,
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
  onSetDraft,
  onSend,
  onClearDraft,
}: TerminalsScreenProps) {
  return (
    <>
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
        {allSessions.length === 0 ? (
          <Text style={styles.emptyText}>No sessions found yet.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {allSessions.map((session) => {
              const active = openSessions.includes(session);
              return (
                <Pressable key={session} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => onToggleSessionVisible(session)}>
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{active ? `Open - ${session}` : session}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Open Terminals</Text>
        {openSessions.length === 0 ? (
          <Text style={styles.emptyText}>Tap a session above to open it.</Text>
        ) : (
          openSessions.map((session) => {
            const output = tails[session] ?? "";
            const draft = drafts[session] ?? "";
            const isSending = Boolean(sendBusy[session]);
            const isLive = Boolean(streamLive[session]);
            const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");

            return (
              <TerminalCard
                key={session}
                session={session}
                output={output}
                draft={draft}
                isSending={isSending}
                isLive={isLive}
                mode={mode}
                onSetMode={(nextMode) => onSetSessionMode(session, nextMode)}
                onOpenOnMac={() => onOpenOnMac(session)}
                onSync={() => onSyncSession(session)}
                onFullscreen={() => onFocusSession(session)}
                onStop={() => onStopSession(session)}
                onHide={() => onHideSession(session)}
                onDraftChange={(value) => onSetDraft(session, value)}
                onSend={() => onSend(session)}
                onClear={() => onClearDraft(session)}
              />
            );
          })
        )}
      </View>
    </>
  );
}
