import React, { useRef } from "react";
import { Modal, Pressable, SafeAreaView, ScrollView, StyleProp, Text, TextInput, TextStyle, View, ViewStyle } from "react-native";

import { styles } from "../theme/styles";
import { TerminalSendMode } from "../types";
import { AnsiText } from "./AnsiText";

type FullscreenTerminalProps = {
  session: string | null;
  output: string;
  draft: string;
  mode: TerminalSendMode;
  isSending: boolean;
  searchTerm: string;
  searchMatchesLabel: string;
  activeMatchIndex: number;
  terminalViewStyle?: StyleProp<ViewStyle>;
  terminalTextStyle?: StyleProp<TextStyle>;
  onClose: () => void;
  onToggleMode: () => void;
  onSearchChange: (value: string) => void;
  onSearchPrev: () => void;
  onSearchNext: () => void;
  onHistoryPrev: () => void;
  onHistoryNext: () => void;
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
  searchTerm,
  searchMatchesLabel,
  activeMatchIndex,
  terminalViewStyle,
  terminalTextStyle,
  onClose,
  onToggleMode,
  onSearchChange,
  onSearchPrev,
  onSearchNext,
  onHistoryPrev,
  onHistoryNext,
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
          style={[styles.modalTerminalView, terminalViewStyle]}
          ref={terminalRef}
          onContentSizeChange={() => {
            terminalRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <AnsiText
            text={output || "Waiting for output..."}
            style={[styles.terminalText, terminalTextStyle]}
            searchTerm={searchTerm}
            activeMatchIndex={activeMatchIndex}
          />
        </ScrollView>

        {session ? (
          <>
            <TextInput
              style={styles.input}
              value={searchTerm}
              onChangeText={onSearchChange}
              placeholder="Search in terminal output"
              placeholderTextColor="#7f7aa8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.rowInlineSpace}>
              <Pressable style={styles.actionButton} onPress={onSearchPrev}>
                <Text style={styles.actionButtonText}>Prev</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={onSearchNext}>
                <Text style={styles.actionButtonText}>Next</Text>
              </Pressable>
              <Text style={styles.emptyText}>{searchMatchesLabel}</Text>
            </View>

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
              <Pressable style={styles.actionButton} onPress={onHistoryPrev}>
                <Text style={styles.actionButtonText}>↑</Text>
              </Pressable>
              <Pressable style={styles.actionButton} onPress={onHistoryNext}>
                <Text style={styles.actionButtonText}>↓</Text>
              </Pressable>
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
