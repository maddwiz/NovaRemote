import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { styles } from "../../theme/styles";

type TerminalCardFooterProps = {
  recordingChunks: number;
  recordingDurationMs: number;
  historyCount: number;
  sessionAlias: string;
  tags: string[];
  isSending: boolean;
  readOnly: boolean;
  onDeleteRecording: () => void;
  onHistoryPrev: () => void;
  onHistoryNext: () => void;
  onSessionAliasChange: (value: string) => void;
  onTagsChange: (raw: string) => void;
  onSend: () => void;
  onClear: () => void;
};

export function TerminalCardFooter({
  recordingChunks,
  recordingDurationMs,
  historyCount,
  sessionAlias,
  tags,
  isSending,
  readOnly,
  onDeleteRecording,
  onHistoryPrev,
  onHistoryNext,
  onSessionAliasChange,
  onTagsChange,
  onSend,
  onClear,
}: TerminalCardFooterProps) {
  return (
    <>
      {recordingChunks > 0 ? (
        <View style={styles.rowInlineSpace}>
          <Text style={styles.emptyText}>{`${recordingChunks} rec chunks · ${(recordingDurationMs / 1000).toFixed(1)}s`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Delete current recording" style={styles.actionDangerButton} onPress={onDeleteRecording}>
            <Text style={styles.actionDangerText}>Delete Rec</Text>
          </Pressable>
        </View>
      ) : null}

      <View style={styles.rowInlineSpace}>
        <Pressable accessibilityRole="button" accessibilityLabel="Previous command history" style={styles.actionButton} onPress={onHistoryPrev}>
          <Text style={styles.actionButtonText}>↑</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next command history" style={styles.actionButton} onPress={onHistoryNext}>
          <Text style={styles.actionButtonText}>↓</Text>
        </Pressable>
        <Text style={styles.emptyText}>{`History ${historyCount}`}</Text>
      </View>

      <TextInput
        style={styles.input}
        value={sessionAlias}
        onChangeText={onSessionAliasChange}
        placeholder="Session label (optional)"
        placeholderTextColor="#7f7aa8"
        autoCorrect={false}
      />

      <TextInput
        style={styles.input}
        value={tags.join(", ")}
        onChangeText={onTagsChange}
        placeholder="Tags (comma separated)"
        placeholderTextColor="#7f7aa8"
        autoCapitalize="none"
        autoCorrect={false}
      />

      <View style={styles.rowInlineSpace}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSending ? "Sending command" : readOnly ? "Session is read only" : "Send draft command"}
          style={[styles.buttonPrimary, styles.flexButton, isSending || readOnly ? styles.buttonDisabled : null]}
          disabled={isSending || readOnly}
          onPress={onSend}
        >
          <Text style={styles.buttonPrimaryText}>{isSending ? "Sending..." : readOnly ? "Read-Only" : "Send"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear draft input" style={[styles.buttonGhost, styles.flexButton]} onPress={onClear}>
          <Text style={styles.buttonGhostText}>Clear</Text>
        </Pressable>
      </View>
      <Text style={styles.emptyText}>Shortcuts: Cmd/Ctrl+Enter send, Ctrl+C stop, Cmd+K clear, Cmd+W hide, Cmd+F fullscreen.</Text>
    </>
  );
}
