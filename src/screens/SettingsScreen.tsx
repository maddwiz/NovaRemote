import React from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { PageHeroCard } from "../components/PageHeroCard";
import {
  MAX_NOVA_CONVERSATION_IDLE_MS,
  MIN_NOVA_CONVERSATION_IDLE_MS,
} from "../novaVoice";
import { styles } from "../theme/styles";

type SettingsScreenProps = {
  alwaysListeningEnabled: boolean;
  handsFreeEnabled: boolean;
  speakRepliesEnabled: boolean;
  wakePhrase: string;
  conversationIdleMs: number;
  speechOutputAvailable: boolean;
  onSetAlwaysListeningEnabled: (value: boolean) => void;
  onSetHandsFreeEnabled: (value: boolean) => void;
  onSetSpeakRepliesEnabled: (value: boolean) => void;
  onSetWakePhrase: (value: string) => void;
  onSetConversationIdleMs: (value: number) => void;
};

export function SettingsScreen({
  alwaysListeningEnabled,
  handsFreeEnabled,
  speakRepliesEnabled,
  wakePhrase,
  conversationIdleMs,
  speechOutputAvailable,
  onSetAlwaysListeningEnabled,
  onSetHandsFreeEnabled,
  onSetSpeakRepliesEnabled,
  onSetWakePhrase,
  onSetConversationIdleMs,
}: SettingsScreenProps) {
  const timeoutSeconds = Math.round(conversationIdleMs / 1000);

  return (
    <View style={styles.serverListWrap}>
      <PageHeroCard
        eyebrow="Nova Settings"
        title="Shape voice control and reply behavior."
        summary="Tune wake phrase, conversation timeout, hands-free mode, and spoken replies."
        tone="violet"
        stats={[
          { label: "Wake", value: wakePhrase || "hey nova" },
          { label: "Idle", value: `${timeoutSeconds}s` },
          { label: "Standby", value: alwaysListeningEnabled ? "On" : "Off" },
        ]}
      />

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Activation</Text>
        <Text style={styles.serverSubtitle}>Hold the Nova orb, tap Voice in chat, say the wake phrase, or keep Hands-Free on.</Text>

        <View style={styles.settingsModeList}>
          <View style={styles.settingsModeCard}>
            <Text style={styles.settingsModeTitle}>Walkie</Text>
            <Text style={styles.settingsModeCopy}>Hold the Nova orb, speak, and release to send instantly.</Text>
          </View>
          <View style={styles.settingsModeCard}>
            <Text style={styles.settingsModeTitle}>Voice Button</Text>
            <Text style={styles.settingsModeCopy}>Tap Voice in chat to keep a natural back-and-forth session open.</Text>
          </View>
          <View style={styles.settingsModeCard}>
            <Text style={styles.settingsModeTitle}>Wake Phrase</Text>
            <Text style={styles.settingsModeCopy}>Say the wake phrase to open a back-and-forth session even when Hands-Free is off.</Text>
          </View>
          <View style={styles.settingsModeCard}>
            <Text style={styles.settingsModeTitle}>Hands-Free</Text>
            <Text style={styles.settingsModeCopy}>Keeps Nova in always-on conversation mode while the app is open.</Text>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Wake Phrase</Text>
        <Text style={styles.serverSubtitle}>Use a short wake phrase. Default is “hey nova”.</Text>
        <TextInput
          accessibilityLabel="Nova wake phrase"
          value={wakePhrase}
          onChangeText={onSetWakePhrase}
          placeholder="hey nova"
          placeholderTextColor="#6075a5"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.pageMenuStepperRow}>
          <Text style={styles.pageMenuSwitchLabel}>{`Conversation timeout: ${timeoutSeconds}s`}</Text>
          <View style={styles.pageMenuStepperButtons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease Nova conversation timeout"
              style={styles.pageMenuStepperButton}
              onPress={() => onSetConversationIdleMs(Math.max(MIN_NOVA_CONVERSATION_IDLE_MS, conversationIdleMs - 5000))}
            >
              <Text style={styles.pageMenuStepperText}>-</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase Nova conversation timeout"
              style={styles.pageMenuStepperButton}
              onPress={() => onSetConversationIdleMs(Math.min(MAX_NOVA_CONVERSATION_IDLE_MS, conversationIdleMs + 5000))}
            >
              <Text style={styles.pageMenuStepperText}>+</Text>
            </Pressable>
          </View>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Voice Behavior</Text>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Always listen for wake phrase</Text>
          <Switch
            value={alwaysListeningEnabled}
            onValueChange={onSetAlwaysListeningEnabled}
            trackColor={{ false: "#4d5272", true: "#1586b3" }}
            thumbColor={alwaysListeningEnabled ? "#ccf6ff" : "#d7def2"}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Hands-Free always-on mode</Text>
          <Switch
            value={handsFreeEnabled}
            onValueChange={onSetHandsFreeEnabled}
            trackColor={{ false: "#4d5272", true: "#1586b3" }}
            thumbColor={handsFreeEnabled ? "#ccf6ff" : "#d7def2"}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Speak Nova replies</Text>
          <Switch
            value={speakRepliesEnabled}
            onValueChange={onSetSpeakRepliesEnabled}
            disabled={!speechOutputAvailable}
            trackColor={{ false: "#4d5272", true: "#1586b3" }}
            thumbColor={speakRepliesEnabled ? "#ccf6ff" : "#d7def2"}
          />
        </View>
        <Text style={styles.serverSubtitle}>
          {speechOutputAvailable
            ? "Reply voice is available in this build."
            : "Reply voice needs an iOS rebuild that includes ExpoSpeech."}
        </Text>
        <Text style={styles.serverSubtitle}>
          {alwaysListeningEnabled
            ? `Wake phrase standby is on. Say "${wakePhrase || "hey nova"}" to start a conversation.`
            : "Wake phrase standby is off. Use walkie mode or the Voice button to talk to Nova."}
        </Text>
      </View>
    </View>
  );
}
