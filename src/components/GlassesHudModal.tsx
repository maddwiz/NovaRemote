import React, { useMemo, useRef } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { styles } from "../theme/styles";
import { GlassesBrand } from "../types";
import { AnsiText } from "./AnsiText";

type GlassesHudModalProps = {
  visible: boolean;
  brand: GlassesBrand;
  session: string | null;
  sessionLabel: string;
  sessions: Array<{ id: string; label: string }>;
  textScale: number;
  output: string;
  draft: string;
  isSending: boolean;
  voiceRecording: boolean;
  voiceBusy: boolean;
  voiceTranscript: string;
  voiceError: string | null;
  onClose: () => void;
  onSelectSession: (session: string) => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClearDraft: () => void;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  onVoiceSendTranscript: () => void;
};

function brandTitle(brand: GlassesBrand): string {
  if (brand === "xreal_x1") {
    return "XREAL X1 HUD";
  }
  if (brand === "halo") {
    return "Halo HUD";
  }
  return "Glasses HUD";
}

function brandAccent(brand: GlassesBrand): string {
  if (brand === "xreal_x1") {
    return "#27d9ff";
  }
  if (brand === "halo") {
    return "#ffd36b";
  }
  return "#87ffa4";
}

export function GlassesHudModal({
  visible,
  brand,
  session,
  sessionLabel,
  sessions,
  textScale,
  output,
  draft,
  isSending,
  voiceRecording,
  voiceBusy,
  voiceTranscript,
  voiceError,
  onClose,
  onSelectSession,
  onDraftChange,
  onSend,
  onClearDraft,
  onVoiceStart,
  onVoiceStop,
  onVoiceSendTranscript,
}: GlassesHudModalProps) {
  const terminalRef = useRef<ScrollView | null>(null);
  const accent = useMemo(() => brandAccent(brand), [brand]);
  const dynamicText = useMemo(
    () => ({
      fontSize: Math.max(13, Math.round(14 * textScale)),
      lineHeight: Math.max(18, Math.round(20 * textScale)),
      color: "#d9f4ff",
    }),
    [textScale]
  );

  const transcriptReady = voiceTranscript.trim().length > 0;

  return (
    <Modal visible={visible} animationType="fade" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.glassesHudSafeArea}>
        <View style={[styles.glassesHudHeader, { borderColor: accent }]}> 
          <View style={styles.rowInlineSpace}>
            <Text style={[styles.glassesHudTitle, { color: accent }]}>{brandTitle(brand)}</Text>
            <Pressable accessibilityRole="button" style={[styles.actionButton, { borderColor: accent }]} onPress={onClose}>
              <Text style={styles.actionButtonText}>Exit HUD</Text>
            </Pressable>
          </View>
          <Text style={styles.emptyText}>{`Session: ${sessionLabel}`}</Text>
          {sessions.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {sessions.map((entry) => (
                <Pressable
                  accessibilityRole="button"
                  key={`hud-session-${entry.id}`}
                  style={[styles.chip, session === entry.id ? styles.chipActive : null]}
                  onPress={() => onSelectSession(entry.id)}
                >
                  <Text style={[styles.chipText, session === entry.id ? styles.chipTextActive : null]}>{entry.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>No open sessions.</Text>
          )}
        </View>

        <ScrollView
          ref={terminalRef}
          style={[styles.glassesHudTerminal, { borderColor: accent }]}
          onContentSizeChange={() => terminalRef.current?.scrollToEnd({ animated: true })}
        >
          <AnsiText text={output || "Waiting for terminal output..."} style={[styles.terminalText, dynamicText]} />
        </ScrollView>

        <View style={styles.glassesHudFooter}>
          <Text style={styles.glassesHudStatus}>
            {voiceRecording ? "Listening..." : voiceBusy ? "Transcribing..." : "Voice idle"}
          </Text>
          {voiceError ? <Text style={styles.emptyText}>{`Voice error: ${voiceError}`}</Text> : null}
          {transcriptReady ? <Text style={styles.serverSubtitle}>{`Transcript: ${voiceTranscript}`}</Text> : null}

          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={onDraftChange}
            placeholder="Quick prompt or command"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />

          <View style={styles.actionsWrap}>
            <Pressable
              accessibilityRole="button"
              style={[styles.actionButton, (voiceRecording || voiceBusy || !session) ? styles.buttonDisabled : null]}
              disabled={voiceRecording || voiceBusy || !session}
              onPress={onVoiceStart}
            >
              <Text style={styles.actionButtonText}>Start Voice</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.actionButton, (!voiceRecording || voiceBusy || !session) ? styles.buttonDisabled : null]}
              disabled={!voiceRecording || voiceBusy || !session}
              onPress={onVoiceStop}
            >
              <Text style={styles.actionButtonText}>Stop + Transcribe</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.actionButton, (!transcriptReady || voiceBusy || !session) ? styles.buttonDisabled : null]}
              disabled={!transcriptReady || voiceBusy || !session}
              onPress={onVoiceSendTranscript}
            >
              <Text style={styles.actionButtonText}>Send Transcript</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              style={[styles.buttonPrimary, (!session || isSending) ? styles.buttonDisabled : null]}
              disabled={!session || isSending}
              onPress={onSend}
            >
              <Text style={styles.buttonPrimaryText}>{isSending ? "Sending..." : "Send"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" style={styles.buttonGhost} onPress={onClearDraft}>
              <Text style={styles.buttonGhostText}>Clear</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
