import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { styles } from "../../theme/styles";

type TerminalCardWatchProps = {
  session: string;
  watchEnabled: boolean;
  watchPattern: string;
  watchAlerts: string[];
  onToggleWatch: (value: boolean) => void;
  onWatchPatternChange: (value: string) => void;
  onClearWatchAlerts: () => void;
};

export function TerminalCardWatch({
  session,
  watchEnabled,
  watchPattern,
  watchAlerts,
  onToggleWatch,
  onWatchPatternChange,
  onClearWatchAlerts,
}: TerminalCardWatchProps) {
  return (
    <>
      <View style={styles.rowInlineSpace}>
        <Text style={styles.switchLabel}>Watch Mode</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={watchEnabled ? `Disable watch mode for ${session}` : `Enable watch mode for ${session}`} style={[styles.actionButton, watchEnabled ? styles.modeButtonOn : null]} onPress={() => onToggleWatch(!watchEnabled)}>
          <Text style={styles.actionButtonText}>{watchEnabled ? "Enabled" : "Disabled"}</Text>
        </Pressable>
      </View>
      {watchEnabled ? (
        <TextInput
          style={styles.input}
          value={watchPattern}
          onChangeText={onWatchPatternChange}
          placeholder="Regex alert pattern (e.g. ERROR|FAILED)"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
        />
      ) : null}

      {watchAlerts.length > 0 ? (
        <View style={styles.serverCard}>
          <View style={styles.rowInlineSpace}>
            <Text style={styles.panelLabel}>Watch Alerts</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Clear watch alerts for ${session}`} style={styles.actionButton} onPress={onClearWatchAlerts}>
              <Text style={styles.actionButtonText}>Clear Alerts</Text>
            </Pressable>
          </View>
          {watchAlerts.slice(0, 4).map((alert, index) => (
            <Text key={`${session}-watch-${index}`} style={styles.serverSubtitle}>
              {alert}
            </Text>
          ))}
          {watchAlerts.length > 4 ? <Text style={styles.emptyText}>{`+${watchAlerts.length - 4} more alerts`}</Text> : null}
        </View>
      ) : null}
    </>
  );
}
