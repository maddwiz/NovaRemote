import * as Haptics from "expo-haptics";
import React from "react";
import { Modal, Text, View } from "react-native";
import { FeedbackPressable as Pressable } from "../FeedbackPressable";

import { styles } from "../../theme/styles";
import { AiEnginePreference, TerminalSendMode } from "../../types";

type StreamState = "live" | "reconnecting" | "polling" | "disconnected" | "local";

type TerminalCardHeaderProps = {
  session: string;
  sessionAlias: string;
  serverLabel?: string;
  showServerLabel?: boolean;
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
  serverLabel,
  showServerLabel = false,
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
  const [showMoreActions, setShowMoreActions] = React.useState<boolean>(false);
  const fireSelectionHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };
  const fireMediumHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  };
  const moreActions = [
    {
      key: "open-mac",
      label: "Open on Mac",
      onPress: onOpenOnMac,
      disabled: !canOpenOnMac,
    },
    {
      key: "sync",
      label: "Sync",
      onPress: onSync,
      disabled: !canSync,
    },
    {
      key: "share",
      label: "Share Live",
      onPress: onShareLive,
      disabled: !canShareLive,
    },
    {
      key: "export",
      label: "Export",
      onPress: onExport,
      disabled: false,
    },
    {
      key: "pin",
      label: pinned ? "Unpin" : "Pin",
      onPress: onTogglePin,
      disabled: false,
    },
    {
      key: "record",
      label: recordingActive ? "Stop Rec" : "Record",
      onPress: onToggleRecording,
      disabled: false,
    },
    {
      key: "playback",
      label: "Playback",
      onPress: onOpenPlayback,
      disabled: recordingChunks === 0,
    },
    {
      key: "auto-name",
      label: "Auto Name",
      onPress: onAutoName,
      disabled: false,
    },
    {
      key: "hide",
      label: "Hide",
      onPress: onHide,
      disabled: false,
    },
  ];
  if (aiAvailable) {
    moreActions.unshift({
      key: "mode-ai",
      label: "Mode: AI",
      onPress: () => onSetMode("ai"),
      disabled: !aiAvailable,
    });
  }
  if (shellAvailable) {
    moreActions.unshift({
      key: "mode-shell",
      label: "Mode: Shell",
      onPress: () => onSetMode("shell"),
      disabled: !shellAvailable,
    });
  }
  if (mode === "ai") {
    moreActions.unshift(
      {
        key: "engine-auto",
        label: "AI Engine: Auto",
        onPress: () => onSetAiEngine("auto"),
        disabled: aiEngine === "auto",
      },
      {
        key: "engine-server",
        label: "AI Engine: Server",
        onPress: () => onSetAiEngine("server"),
        disabled: !canUseServerAi || aiEngine === "server",
      },
      {
        key: "engine-external",
        label: "AI Engine: External",
        onPress: () => onSetAiEngine("external"),
        disabled: !canUseExternalAi || aiEngine === "external",
      }
    );
  }

  return (
    <View style={styles.terminalHeader}>
      <View style={styles.terminalNameRow}>
        <View style={styles.flexButton}>
          <Text style={styles.terminalName}>{sessionAlias.trim() || session}</Text>
          {sessionAlias.trim() ? <Text style={styles.serverSubtitle}>{session}</Text> : null}
          {showServerLabel && serverLabel ? <Text style={[styles.livePill, styles.modePillShell]}>{serverLabel}</Text> : null}
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

      <View style={styles.actionsWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open ${session} in fullscreen`}
          style={({ pressed }) => [styles.actionButton, pressed ? styles.pressablePressed : null]}
          onPress={() => {
            fireSelectionHaptic();
            onFullscreen();
          }}
        >
          <Text style={styles.actionButtonText}>Fullscreen</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Close ${session}`}
          style={({ pressed }) => [
            styles.actionDangerButton,
            !canStop || readOnly ? styles.buttonDisabled : null,
            pressed ? styles.pressablePressed : null,
          ]}
          onPress={() => {
            fireMediumHaptic();
            onStop();
          }}
          disabled={!canStop || readOnly}
        >
          <Text style={styles.actionDangerText}>Close</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Open more actions for ${session}`}
          style={({ pressed }) => [styles.actionButton, pressed ? styles.pressablePressed : null]}
          onPress={() => {
            fireSelectionHaptic();
            setShowMoreActions(true);
          }}
        >
          <Text style={styles.actionButtonText}>More</Text>
        </Pressable>
      </View>

      <Modal
        visible={showMoreActions}
        transparent
        animationType="fade"
        onRequestClose={() => setShowMoreActions(false)}
      >
        <Pressable style={({ pressed }) => [styles.overlayBackdrop, pressed ? { opacity: 0.98 } : null]} onPress={() => setShowMoreActions(false)}>
          <Pressable
            style={styles.overlayCard}
            onPress={(event) => {
              event.stopPropagation();
            }}
          >
            <Text style={styles.panelLabel}>Session Actions</Text>
            <Text style={styles.serverSubtitle}>{sessionAlias.trim() || session}</Text>
            <View style={styles.actionsWrap}>
              {moreActions.map((entry) => (
                <Pressable
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${entry.label} for ${session}`}
                  style={({ pressed }) => [
                    styles.actionButton,
                    entry.disabled ? styles.buttonDisabled : null,
                    pressed ? styles.pressablePressed : null,
                  ]}
                  onPress={() => {
                    if (entry.disabled) {
                      return;
                    }
                    fireSelectionHaptic();
                    setShowMoreActions(false);
                    entry.onPress();
                  }}
                  disabled={entry.disabled}
                >
                  <Text style={styles.actionButtonText}>{entry.label}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close session actions"
                style={({ pressed }) => [styles.buttonGhost, pressed ? styles.pressablePressed : null]}
                onPress={() => {
                  fireSelectionHaptic();
                  setShowMoreActions(false);
                }}
              >
                <Text style={styles.buttonGhostText}>Close</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
