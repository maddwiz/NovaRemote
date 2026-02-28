import React, { useEffect, useMemo, useState } from "react";
import { Modal, Pressable, SafeAreaView, Text, TextInput, View } from "react-native";

import { styles } from "../theme/styles";
import { ProcessSignal } from "../types";

type ProcessKillConfirmModalProps = {
  visible: boolean;
  pids: number[];
  signal: ProcessSignal;
  onCancel: () => void;
  onConfirm: () => void;
};

function confirmationPhrase(signal: ProcessSignal): string {
  if (signal === "KILL") {
    return "KILL";
  }
  if (signal === "INT") {
    return "INT";
  }
  return "TERM";
}

function safetyMessage(signal: ProcessSignal): string {
  if (signal === "KILL") {
    return "Force kill is immediate and does not allow cleanup.";
  }
  if (signal === "INT") {
    return "Interrupt requests a graceful stop (similar to Ctrl-C).";
  }
  return "Terminate asks the process to stop gracefully.";
}

export function ProcessKillConfirmModal({ visible, pids, signal, onCancel, onConfirm }: ProcessKillConfirmModalProps) {
  const [typed, setTyped] = useState<string>("");
  const phrase = useMemo(() => confirmationPhrase(signal), [signal]);
  const canConfirm = typed.trim().toUpperCase() === phrase;

  useEffect(() => {
    if (!visible) {
      setTyped("");
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <SafeAreaView style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          <Text style={styles.panelLabel}>Confirm Process Signal</Text>
          <Text style={styles.serverTitle}>{`${signal} -> ${pids.length} process${pids.length === 1 ? "" : "es"}`}</Text>
          <Text style={styles.serverSubtitle}>{safetyMessage(signal)}</Text>
          <Text style={styles.emptyText}>PIDs: {pids.join(", ")}</Text>
          <Text style={styles.emptyText}>{`Type ${phrase} to confirm`}</Text>
          <TextInput
            style={styles.input}
            value={typed}
            onChangeText={setTyped}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder={phrase}
            placeholderTextColor="#7f7aa8"
          />
          <View style={styles.rowInlineSpace}>
            <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onCancel}>
              <Text style={styles.buttonGhostText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={[styles.actionDangerButton, styles.flexButton, !canConfirm ? styles.buttonDisabled : null]}
              disabled={!canConfirm}
              onPress={onConfirm}
            >
              <Text style={styles.actionDangerText}>Send Signal</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
