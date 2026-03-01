import React, { useMemo, useRef } from "react";
import {
  NativeSyntheticEvent,
  StyleProp,
  TextInputKeyPressEventData,
  TextStyle,
  ScrollView,
  TextInput,
  View,
  ViewStyle,
} from "react-native";

import { TextEditingAction, useTextEditing } from "../hooks/useTextEditing";
import { styles } from "../theme/styles";
import {
  AiEnginePreference,
  ConnectionState,
  QueuedCommand,
  SessionCollaborator,
  TerminalBackendKind,
  TerminalSendMode,
} from "../types";
import { AnsiText } from "./AnsiText";
import { TerminalCardCollaboration } from "./terminal-card/TerminalCardCollaboration";
import { TerminalCardFooter } from "./terminal-card/TerminalCardFooter";
import { TerminalCardHeader } from "./terminal-card/TerminalCardHeader";
import { TerminalCardQueue } from "./terminal-card/TerminalCardQueue";
import { TerminalCardShellAssist } from "./terminal-card/TerminalCardShellAssist";
import { TerminalCardWatch } from "./terminal-card/TerminalCardWatch";
import { TerminalKeyboardBar } from "./TerminalKeyboardBar";

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
  canShareLive: boolean;
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
  onShareLive: () => void;
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
  onSendControlChar: (char: string) => void;
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
  canShareLive,
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
  onShareLive,
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
  onSendControlChar,
  onSend,
  onClear,
  historyCount,
}: TerminalCardProps) {
  const terminalRef = useRef<ScrollView | null>(null);
  const {
    selection: draftSelection,
    onSelectionChange: onDraftSelectionChange,
    insertTextAtCursor,
    handleAction: handleDraftAction,
  } = useTextEditing({
    value: draft,
    onChange: onDraftChange,
    disabled: readOnly || isSending,
    onHistoryPrev,
    onHistoryNext,
  });
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
  const activeCollaborators = useMemo(() => collaborators.filter((entry) => !entry.isSelf), [collaborators]);

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
      <TerminalCardHeader
        session={session}
        sessionAlias={sessionAlias}
        mode={mode}
        aiAvailable={aiAvailable}
        shellAvailable={shellAvailable}
        aiEngine={aiEngine}
        canUseServerAi={canUseServerAi}
        canUseExternalAi={canUseExternalAi}
        collaborationAvailable={collaborationAvailable}
        activeCollaboratorCount={activeCollaborators.length}
        streamState={streamState}
        liveLabel={liveLabel}
        canOpenOnMac={canOpenOnMac}
        canSync={canSync}
        canShareLive={canShareLive}
        canStop={canStop}
        pinned={pinned}
        recordingActive={recordingActive}
        recordingChunks={recordingChunks}
        readOnly={readOnly}
        onSetMode={onSetMode}
        onSetAiEngine={onSetAiEngine}
        onOpenOnMac={onOpenOnMac}
        onSync={onSync}
        onShareLive={onShareLive}
        onExport={onExport}
        onFullscreen={onFullscreen}
        onTogglePin={onTogglePin}
        onToggleRecording={onToggleRecording}
        onOpenPlayback={onOpenPlayback}
        onStop={onStop}
        onAutoName={onAutoName}
        onHide={onHide}
      />

      <ScrollView
        ref={terminalRef}
        style={[styles.terminalView, terminalViewStyle]}
        onContentSizeChange={() => terminalRef.current?.scrollToEnd({ animated: true })}
      >
        <AnsiText text={output || "Waiting for output..."} style={[styles.terminalText, terminalTextStyle]} />
      </ScrollView>

      <TerminalCardCollaboration
        collaborationAvailable={collaborationAvailable}
        collaborators={collaborators}
        readOnly={readOnly}
        onRefreshPresence={onRefreshPresence}
        onSetReadOnly={onSetReadOnly}
      />

      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={draft}
        selection={draftSelection}
        multiline
        editable={!isSending && !readOnly}
        placeholder={readOnly ? "Read-only collaboration mode is enabled" : mode === "ai" ? "Message AI..." : "Run shell command..."}
        placeholderTextColor="#7f7aa8"
        onKeyPress={onDraftKeyPress}
        onChangeText={onDraftChange}
        onSelectionChange={onDraftSelectionChange}
      />
      <TerminalKeyboardBar
        visible={!readOnly}
        onInsertText={insertTextAtCursor}
        onControlChar={(value) => {
          if (readOnly) {
            return;
          }
          onSendControlChar(value);
        }}
        onAction={(action) => handleDraftAction(action as TextEditingAction)}
      />

      {mode === "shell" ? (
        <TerminalCardShellAssist
          session={session}
          autocomplete={autocomplete}
          suggestionsBusy={suggestionsBusy}
          suggestions={suggestions}
          errorHint={errorHint}
          triageBusy={triageBusy}
          triageExplanation={triageExplanation}
          triageFixes={triageFixes}
          onDraftChange={onDraftChange}
          onAdaptDraftForBackend={onAdaptDraftForBackend}
          onRequestSuggestions={onRequestSuggestions}
          onUseSuggestion={onUseSuggestion}
          onExplainError={onExplainError}
          onSuggestErrorFixes={onSuggestErrorFixes}
        />
      ) : null}

      <TerminalCardWatch
        session={session}
        watchEnabled={watchEnabled}
        watchPattern={watchPattern}
        watchAlerts={watchAlerts}
        onToggleWatch={onToggleWatch}
        onWatchPatternChange={onWatchPatternChange}
        onClearWatchAlerts={onClearWatchAlerts}
      />

      <TerminalCardQueue
        session={session}
        queuedItems={queuedItems}
        onFlushQueue={onFlushQueue}
        onRemoveQueuedCommand={onRemoveQueuedCommand}
      />

      <TerminalCardFooter
        recordingChunks={recordingChunks}
        recordingDurationMs={recordingDurationMs}
        historyCount={historyCount}
        sessionAlias={sessionAlias}
        tags={tags}
        isSending={isSending}
        readOnly={readOnly}
        onDeleteRecording={onDeleteRecording}
        onHistoryPrev={onHistoryPrev}
        onHistoryNext={onHistoryNext}
        onSessionAliasChange={onSessionAliasChange}
        onTagsChange={onTagsChange}
        onSend={onSend}
        onClear={onClear}
      />
    </View>
  );
}
