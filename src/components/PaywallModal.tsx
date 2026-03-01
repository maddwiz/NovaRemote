import React from "react";
import { Modal, Pressable, SafeAreaView, Text, View } from "react-native";

import { styles } from "../theme/styles";

type PaywallModalProps = {
  visible: boolean;
  priceLabel: string | null;
  onClose: () => void;
  onUpgrade: () => void;
  onRestore: () => void;
};

export function PaywallModal({ visible, priceLabel, onClose, onUpgrade, onRestore }: PaywallModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          <Text style={styles.title}>NovaRemote Pro</Text>
          <Text style={styles.serverSubtitle}>
            Unlock AI command assist, fleet execution, watch alerts, glasses mode voice control, file editor, process manager,
            session recordings, offline queue, spectator links, iPad split view, and unlimited servers/sessions.
          </Text>
          <Text style={styles.serverTitle}>{priceLabel ? `Pro ${priceLabel}` : "Pro subscription"}</Text>

          <View style={styles.rowInlineSpace}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upgrade to NovaRemote Pro"
              accessibilityHint="Starts the in-app purchase flow."
              style={[styles.buttonPrimary, styles.flexButton]}
              onPress={onUpgrade}
            >
              <Text style={styles.buttonPrimaryText}>Upgrade</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore Pro purchases"
              style={[styles.buttonGhost, styles.flexButton]}
              onPress={onRestore}
            >
              <Text style={styles.buttonGhostText}>Restore</Text>
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" accessibilityLabel="Close paywall" style={styles.buttonGhost} onPress={onClose}>
            <Text style={styles.buttonGhostText}>Maybe Later</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
