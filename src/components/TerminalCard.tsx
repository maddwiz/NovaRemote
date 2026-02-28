import React, { useRef } from "react";
import { StyleProp, TextStyle, Pressable, ScrollView, Text, TextInput, View, ViewStyle } from "react-native";

import { styles } from "../theme/styles";
import { AiEnginePreference, ConnectionState, TerminalSendMode } from "../types";
import { AnsiText } from "./AnsiText";

type TerminalCardProps = {
  session: string;
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
  onDraftChange: (value: string) => void;
  onRequestSuggestions: () => void;
  onUseSuggestion: (value: string) => void;
  onToggleWatch: (value: boolean) => void;
  onWatchPatternChange: (value: string) => void;
  onTogglePin: () => void;
  onSend: () => void;
  onClear: () => void;
  historyCount: number;
};

export function TerminalCard({
  session,
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
  onDraftChange,
  onRequestSuggestions,
  onUseSuggestion,
  onToggleWatch,
  onWatchPatternChange,
  onTogglePin,
  onSend,
  onClear,
  historyCount,
}: TerminalCardProps) {
  const terminalRef = useRef<ScrollView | null>(null);

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

  return (
    <View style={styles.terminalCard}>
      <View style={styles.terminalHeader}>
        <View style={styles.terminalNameRow}>
          <Text style={styles.terminalName}>{session}</Text>
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
          <Pressable style={[styles.actionDangerButton, !canStop ? styles.buttonDisabled : null]} onPress={onStop} disabled={!canStop}>
            <Text style={styles.actionDangerText}>Stop</Text>
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
        onChangeText={onDraftChange}
      />

      {mode === "shell" ? (
        <View style={styles.serverListWrap}>
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
