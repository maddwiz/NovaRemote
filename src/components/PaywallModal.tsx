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
          <Text style={styles.serverSubtitle}>Unlock unlimited servers, sessions, snippets, push alerts, and iPad split view.</Text>
          <Text style={styles.serverTitle}>{priceLabel ? `Pro ${priceLabel}` : "Pro subscription"}</Text>

          <View style={styles.rowInlineSpace}>
            <Pressable accessibilityRole="button" style={[styles.buttonPrimary, styles.flexButton]} onPress={onUpgrade}>
              <Text style={styles.buttonPrimaryText}>Upgrade</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={[styles.buttonGhost, styles.flexButton]} onPress={onRestore}>
              <Text style={styles.buttonGhostText}>Restore</Text>
            </Pressable>
          </View>

          <Pressable accessibilityRole="button" style={styles.buttonGhost} onPress={onClose}>
            <Text style={styles.buttonGhostText}>Maybe Later</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
