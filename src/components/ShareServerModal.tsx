import React from "react";
import { Modal, Pressable, SafeAreaView, Share, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { styles } from "../theme/styles";

type ShareServerModalProps = {
  visible: boolean;
  value: string;
  title: string;
  heading?: string;
  description?: string;
  shareButtonLabel?: string;
  onClose: () => void;
};

export function ShareServerModal({
  visible,
  value,
  title,
  heading = "Share Server Config",
  description = "Token is intentionally excluded. The recipient enters their own token after import.",
  shareButtonLabel = "Share Link",
  onClose,
}: ShareServerModalProps) {
  const safeValue = value.trim();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          <Text style={styles.panelLabel}>{heading}</Text>
          <Text style={styles.serverTitle}>{title}</Text>
          <Text style={styles.serverSubtitle}>{description}</Text>

          {safeValue ? (
            <View style={styles.qrWrap}>
              <QRCode value={safeValue} size={190} color="#f6edff" backgroundColor="#090414" />
            </View>
          ) : (
            <Text style={styles.emptyText}>Unable to generate QR until a valid share link is available.</Text>
          )}

          <Pressable accessibilityRole="button"
            accessibilityLabel="Share link"
            accessibilityHint="Opens the system share sheet for this link."
            style={[styles.buttonGhost, !safeValue ? styles.buttonDisabled : null]}
            disabled={!safeValue}
            onPress={() => {
              void Share.share({ message: safeValue });
            }}
          >
            <Text style={styles.buttonGhostText}>{shareButtonLabel}</Text>
          </Pressable>

          <Pressable accessibilityRole="button" accessibilityLabel="Close share modal" style={styles.buttonPrimary} onPress={onClose}>
            <Text style={styles.buttonPrimaryText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
