import React from "react";
import * as Haptics from "expo-haptics";
import { Switch, Text, TextInput, View } from "react-native";
import { FeedbackPressable as Pressable } from "../components/FeedbackPressable";

import { PageHeroCard } from "../components/PageHeroCard";
import {
  MAX_NOVA_CONVERSATION_IDLE_MS,
  MIN_NOVA_CONVERSATION_IDLE_MS,
} from "../novaVoice";
import { styles } from "../theme/styles";

type SettingsScreenProps = {
  isPro: boolean;
  alwaysListeningEnabled: boolean;
  handsFreeEnabled: boolean;
  speakRepliesEnabled: boolean;
  wakePhrase: string;
  conversationIdleMs: number;
  speechOutputAvailable: boolean;
  selectedSpeechVoiceLabel: string;
  speechVoiceChoicesAvailable: boolean;
  onTestSpeakReplies: () => void;
  onShowPaywall: () => void;
  onSetAlwaysListeningEnabled: (value: boolean) => void;
  onSetHandsFreeEnabled: (value: boolean) => void;
  onSetSpeakRepliesEnabled: (value: boolean) => void;
  onSetWakePhrase: (value: string) => void;
  onSetConversationIdleMs: (value: number) => void;
  onCycleSpeechVoice: (direction: -1 | 1) => void;
};

export function SettingsScreen({
  isPro,
  alwaysListeningEnabled,
  handsFreeEnabled,
  speakRepliesEnabled,
  wakePhrase,
  conversationIdleMs,
  speechOutputAvailable,
  selectedSpeechVoiceLabel,
  speechVoiceChoicesAvailable,
  onTestSpeakReplies,
  onShowPaywall,
  onSetAlwaysListeningEnabled,
  onSetHandsFreeEnabled,
  onSetSpeakRepliesEnabled,
  onSetWakePhrase,
  onSetConversationIdleMs,
  onCycleSpeechVoice,
}: SettingsScreenProps) {
  const timeoutSeconds = Math.round(conversationIdleMs / 1000);

  const fireSelectionHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
  };

  const fireMediumHaptic = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
  };

  return (
    <View style={styles.serverListWrap}>
      <PageHeroCard
        eyebrow="Nova Settings"
        title="Shape voice control and reply behavior."
        summary="Tune wake phrase, silence timing, hands-free mode, and spoken replies."
        tone="violet"
        stats={[
          { label: "Wake", value: wakePhrase || "hey nova" },
          { label: "Silence", value: `${timeoutSeconds}s` },
          { label: "Standby", value: alwaysListeningEnabled ? "On" : "Off" },
        ]}
      />

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Activation</Text>
        <Text style={styles.serverSubtitle}>
          Hold the Nova orb, tap Voice in chat, turn on wake phrase standby, or keep Hands-Free on.
        </Text>

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
            <Text style={styles.settingsModeCopy}>
              Say the wake phrase to open a back-and-forth session while wake phrase standby is on.
            </Text>
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
          <Text style={styles.pageMenuSwitchLabel}>{`Silence before Nova responds: ${timeoutSeconds}s`}</Text>
          <View style={styles.pageMenuStepperButtons}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease Nova silence timeout"
              style={({ pressed }) => [styles.pageMenuStepperButton, pressed ? styles.pressablePressed : null]}
              onPress={() => {
                fireSelectionHaptic();
                onSetConversationIdleMs(Math.max(MIN_NOVA_CONVERSATION_IDLE_MS, conversationIdleMs - 1000));
              }}
            >
              <Text style={styles.pageMenuStepperText}>-</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase Nova silence timeout"
              style={({ pressed }) => [styles.pageMenuStepperButton, pressed ? styles.pressablePressed : null]}
              onPress={() => {
                fireSelectionHaptic();
                onSetConversationIdleMs(Math.min(MAX_NOVA_CONVERSATION_IDLE_MS, conversationIdleMs + 1000));
              }}
            >
              <Text style={styles.pageMenuStepperText}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.serverSubtitle}>
          Nova will keep listening until you stop talking for this long before sending the reply.
        </Text>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Voice Behavior</Text>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Wake phrase standby</Text>
          <Switch
            value={alwaysListeningEnabled}
            onValueChange={(value) => {
              fireSelectionHaptic();
              onSetAlwaysListeningEnabled(value);
            }}
            trackColor={{ false: "#4d5272", true: "#1586b3" }}
            thumbColor={alwaysListeningEnabled ? "#ccf6ff" : "#d7def2"}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Hands-Free always-on mode</Text>
          <Switch
            value={handsFreeEnabled}
            onValueChange={(value) => {
              fireSelectionHaptic();
              onSetHandsFreeEnabled(value);
            }}
            trackColor={{ false: "#4d5272", true: "#1586b3" }}
            thumbColor={handsFreeEnabled ? "#ccf6ff" : "#d7def2"}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Speak Nova replies</Text>
          <Switch
            value={speakRepliesEnabled}
            onValueChange={(value) => {
              fireSelectionHaptic();
              onSetSpeakRepliesEnabled(value);
            }}
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
            ? `Wake phrase standby is on. Say "${wakePhrase || "hey nova"}" while NovaRemote is open to start a conversation.`
            : `Wake phrase standby is off. Turn it on if you want "${wakePhrase || "hey nova"}" to work without using Hands-Free.`}
        </Text>
        {speechOutputAvailable ? (
          <>
            <View style={styles.pageMenuStepperRow}>
              <Text style={styles.pageMenuSwitchLabel}>{`Nova voice: ${selectedSpeechVoiceLabel}`}</Text>
              <View style={styles.pageMenuStepperButtons}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isPro ? "Select previous Nova voice" : "Unlock Pro to change Nova voice"}
                  style={({ pressed }) => [
                    styles.pageMenuStepperButton,
                    (!speechVoiceChoicesAvailable || !isPro) ? styles.buttonDisabled : null,
                    pressed ? styles.pressablePressed : null,
                  ]}
                  onPress={() => {
                    fireSelectionHaptic();
                    if (!isPro) {
                      onShowPaywall();
                      return;
                    }
                    onCycleSpeechVoice(-1);
                  }}
                >
                  <Text style={styles.pageMenuStepperText}>-</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={isPro ? "Select next Nova voice" : "Unlock Pro to change Nova voice"}
                  style={({ pressed }) => [
                    styles.pageMenuStepperButton,
                    (!speechVoiceChoicesAvailable || !isPro) ? styles.buttonDisabled : null,
                    pressed ? styles.pressablePressed : null,
                  ]}
                  onPress={() => {
                    fireSelectionHaptic();
                    if (!isPro) {
                      onShowPaywall();
                      return;
                    }
                    onCycleSpeechVoice(1);
                  }}
                >
                  <Text style={styles.pageMenuStepperText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Text style={styles.serverSubtitle}>
              {isPro
                ? "Choose the voice that fits Nova best."
                : "Voice selection is part of Pro. Nova will still use the best installed Apple female voice it can find."}
            </Text>
            <Text style={styles.serverSubtitle}>
              Best free quality comes from Apple Premium or Enhanced voices already installed on this iPhone.
            </Text>
            {!isPro ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Unlock Pro voice options"
                style={({ pressed }) => [styles.pageMenuActionButton, pressed ? styles.pressablePressed : null]}
                onPress={() => {
                  fireMediumHaptic();
                  onShowPaywall();
                }}
              >
                <Text style={styles.pageMenuActionText}>Unlock Pro Voices</Text>
              </Pressable>
            ) : null}
          </>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Test Nova voice output"
          style={({ pressed }) => [
            styles.pageMenuActionButton,
            !speechOutputAvailable ? styles.buttonDisabled : null,
            pressed ? styles.pressablePressed : null,
          ]}
          disabled={!speechOutputAvailable}
          onPress={() => {
            fireMediumHaptic();
            onTestSpeakReplies();
          }}
        >
          <Text style={styles.pageMenuActionText}>Test Nova Voice</Text>
        </Pressable>
      </View>
    </View>
  );
}
