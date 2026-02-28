import React from "react";
import { Modal, Pressable, SafeAreaView, Text, View } from "react-native";

import { styles } from "../theme/styles";

type DangerConfirmModalProps = {
  visible: boolean;
  command: string;
  context: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DangerConfirmModal({ visible, command, context, onCancel, onConfirm }: DangerConfirmModalProps) {
  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <SafeAreaView style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          <Text style={styles.panelLabel}>Dangerous Command Check</Text>
          <Text style={styles.serverTitle}>{context}</Text>
          <Text style={styles.serverSubtitle}>This shell command looks destructive. Confirm to continue.</Text>
          <View style={styles.terminalCard}>
            <Text style={styles.terminalText}>{command}</Text>
          </View>

          <View style={styles.rowInlineSpace}>
            <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onCancel}>
              <Text style={styles.buttonGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.actionDangerButton, styles.flexButton]} onPress={onConfirm}>
              <Text style={styles.actionDangerText}>Run Anyway</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
