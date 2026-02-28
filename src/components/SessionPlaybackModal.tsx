import React, { useRef } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, Text, View } from "react-native";

import { styles } from "../theme/styles";
import { AnsiText } from "./AnsiText";

type SessionPlaybackModalProps = {
  visible: boolean;
  session: string | null;
  output: string;
  positionLabel: string;
  speed: number;
  isPlaying: boolean;
  onClose: () => void;
  onPlayPause: () => void;
  onRestart: () => void;
  onBack: () => void;
  onForward: () => void;
  onSetSpeed: (speed: number) => void;
  onExport: () => void;
};

const SPEED_OPTIONS = [0.5, 1, 2, 4];

export function SessionPlaybackModal({
  visible,
  session,
  output,
  positionLabel,
  speed,
  isPlaying,
  onClose,
  onPlayPause,
  onRestart,
  onBack,
  onForward,
  onSetSpeed,
  onExport,
}: SessionPlaybackModalProps) {
  const terminalRef = useRef<ScrollView | null>(null);

  return (
    <Modal animationType="slide" transparent={false} visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{session ? `Playback · ${session}` : "Playback"}</Text>
          <Text style={styles.serverSubtitle}>{positionLabel}</Text>
          <View style={styles.actionsWrap}>
            <Pressable style={styles.actionButton} onPress={onPlayPause}>
              <Text style={styles.actionButtonText}>{isPlaying ? "Pause" : "Play"}</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={onRestart}>
              <Text style={styles.actionButtonText}>Restart</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={onBack}>
              <Text style={styles.actionButtonText}>-2s</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={onForward}>
              <Text style={styles.actionButtonText}>+2s</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={onExport}>
              <Text style={styles.actionButtonText}>Export Cast</Text>
            </Pressable>
            <Pressable style={styles.actionButton} onPress={onClose}>
              <Text style={styles.actionButtonText}>Close</Text>
            </Pressable>
          </View>
          <View style={styles.actionsWrap}>
            {SPEED_OPTIONS.map((entry) => (
              <Pressable key={entry} style={[styles.chip, speed === entry ? styles.chipActive : null]} onPress={() => onSetSpeed(entry)}>
                <Text style={[styles.chipText, speed === entry ? styles.chipTextActive : null]}>{`${entry}x`}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <ScrollView
          style={styles.modalTerminalView}
          ref={terminalRef}
          onContentSizeChange={() => {
            terminalRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <AnsiText text={output || "No recording output at this position."} style={styles.terminalText} />
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
