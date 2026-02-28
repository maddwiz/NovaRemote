import React, { useRef } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, View } from "react-native";

import { styles } from "../theme/styles";
import { TerminalSendMode } from "../types";
import { AnsiText } from "./AnsiText";

type FullscreenTerminalProps = {
  session: string | null;
  output: string;
  draft: string;
  mode: TerminalSendMode;
  isSending: boolean;
  onClose: () => void;
  onToggleMode: () => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export function FullscreenTerminal({
  session,
  output,
  draft,
  mode,
  isSending,
  onClose,
  onToggleMode,
  onDraftChange,
  onSend,
  onStop,
}: FullscreenTerminalProps) {
  const terminalRef = useRef<ScrollView | null>(null);

  return (
    <Modal animationType="slide" transparent={false} visible={Boolean(session)} onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{session || "Terminal"}</Text>
          <View style={styles.rowInlineSpace}>
            {session ? (
              <Pressable style={styles.actionButton} onPress={onToggleMode}>
                <Text style={styles.actionButtonText}>{mode === "ai" ? "Switch to Shell" : "Switch to AI"}</Text>
              </Pressable>
            ) : null}
            <Pressable style={styles.actionButton} onPress={onClose}>
              <Text style={styles.actionButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={styles.modalTerminalView}
          ref={terminalRef}
          onContentSizeChange={() => {
            terminalRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <AnsiText text={output || "Waiting for output..."} style={styles.terminalText} />
        </ScrollView>

        {session ? (
          <>
            <TextInput
              style={[styles.input, styles.modalInput]}
              value={draft}
              multiline
              editable={!isSending}
              placeholder={mode === "ai" ? "Message AI..." : "Run shell command..."}
              placeholderTextColor="#7f7aa8"
              onChangeText={onDraftChange}
            />

            <View style={styles.rowInlineSpace}>
              <Pressable
                style={[styles.buttonPrimary, styles.flexButton, isSending ? styles.buttonDisabled : null]}
                disabled={isSending}
                onPress={onSend}
              >
                <Text style={styles.buttonPrimaryText}>{isSending ? "Sending..." : "Send"}</Text>
              </Pressable>
              <Pressable style={[styles.actionDangerButton, styles.flexButton]} onPress={onStop}>
                <Text style={styles.actionDangerText}>Ctrl-C</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
