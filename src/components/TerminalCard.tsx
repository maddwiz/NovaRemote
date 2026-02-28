import React, { useMemo, useRef } from "react";
import {
  NativeSyntheticEvent,
  StyleProp,
  TextInputKeyPressEventData,
  TextStyle,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";

import { styles } from "../theme/styles";
import { AiEnginePreference, ConnectionState, TerminalSendMode } from "../types";
import { AnsiText } from "./AnsiText";

const SHELL_AUTOCOMPLETE_COMMANDS: string[] = [
  "git status",
  "git pull --rebase",
  "git checkout -b feature/",
  "git add .",
  "git commit -m \"\"",
  "git push",
  "npm install",
  "npm run dev",
  "npm run build",
  "npm test",
  "pnpm install",
  "pnpm dev",
  "yarn install",
  "yarn dev",
  "docker ps",
  "docker logs -f ",
  "docker compose up -d",
  "docker compose logs -f",
  "kubectl get pods -A",
  "kubectl describe pod ",
  "ls -la",
  "pwd",
  "cd ",
  "cat ",
  "tail -f ",
  "grep -R \"\" .",
  "find . -name \"\"",
  "ps aux | grep ",
  "top",
  "du -sh *",
  "df -h",
  "curl -I ",
  "ssh ",
  "tmux ls",
  "tmux attach -t ",
];

type TerminalCardProps = {
  session: string;
  sessionAlias: string;
  output: string;
  draft: string;
  isSending: boolean;
  isLive: boolean;
  isServerConnected: boolean;
  connectionState: ConnectionState;
  isLocalOnly: boolean;
  mode: TerminalSendMode;
  aiAvailable: boolean;
  shellAvailable: boolean;
  canOpenOnMac: boolean;
  canSync: boolean;
  canStop: boolean;
  aiEngine: AiEnginePreference;
  canUseServerAi: boolean;
  canUseExternalAi: boolean;
  suggestions: string[];
  suggestionsBusy: boolean;
  watchEnabled: boolean;
  watchPattern: string;
  tags: string[];
  pinned: boolean;
  queuedCount: number;
  recordingActive: boolean;
  recordingChunks: number;
  recordingDurationMs: number;
  terminalViewStyle?: StyleProp<ViewStyle>;
  terminalTextStyle?: StyleProp<TextStyle>;
  onSetMode: (mode: TerminalSendMode) => void;
  onSetAiEngine: (engine: AiEnginePreference) => void;
  onOpenOnMac: () => void;
  onSync: () => void;
  onExport: () => void;
  onFullscreen: () => void;
  onStop: () => void;
  onHide: () => void;
  onHistoryPrev: () => void;
  onHistoryNext: () => void;
  onTagsChange: (raw: string) => void;
  onSessionAliasChange: (value: string) => void;
  onAutoName: () => void;
  onDraftChange: (value: string) => void;
  onRequestSuggestions: () => void;
  onUseSuggestion: (value: string) => void;
  onToggleWatch: (value: boolean) => void;
  onWatchPatternChange: (value: string) => void;
  onTogglePin: () => void;
  onFlushQueue: () => void;
  onToggleRecording: () => void;
  onOpenPlayback: () => void;
  onDeleteRecording: () => void;
  onSend: () => void;
  onClear: () => void;
  historyCount: number;
};

export function TerminalCard({
  session,
  sessionAlias,
  output,
  draft,
  isSending,
  isLive,
  isServerConnected,
  connectionState,
  isLocalOnly,
  mode,
  aiAvailable,
  shellAvailable,
  canOpenOnMac,
  canSync,
  canStop,
  aiEngine,
  canUseServerAi,
  canUseExternalAi,
  suggestions,
  suggestionsBusy,
  watchEnabled,
  watchPattern,
  tags,
  pinned,
  queuedCount,
  recordingActive,
  recordingChunks,
  recordingDurationMs,
  terminalViewStyle,
  terminalTextStyle,
  onSetMode,
  onSetAiEngine,
  onOpenOnMac,
  onSync,
  onExport,
  onFullscreen,
  onStop,
  onHide,
  onHistoryPrev,
  onHistoryNext,
  onTagsChange,
  onSessionAliasChange,
  onAutoName,
  onDraftChange,
  onRequestSuggestions,
  onUseSuggestion,
  onToggleWatch,
  onWatchPatternChange,
  onTogglePin,
  onFlushQueue,
  onToggleRecording,
  onOpenPlayback,
  onDeleteRecording,
  onSend,
  onClear,
  historyCount,
}: TerminalCardProps) {
  const terminalRef = useRef<ScrollView | null>(null);
  const autocomplete = useMemo(() => {
    if (mode !== "shell") {
      return [];
    }
    const normalized = draft.trim().toLowerCase();
    if (normalized.length < 2) {
      return [];
    }
    return SHELL_AUTOCOMPLETE_COMMANDS.filter((command) => command.toLowerCase().startsWith(normalized))
      .filter((command) => command.toLowerCase() !== normalized)
      .slice(0, 4);
  }, [draft, mode]);

  const streamState: "live" | "reconnecting" | "polling" | "disconnected" | "local" =
    isLocalOnly
      ? "local"
      : connectionState === "connected"
      ? "live"
      : connectionState === "reconnecting"
        ? "reconnecting"
        : isServerConnected
          ? "polling"
          : "disconnected";

  const liveLabel = streamState === "local"
    ? "LOCAL"
    : streamState === "live"
      ? "LIVE"
      : streamState === "reconnecting"
        ? "RETRY"
        : streamState === "polling"
          ? "POLL"
          : "OFF";

  const onDraftKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const key = event.nativeEvent.key;
    if (key === "ArrowUp") {
      onHistoryPrev();
      return;
    }
    if (key === "ArrowDown") {
      onHistoryNext();
      return;
    }
    if (mode === "shell" && key === "Enter" && !isSending) {
      onSend();
    }
  };

  return (
    <View style={styles.terminalCard}>
      <View style={styles.terminalHeader}>
        <View style={styles.terminalNameRow}>
          <View style={styles.flexButton}>
            <Text style={styles.terminalName}>{sessionAlias.trim() || session}</Text>
            {sessionAlias.trim() ? <Text style={styles.serverSubtitle}>{session}</Text> : null}
          </View>
          <View style={styles.pillGroup}>
            <Text style={[styles.modePill, mode === "ai" ? styles.modePillAi : styles.modePillShell]}>
              {mode.toUpperCase()}
            </Text>
            <Text
              style={[
                styles.livePill,
                streamState === "live" ? styles.livePillOn : streamState === "disconnected" ? styles.livePillOff : styles.livePillWarn,
              ]}
            >
              {liveLabel}
            </Text>
            <View
              style={[
                styles.liveDot,
                streamState === "live" ? styles.liveDotGreen : streamState === "disconnected" ? styles.liveDotRed : styles.liveDotYellow,
              ]}
            />
          </View>
        </View>

        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeButton, mode === "ai" ? styles.modeButtonOn : null, !aiAvailable ? styles.buttonDisabled : null]}
            onPress={() => onSetMode("ai")}
            disabled={!aiAvailable}
          >
            <Text style={[styles.modeButtonText, mode === "ai" ? styles.modeButtonTextOn : null]}>AI</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === "shell" ? styles.modeButtonOn : null, !shellAvailable ? styles.buttonDisabled : null]}
            onPress={() => onSetMode("shell")}
            disabled={!shellAvailable}
          >
            <Text style={[styles.modeButtonText, mode === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
          </Pressable>
        </View>

        {mode === "ai" ? (
          <View style={styles.modeRow}>
            <Pressable style={[styles.modeButton, aiEngine === "auto" ? styles.modeButtonOn : null]} onPress={() => onSetAiEngine("auto")}>
              <Text style={[styles.modeButtonText, aiEngine === "auto" ? styles.modeButtonTextOn : null]}>AI Auto</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, aiEngine === "server" ? styles.modeButtonOn : null, !canUseServerAi ? styles.buttonDisabled : null]}
              onPress={() => onSetAiEngine("server")}
              disabled={!canUseServerAi}
            >
              <Text style={[styles.modeButtonText, aiEngine === "server" ? styles.modeButtonTextOn : null]}>Server</Text>
            </Pressable>
            <Pressable
              style={[styles.modeButton, aiEngine === "external" ? styles.modeButtonOn : null, !canUseExternalAi ? styles.buttonDisabled : null]}
              onPress={() => onSetAiEngine("external")}
              disabled={!canUseExternalAi}
            >
              <Text style={[styles.modeButtonText, aiEngine === "external" ? styles.modeButtonTextOn : null]}>External</Text>
            </Pressable>
          </View>
        ) : null}

        <View style={styles.actionsWrap}>
          <Pressable style={[styles.actionButton, !canOpenOnMac ? styles.buttonDisabled : null]} onPress={onOpenOnMac} disabled={!canOpenOnMac}>
            <Text style={styles.actionButtonText}>Open on Mac</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, !canSync ? styles.buttonDisabled : null]} onPress={onSync} disabled={!canSync}>
            <Text style={styles.actionButtonText}>Sync</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onExport}>
            <Text style={styles.actionButtonText}>Export</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onFullscreen}>
            <Text style={styles.actionButtonText}>Fullscreen</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, pinned ? styles.modeButtonOn : null]} onPress={onTogglePin}>
            <Text style={styles.actionButtonText}>{pinned ? "Unpin" : "Pin"}</Text>
          </Pressable>
          <Pressable style={[styles.actionButton, recordingActive ? styles.livePillOff : null]} onPress={onToggleRecording}>
            <Text style={styles.actionButtonText}>{recordingActive ? "Stop Rec" : "Record"}</Text>
          </Pressable>
          <Pressable
            style={[styles.actionButton, recordingChunks === 0 ? styles.buttonDisabled : null]}
            onPress={onOpenPlayback}
            disabled={recordingChunks === 0}
          >
            <Text style={styles.actionButtonText}>Playback</Text>
          </Pressable>
          <Pressable style={[styles.actionDangerButton, !canStop ? styles.buttonDisabled : null]} onPress={onStop} disabled={!canStop}>
            <Text style={styles.actionDangerText}>Stop</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onAutoName}>
            <Text style={styles.actionButtonText}>Auto Name</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onHide}>
            <Text style={styles.actionButtonText}>Hide</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={terminalRef}
        style={[styles.terminalView, terminalViewStyle]}
        onContentSizeChange={() => terminalRef.current?.scrollToEnd({ animated: true })}
      >
        <AnsiText text={output || "Waiting for output..."} style={[styles.terminalText, terminalTextStyle]} />
      </ScrollView>

      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={draft}
        multiline
        editable={!isSending}
        placeholder={mode === "ai" ? "Message AI..." : "Run shell command..."}
        placeholderTextColor="#7f7aa8"
        onKeyPress={onDraftKeyPress}
        onChangeText={onDraftChange}
      />

      {mode === "shell" ? (
        <View style={styles.serverListWrap}>
          {autocomplete.length > 0 ? (
            <View style={styles.actionsWrap}>
              {autocomplete.map((command) => (
                <Pressable key={`${session}-auto-${command}`} style={styles.chip} onPress={() => onDraftChange(command)}>
                  <Text style={styles.chipText}>{command}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Pressable
            style={[styles.actionButton, suggestionsBusy ? styles.buttonDisabled : null]}
            onPress={onRequestSuggestions}
            disabled={suggestionsBusy}
          >
            <Text style={styles.actionButtonText}>{suggestionsBusy ? "Thinking..." : "AI Suggestions"}</Text>
          </Pressable>
          {suggestions.length > 0 ? (
            <View style={styles.actionsWrap}>
              {suggestions.map((suggestion) => (
                <Pressable key={`${session}-${suggestion}`} style={styles.chip} onPress={() => onUseSuggestion(suggestion)}>
                  <Text style={styles.chipText}>{suggestion}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.rowInlineSpace}>
        <Text style={styles.switchLabel}>Watch Mode</Text>
        <Pressable style={[styles.actionButton, watchEnabled ? styles.modeButtonOn : null]} onPress={() => onToggleWatch(!watchEnabled)}>
          <Text style={styles.actionButtonText}>{watchEnabled ? "Enabled" : "Disabled"}</Text>
        </Pressable>
      </View>
      {watchEnabled ? (
        <TextInput
          style={styles.input}
          value={watchPattern}
          onChangeText={onWatchPatternChange}
          placeholder="Regex alert pattern (e.g. ERROR|FAILED)"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}

      {queuedCount > 0 ? (
        <View style={styles.rowInlineSpace}>
          <Text style={styles.emptyText}>{`${queuedCount} queued command${queuedCount === 1 ? "" : "s"}`}</Text>
          <Pressable style={styles.actionButton} onPress={onFlushQueue}>
            <Text style={styles.actionButtonText}>Flush Queue</Text>
          </Pressable>
        </View>
      ) : null}

      {recordingChunks > 0 ? (
        <View style={styles.rowInlineSpace}>
          <Text style={styles.emptyText}>{`${recordingChunks} rec chunks · ${(recordingDurationMs / 1000).toFixed(1)}s`}</Text>
          <Pressable style={styles.actionDangerButton} onPress={onDeleteRecording}>
            <Text style={styles.actionDangerText}>Delete Rec</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.rowInlineSpace}>
        <Pressable style={styles.actionButton} onPress={onHistoryPrev}>
          <Text style={styles.actionButtonText}>↑</Text>
        </Pressable>
        <Pressable style={styles.actionButton} onPress={onHistoryNext}>
          <Text style={styles.actionButtonText}>↓</Text>
        </Pressable>
        <Text style={styles.emptyText}>{`History ${historyCount}`}</Text>
      </View>

      <TextInput
        style={styles.input}
        value={sessionAlias}
        onChangeText={onSessionAliasChange}
        placeholder="Session label (optional)"
        placeholderTextColor="#7f7aa8"
        autoCorrect={false}
      />

      <TextInput
        style={styles.input}
        value={tags.join(", ")}
        onChangeText={onTagsChange}
        placeholder="Tags (comma separated)"
        placeholderTextColor="#7f7aa8"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.rowInlineSpace}>
        <Pressable style={[styles.buttonPrimary, styles.flexButton, isSending ? styles.buttonDisabled : null]} disabled={isSending} onPress={onSend}>
          <Text style={styles.buttonPrimaryText}>{isSending ? "Sending..." : "Send"}</Text>
        </Pressable>
        <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onClear}>
          <Text style={styles.buttonGhostText}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}
