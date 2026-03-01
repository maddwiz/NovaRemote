import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { styles } from "../theme/styles";

type LockScreenProps = {
  onUnlock: () => void;
};

export function LockScreen({ onUnlock }: LockScreenProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centeredWrap}>
        <View style={styles.panel}>
          <Text style={styles.title}>NovaRemote Locked</Text>
          <Text style={styles.serverSubtitle}>Use Face ID / Touch ID to unlock server credentials and sessions.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Unlock NovaRemote"
            accessibilityHint="Requests Face ID or Touch ID authentication."
            style={styles.buttonPrimary}
            onPress={onUnlock}
          >
            <Text style={styles.buttonPrimaryText}>Unlock</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
