import React from "react";
import { Modal, Pressable, SafeAreaView, Share, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { styles } from "../theme/styles";

type ShareServerModalProps = {
  visible: boolean;
  value: string;
  title: string;
  onClose: () => void;
};

export function ShareServerModal({ visible, value, title, onClose }: ShareServerModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          <Text style={styles.panelLabel}>Share Server Config</Text>
          <Text style={styles.serverTitle}>{title}</Text>
          <Text style={styles.serverSubtitle}>Token is intentionally excluded. The recipient enters their own token after import.</Text>

          <View style={styles.qrWrap}>
            <QRCode value={value} size={190} color="#f6edff" backgroundColor="#090414" />
          </View>

          <Pressable
            style={styles.buttonGhost}
            onPress={() => {
              void Share.share({ message: value });
            }}
          >
            <Text style={styles.buttonGhostText}>Share Link</Text>
          </Pressable>

          <Pressable style={styles.buttonPrimary} onPress={onClose}>
            <Text style={styles.buttonPrimaryText}>Done</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
