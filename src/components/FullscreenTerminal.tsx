import React, { useRef } from "react";
import {
  Modal,
  NativeSyntheticEvent,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleProp,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

import { TextEditingAction, useTextEditing } from "../hooks/useTextEditing";
import { styles } from "../theme/styles";
import { TerminalSendMode } from "../types";
import { AnsiText } from "./AnsiText";
import { TerminalKeyboardBar } from "./TerminalKeyboardBar";

type FullscreenTerminalProps = {
  session: string | null;
  output: string;
  draft: string;
  mode: TerminalSendMode;
  isSending: boolean;
  isReadOnly: boolean;
  collaboratorCount: number;
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
  onSendControlChar: (char: string) => void;
  onSend: () => void;
  onStop: () => void;
};

export function FullscreenTerminal({
  session,
  output,
  draft,
  mode,
  isSending,
  isReadOnly,
  collaboratorCount,
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
  onSendControlChar,
  onSend,
  onStop,
}: FullscreenTerminalProps) {
  const terminalRef = useRef<ScrollView | null>(null);
  const searchRef = useRef<TextInput | null>(null);
  const {
    selection: draftSelection,
    onSelectionChange: onDraftSelectionChange,
    insertTextAtCursor,
    handleAction: handleDraftAction,
  } = useTextEditing({
    value: draft,
    onChange: onDraftChange,
    disabled: isReadOnly || isSending,
    onHistoryPrev,
    onHistoryNext,
  });
  type KeyPressEventWithModifiers = TextInputKeyPressEventData & {
    ctrlKey?: boolean;
    metaKey?: boolean;
  };

  const onDraftKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    const native = event.nativeEvent as KeyPressEventWithModifiers;
    const key = (native.key || "").toLowerCase();
    const hasCtrl = Boolean(native.ctrlKey);
    const hasMeta = Boolean(native.metaKey);
    if ((hasMeta || hasCtrl) && key === "enter") {
      if (!isSending && !isReadOnly) {
        onSend();
      }
      return;
    }
    if (hasCtrl && key === "c") {
      if (!isReadOnly) {
        onStop();
      }
      return;
    }
    if (hasMeta && key === "k") {
      onDraftChange("");
      return;
    }
    if (hasMeta && key === "w") {
      onClose();
      return;
    }
    if (hasMeta && key === "f") {
      searchRef.current?.focus();
      return;
    }
    if (key === "arrowup") {
      onHistoryPrev();
      return;
    }
    if (key === "arrowdown") {
      onHistoryNext();
      return;
    }
    if (mode === "shell" && key === "enter" && !isSending && !isReadOnly) {
      onSend();
    }
  };

  return (
    <Modal animationType="slide" transparent={false} visible={Boolean(session)} onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafeArea}>
        <View style={styles.modalHeader}>
          <Text style={styles.modalTitle}>{session || "Terminal"}</Text>
          <View style={styles.rowInlineSpace}>
            {session ? (
              <Pressable accessibilityRole="button" accessibilityLabel={mode === "ai" ? "Switch to shell mode" : "Switch to AI mode"} style={styles.actionButton} onPress={onToggleMode}>
                <Text style={styles.actionButtonText}>{mode === "ai" ? "Switch to Shell" : "Switch to AI"}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Close fullscreen terminal" style={styles.actionButton} onPress={onClose}>
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
              ref={searchRef}
              style={styles.input}
              value={searchTerm}
              onChangeText={onSearchChange}
              placeholder="Search in terminal output"
              placeholderTextColor="#7f7aa8"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.rowInlineSpace}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous search match" style={styles.actionButton} onPress={onSearchPrev}>
                <Text style={styles.actionButtonText}>Prev</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Next search match" style={styles.actionButton} onPress={onSearchNext}>
                <Text style={styles.actionButtonText}>Next</Text>
              </Pressable>
              <Text style={styles.emptyText}>{searchMatchesLabel}</Text>
            </View>

            <TextInput
              style={[styles.input, styles.modalInput]}
              value={draft}
              selection={draftSelection}
              multiline
              editable={!isSending && !isReadOnly}
              placeholder={isReadOnly ? "Read-only collaboration mode is enabled" : mode === "ai" ? "Message AI..." : "Run shell command..."}
              placeholderTextColor="#7f7aa8"
              onKeyPress={onDraftKeyPress}
              onChangeText={onDraftChange}
              onSelectionChange={onDraftSelectionChange}
            />
            <TerminalKeyboardBar
              visible={!isReadOnly}
              onInsertText={insertTextAtCursor}
              onControlChar={(value) => {
                if (isReadOnly) {
                  return;
                }
                onSendControlChar(value);
              }}
              onAction={(action) => handleDraftAction(action as TextEditingAction)}
            />
            <Text style={styles.emptyText}>
              {`Viewers ${collaboratorCount} · Shortcuts: Cmd/Ctrl+Enter send, Ctrl+C stop, Cmd+K clear, Cmd+F search, Cmd+W close.`}
            </Text>

            <View style={styles.rowInlineSpace}>
              <Pressable accessibilityRole="button" accessibilityLabel="Previous command history" style={styles.actionButton} onPress={onHistoryPrev}>
                <Text style={styles.actionButtonText}>↑</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Next command history" style={styles.actionButton} onPress={onHistoryNext}>
                <Text style={styles.actionButtonText}>↓</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                accessibilityLabel={isReadOnly ? "Session is read only" : isSending ? "Sending command" : "Send command"}
                style={[styles.buttonPrimary, styles.flexButton, isSending || isReadOnly ? styles.buttonDisabled : null]}
                disabled={isSending || isReadOnly}
                onPress={onSend}
              >
                <Text style={styles.buttonPrimaryText}>{isSending ? "Sending..." : isReadOnly ? "Read-Only" : "Send"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button"
                accessibilityLabel="Send Ctrl C to stop process"
                style={[styles.actionDangerButton, styles.flexButton, isReadOnly ? styles.buttonDisabled : null]}
                onPress={onStop}
                disabled={isReadOnly}
              >
                <Text style={styles.actionDangerText}>Ctrl-C</Text>
              </Pressable>
            </View>
          </>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}
