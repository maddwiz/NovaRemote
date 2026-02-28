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
import {
  AiEnginePreference,
  ConnectionState,
  QueuedCommand,
  QueuedCommandStatus,
  SessionCollaborator,
  TerminalBackendKind,
  TerminalSendMode,
} from "../types";
import { AnsiText } from "./AnsiText";

const SHELL_AUTOCOMPLETE_COMMON: string[] = [
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
  "kubectl logs -f ",
];

const SHELL_AUTOCOMPLETE_UNIX: string[] = [
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

const SHELL_AUTOCOMPLETE_POWERSHELL: string[] = [
  "Get-ChildItem",
  "Get-Location",
  "Set-Location ",
  "Get-Content ",
  "Get-Content -Tail 100 -Wait ",
  "Select-String -Path .\\* -Pattern \"\"",
  "Get-Process",
  "Stop-Process -Id ",
  "Get-Service",
  "Restart-Service -Name ",
  "Copy-Item -Recurse ",
  "Move-Item ",
  "Remove-Item -Recurse -Force ",
  "Invoke-WebRequest -Uri ",
  "Test-Connection -Count 4 ",
];

const SHELL_AUTOCOMPLETE_CMD: string[] = [
  "dir",
  "cd",
  "type ",
  "findstr /S /I \"\" *",
  "tasklist",
  "taskkill /PID  /F",
  "copy ",
  "move ",
  "del /F ",
  "rmdir /S /Q ",
  "ipconfig /all",
  "ping -n 4 ",
  "where ",
];

function backendAutocompleteCommands(backend: TerminalBackendKind | undefined): string[] {
  if (backend === "powershell") {
    return [...SHELL_AUTOCOMPLETE_COMMON, ...SHELL_AUTOCOMPLETE_POWERSHELL];
  }
  if (backend === "cmd") {
    return [...SHELL_AUTOCOMPLETE_COMMON, ...SHELL_AUTOCOMPLETE_CMD];
  }
  if (backend === "auto") {
    return [...SHELL_AUTOCOMPLETE_COMMON, ...SHELL_AUTOCOMPLETE_UNIX, ...SHELL_AUTOCOMPLETE_POWERSHELL, ...SHELL_AUTOCOMPLETE_CMD];
  }
  return [...SHELL_AUTOCOMPLETE_COMMON, ...SHELL_AUTOCOMPLETE_UNIX];
}

function queueStatus(entry: QueuedCommand): QueuedCommandStatus {
  const status = entry.status;
  if (status === "sending" || status === "sent" || status === "failed") {
    return status;
  }
  return "pending";
}

type KeyPressEventWithModifiers = TextInputKeyPressEventData & {
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
};

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
  errorHint: string | null;
  triageBusy: boolean;
  triageExplanation: string;
  triageFixes: string[];
  watchEnabled: boolean;
  watchPattern: string;
  watchAlerts: string[];
  collaborationAvailable: boolean;
  collaborators: SessionCollaborator[];
  readOnly: boolean;
  tags: string[];
  pinned: boolean;
  queuedItems: QueuedCommand[];
  recordingActive: boolean;
  recordingChunks: number;
  recordingDurationMs: number;
  historySuggestions: string[];
  terminalBackend?: TerminalBackendKind;
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
  onAdaptDraftForBackend: () => void;
  onRequestSuggestions: () => void;
  onUseSuggestion: (value: string) => void;
  onExplainError: () => void;
  onSuggestErrorFixes: () => void;
  onToggleWatch: (value: boolean) => void;
  onWatchPatternChange: (value: string) => void;
  onClearWatchAlerts: () => void;
  onRefreshPresence: () => void;
  onSetReadOnly: (value: boolean) => void;
  onTogglePin: () => void;
  onFlushQueue: () => void;
  onRemoveQueuedCommand: (index: number) => void;
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
  errorHint,
  triageBusy,
  triageExplanation,
  triageFixes,
  watchEnabled,
  watchPattern,
  watchAlerts,
  collaborationAvailable,
  collaborators,
  readOnly,
  tags,
  pinned,
  queuedItems,
  recordingActive,
  recordingChunks,
  recordingDurationMs,
  historySuggestions,
  terminalBackend,
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
  onAdaptDraftForBackend,
  onRequestSuggestions,
  onUseSuggestion,
  onExplainError,
  onSuggestErrorFixes,
  onToggleWatch,
  onWatchPatternChange,
  onClearWatchAlerts,
  onRefreshPresence,
  onSetReadOnly,
  onTogglePin,
  onFlushQueue,
  onRemoveQueuedCommand,
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
    if (normalized.length < 1) {
      return [];
    }
    const source = [...historySuggestions.slice().reverse(), ...backendAutocompleteCommands(terminalBackend)];
    const seen = new Set<string>();
    const ranked = source
      .map((command) => command.trim())
      .filter(Boolean)
      .filter((command) => {
        const lower = command.toLowerCase();
        if (!lower.includes(normalized)) {
          return false;
        }
        if (seen.has(lower)) {
          return false;
        }
        seen.add(lower);
        return true;
      })
      .sort((a, b) => {
        const aStarts = a.toLowerCase().startsWith(normalized) ? 0 : 1;
        const bStarts = b.toLowerCase().startsWith(normalized) ? 0 : 1;
        if (aStarts !== bStarts) {
          return aStarts - bStarts;
        }
        return a.length - b.length;
      });
    return ranked.filter((command) => command.toLowerCase() !== normalized).slice(0, 6);
  }, [draft, historySuggestions, mode, terminalBackend]);

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
  const queuedCount = queuedItems.length;
  const queuedPending = queuedItems.filter((entry) => queueStatus(entry) === "pending" || queueStatus(entry) === "sending").length;
  const queuedFailed = queuedItems.filter((entry) => queueStatus(entry) === "failed").length;
  const activeCollaborators = useMemo(() => collaborators.filter((entry) => !entry.isSelf), [collaborators]);
  const collaboratorNames = useMemo(() => activeCollaborators.map((entry) => entry.name).slice(0, 4), [activeCollaborators]);

  const onDraftKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const native = event.nativeEvent as KeyPressEventWithModifiers;
    const key = (native.key || "").toLowerCase();
    const hasMeta = Boolean(native.metaKey);
    const hasCtrl = Boolean(native.ctrlKey);
    if ((hasMeta || hasCtrl) && key === "enter") {
      if (!isSending && !readOnly) {
        onSend();
      }
      return;
    }
    if (hasCtrl && key === "c") {
      if (canStop && !readOnly) {
        onStop();
      }
      return;
    }
    if (hasMeta && key === "k") {
      onClear();
      return;
    }
    if (hasMeta && key === "w") {
      onHide();
      return;
    }
    if (hasMeta && key === "f") {
      onFullscreen();
      return;
    }
    if (key === "arrowup") {
      onHistoryPrev();
      return;
    }
    if (key === "arrowdown") {
      onHistoryNext();
      return;
    }
    if (mode === "shell" && key === "enter" && !isSending && !readOnly) {
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
            {collaborationAvailable ? (
              <Text style={[styles.livePill, styles.livePillWarn]}>{`VIEW ${activeCollaborators.length}`}</Text>
            ) : null}
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
          <Pressable
            style={[styles.actionDangerButton, !canStop || readOnly ? styles.buttonDisabled : null]}
            onPress={onStop}
            disabled={!canStop || readOnly}
          >
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

      {collaborationAvailable ? (
        <View style={styles.serverCard}>
          <View style={styles.rowInlineSpace}>
            <Text style={styles.panelLabel}>Collaboration</Text>
            <View style={styles.actionsWrap}>
              <Pressable style={styles.actionButton} onPress={onRefreshPresence}>
                <Text style={styles.actionButtonText}>Refresh Viewers</Text>
              </Pressable>
              <Pressable style={[styles.actionButton, readOnly ? styles.modeButtonOn : null]} onPress={() => onSetReadOnly(!readOnly)}>
                <Text style={styles.actionButtonText}>{readOnly ? "Read-Only" : "Interactive"}</Text>
              </Pressable>
            </View>
          </View>
          <Text style={styles.serverSubtitle}>
            {activeCollaborators.length === 0 ? "No other viewers detected." : `${activeCollaborators.length} viewer(s) connected.`}
          </Text>
          {collaboratorNames.length > 0 ? (
            <Text style={styles.emptyText}>{`Watching: ${collaboratorNames.join(", ")}${activeCollaborators.length > 4 ? "..." : ""}`}</Text>
          ) : null}
          {readOnly ? <Text style={styles.emptyText}>Read-only mode is enabled for this session.</Text> : null}
        </View>
      ) : null}

      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={draft}
        multiline
        editable={!isSending && !readOnly}
        placeholder={readOnly ? "Read-only collaboration mode is enabled" : mode === "ai" ? "Message AI..." : "Run shell command..."}
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

          <Pressable style={styles.actionButton} onPress={onAdaptDraftForBackend}>
            <Text style={styles.actionButtonText}>Adapt for Backend</Text>
          </Pressable>

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

          {errorHint ? (
            <View style={styles.serverCard}>
              <Text style={styles.panelLabel}>Error Triage</Text>
              <Text style={styles.emptyText}>{errorHint}</Text>
              <View style={styles.actionsWrap}>
                <Pressable style={[styles.actionButton, triageBusy ? styles.buttonDisabled : null]} onPress={onExplainError} disabled={triageBusy}>
                  <Text style={styles.actionButtonText}>{triageBusy ? "Analyzing..." : "Explain Error"}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionButton, triageBusy ? styles.buttonDisabled : null]}
                  onPress={onSuggestErrorFixes}
                  disabled={triageBusy}
                >
                  <Text style={styles.actionButtonText}>Fix Commands</Text>
                </Pressable>
              </View>
              {triageExplanation ? <Text style={styles.serverSubtitle}>{triageExplanation}</Text> : null}
              {triageFixes.length > 0 ? (
                <View style={styles.actionsWrap}>
                  {triageFixes.map((command) => (
                    <Pressable key={`${session}-triage-${command}`} style={styles.chip} onPress={() => onUseSuggestion(command)}>
                      <Text style={styles.chipText}>{command}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
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

      {watchAlerts.length > 0 ? (
        <View style={styles.serverCard}>
          <View style={styles.rowInlineSpace}>
            <Text style={styles.panelLabel}>Watch Alerts</Text>
            <Pressable style={styles.actionButton} onPress={onClearWatchAlerts}>
              <Text style={styles.actionButtonText}>Clear Alerts</Text>
            </Pressable>
          </View>
          {watchAlerts.slice(0, 4).map((alert, index) => (
            <Text key={`${session}-watch-${index}`} style={styles.serverSubtitle}>
              {alert}
            </Text>
          ))}
          {watchAlerts.length > 4 ? <Text style={styles.emptyText}>{`+${watchAlerts.length - 4} more alerts`}</Text> : null}
        </View>
      ) : null}

      {queuedCount > 0 ? (
        <View style={styles.serverCard}>
          <View style={styles.rowInlineSpace}>
            <Text style={styles.emptyText}>
              {`${queuedCount} queued (${queuedPending} pending`}
              {queuedFailed > 0 ? `, ${queuedFailed} failed` : ""}
              {")"}
            </Text>
            <Pressable style={styles.actionButton} onPress={onFlushQueue}>
              <Text style={styles.actionButtonText}>Flush Queue</Text>
            </Pressable>
          </View>
          {queuedItems.slice(0, 5).map((entry, index) => {
            const status = queueStatus(entry);
            return (
              <View key={`${entry.id || session}-${index}`} style={styles.serverCard}>
                <View style={styles.rowInlineSpace}>
                  <Text style={styles.serverSubtitle}>{entry.command}</Text>
                  <Text style={styles.emptyText}>{status.toUpperCase()}</Text>
                </View>
                {status === "failed" && entry.lastError ? <Text style={styles.emptyText}>{entry.lastError}</Text> : null}
                <View style={styles.rowInlineSpace}>
                  <Text style={styles.emptyText}>{new Date(entry.queuedAt).toLocaleTimeString()}</Text>
                  <Pressable style={styles.actionDangerButton} onPress={() => onRemoveQueuedCommand(index)}>
                    <Text style={styles.actionDangerText}>Remove</Text>
                  </Pressable>
                </View>
              </View>
            );
          })}
          {queuedItems.length > 5 ? (
            <Text style={styles.emptyText}>{`+${queuedItems.length - 5} more queued`}</Text>
          ) : null}
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
        <Pressable style={[styles.buttonPrimary, styles.flexButton, isSending || readOnly ? styles.buttonDisabled : null]} disabled={isSending || readOnly} onPress={onSend}>
          <Text style={styles.buttonPrimaryText}>{isSending ? "Sending..." : readOnly ? "Read-Only" : "Send"}</Text>
        </Pressable>
        <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onClear}>
          <Text style={styles.buttonGhostText}>Clear</Text>
        </Pressable>
      </View>
      <Text style={styles.emptyText}>Shortcuts: Cmd/Ctrl+Enter send, Ctrl+C stop, Cmd+K clear, Cmd+W hide, Cmd+F fullscreen.</Text>
    </View>
  );
}
