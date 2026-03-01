import React from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../theme/styles";
import { AiEnginePreference, TerminalSendMode } from "../../types";

type StreamState = "live" | "reconnecting" | "polling" | "disconnected" | "local";

type TerminalCardHeaderProps = {
  session: string;
  sessionAlias: string;
  mode: TerminalSendMode;
  aiAvailable: boolean;
  shellAvailable: boolean;
  aiEngine: AiEnginePreference;
  canUseServerAi: boolean;
  canUseExternalAi: boolean;
  collaborationAvailable: boolean;
  activeCollaboratorCount: number;
  streamState: StreamState;
  liveLabel: string;
  canOpenOnMac: boolean;
  canSync: boolean;
  canShareLive: boolean;
  canStop: boolean;
  pinned: boolean;
  recordingActive: boolean;
  recordingChunks: number;
  readOnly: boolean;
  onSetMode: (mode: TerminalSendMode) => void;
  onSetAiEngine: (engine: AiEnginePreference) => void;
  onOpenOnMac: () => void;
  onSync: () => void;
  onShareLive: () => void;
  onExport: () => void;
  onFullscreen: () => void;
  onTogglePin: () => void;
  onToggleRecording: () => void;
  onOpenPlayback: () => void;
  onStop: () => void;
  onAutoName: () => void;
  onHide: () => void;
};

export function TerminalCardHeader({
  session,
  sessionAlias,
  mode,
  aiAvailable,
  shellAvailable,
  aiEngine,
  canUseServerAi,
  canUseExternalAi,
  collaborationAvailable,
  activeCollaboratorCount,
  streamState,
  liveLabel,
  canOpenOnMac,
  canSync,
  canShareLive,
  canStop,
  pinned,
  recordingActive,
  recordingChunks,
  readOnly,
  onSetMode,
  onSetAiEngine,
  onOpenOnMac,
  onSync,
  onShareLive,
  onExport,
  onFullscreen,
  onTogglePin,
  onToggleRecording,
  onOpenPlayback,
  onStop,
  onAutoName,
  onHide,
}: TerminalCardHeaderProps) {
  return (
    <View style={styles.terminalHeader}>
      <View style={styles.terminalNameRow}>
        <View style={styles.flexButton}>
          <Text style={styles.terminalName}>{sessionAlias.trim() || session}</Text>
          {sessionAlias.trim() ? <Text style={styles.serverSubtitle}>{session}</Text> : null}
        </View>
        <View style={styles.pillGroup}>
          <Text style={[styles.modePill, mode === "ai" ? styles.modePillAi : styles.modePillShell]}>{mode.toUpperCase()}</Text>
          {collaborationAvailable ? <Text style={[styles.livePill, styles.livePillWarn]}>{`VIEW ${activeCollaboratorCount}`}</Text> : null}
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
          accessibilityRole="button"
          accessibilityLabel={`Set ${session} mode to AI`}
          style={[styles.modeButton, mode === "ai" ? styles.modeButtonOn : null, !aiAvailable ? styles.buttonDisabled : null]}
          onPress={() => onSetMode("ai")}
          disabled={!aiAvailable}
        >
          <Text style={[styles.modeButtonText, mode === "ai" ? styles.modeButtonTextOn : null]}>AI</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Set ${session} mode to shell`}
          style={[styles.modeButton, mode === "shell" ? styles.modeButtonOn : null, !shellAvailable ? styles.buttonDisabled : null]}
          onPress={() => onSetMode("shell")}
          disabled={!shellAvailable}
        >
          <Text style={[styles.modeButtonText, mode === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
        </Pressable>
      </View>

      {mode === "ai" ? (
        <View style={styles.modeRow}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Set ${session} AI engine to auto`} style={[styles.modeButton, aiEngine === "auto" ? styles.modeButtonOn : null]} onPress={() => onSetAiEngine("auto")}>
            <Text style={[styles.modeButtonText, aiEngine === "auto" ? styles.modeButtonTextOn : null]}>AI Auto</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set ${session} AI engine to server`}
            style={[styles.modeButton, aiEngine === "server" ? styles.modeButtonOn : null, !canUseServerAi ? styles.buttonDisabled : null]}
            onPress={() => onSetAiEngine("server")}
            disabled={!canUseServerAi}
          >
            <Text style={[styles.modeButtonText, aiEngine === "server" ? styles.modeButtonTextOn : null]}>Server</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Set ${session} AI engine to external`}
            style={[styles.modeButton, aiEngine === "external" ? styles.modeButtonOn : null, !canUseExternalAi ? styles.buttonDisabled : null]}
            onPress={() => onSetAiEngine("external")}
            disabled={!canUseExternalAi}
          >
            <Text style={[styles.modeButtonText, aiEngine === "external" ? styles.modeButtonTextOn : null]}>External</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.actionsWrap}>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${session} on Mac`} style={[styles.actionButton, !canOpenOnMac ? styles.buttonDisabled : null]} onPress={onOpenOnMac} disabled={!canOpenOnMac}>
          <Text style={styles.actionButtonText}>Open on Mac</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Sync output for ${session}`} style={[styles.actionButton, !canSync ? styles.buttonDisabled : null]} onPress={onSync} disabled={!canSync}>
          <Text style={styles.actionButtonText}>Sync</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Create live spectator link for ${session}`}
          style={[styles.actionButton, !canShareLive ? styles.buttonDisabled : null]}
          onPress={onShareLive}
          disabled={!canShareLive}
        >
          <Text style={styles.actionButtonText}>Share Live</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Export ${session} log`} style={styles.actionButton} onPress={onExport}>
          <Text style={styles.actionButtonText}>Export</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Open ${session} in fullscreen`} style={styles.actionButton} onPress={onFullscreen}>
          <Text style={styles.actionButtonText}>Fullscreen</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={pinned ? `Unpin ${session}` : `Pin ${session}`} style={[styles.actionButton, pinned ? styles.modeButtonOn : null]} onPress={onTogglePin}>
          <Text style={styles.actionButtonText}>{pinned ? "Unpin" : "Pin"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={recordingActive ? `Stop recording ${session}` : `Start recording ${session}`} style={[styles.actionButton, recordingActive ? styles.livePillOff : null]} onPress={onToggleRecording}>
          <Text style={styles.actionButtonText}>{recordingActive ? "Stop Rec" : "Record"}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open playback for ${session}`}
          style={[styles.actionButton, recordingChunks === 0 ? styles.buttonDisabled : null]}
          onPress={onOpenPlayback}
          disabled={recordingChunks === 0}
        >
          <Text style={styles.actionButtonText}>Playback</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Stop ${session}`}
          style={[styles.actionDangerButton, !canStop || readOnly ? styles.buttonDisabled : null]}
          onPress={onStop}
          disabled={!canStop || readOnly}
        >
          <Text style={styles.actionDangerText}>Stop</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Auto name ${session}`} style={styles.actionButton} onPress={onAutoName}>
          <Text style={styles.actionButtonText}>Auto Name</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={`Hide ${session}`} style={styles.actionButton} onPress={onHide}>
          <Text style={styles.actionButtonText}>Hide</Text>
        </Pressable>
      </View>
    </View>
  );
}
