import React, { useEffect, useRef, useState } from "react";
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
  TextInputSelectionChangeEventData,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";

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
  const [draftSelection, setDraftSelection] = useState<{ start: number; end: number }>({ start: 0, end: 0 });
  type KeyPressEventWithModifiers = TextInputKeyPressEventData & {
    ctrlKey?: boolean;
    metaKey?: boolean;
  };

  useEffect(() => {
    setDraftSelection((current) => {
      const max = draft.length;
      const nextStart = Math.max(0, Math.min(max, current.start));
      const nextEnd = Math.max(nextStart, Math.min(max, current.end));
      if (nextStart === current.start && nextEnd === current.end) {
        return current;
      }
      return { start: nextStart, end: nextEnd };
    });
  }, [draft]);

  const selectionRange = () => {
    const max = draft.length;
    const start = Math.max(0, Math.min(max, draftSelection.start));
    const end = Math.max(start, Math.min(max, draftSelection.end));
    return { start, end };
  };

  const applyDraftWithSelection = (value: string, cursor: number) => {
    onDraftChange(value);
    const nextCursor = Math.max(0, Math.min(value.length, cursor));
    setDraftSelection({ start: nextCursor, end: nextCursor });
  };

  const wordStart = (text: string, index: number) => {
    let pointer = Math.max(0, Math.min(text.length, index));
    while (pointer > 0 && /\s/.test(text[pointer - 1])) {
      pointer -= 1;
    }
    while (pointer > 0 && !/\s/.test(text[pointer - 1])) {
      pointer -= 1;
    }
    return pointer;
  };

  const wordEnd = (text: string, index: number) => {
    let pointer = Math.max(0, Math.min(text.length, index));
    while (pointer < text.length && /\s/.test(text[pointer])) {
      pointer += 1;
    }
    while (pointer < text.length && !/\s/.test(text[pointer])) {
      pointer += 1;
    }
    return pointer;
  };

  const onKeyboardAction = (action: string) => {
    if (action === "history_prev") {
      if (!isReadOnly && !isSending) {
        onHistoryPrev();
      }
      return;
    }
    if (action === "history_next") {
      if (!isReadOnly && !isSending) {
        onHistoryNext();
      }
      return;
    }
    if (isReadOnly || isSending) {
      return;
    }
    const selection = selectionRange();
    if (action === "cursor_left") {
      const cursor = selection.start === selection.end ? selection.start - 1 : selection.start;
      setDraftSelection({ start: Math.max(0, cursor), end: Math.max(0, cursor) });
      return;
    }
    if (action === "cursor_right") {
      const cursor = selection.start === selection.end ? selection.end + 1 : selection.end;
      const bounded = Math.max(0, Math.min(draft.length, cursor));
      setDraftSelection({ start: bounded, end: bounded });
      return;
    }
    if (action === "cursor_home") {
      setDraftSelection({ start: 0, end: 0 });
      return;
    }
    if (action === "cursor_end") {
      setDraftSelection({ start: draft.length, end: draft.length });
      return;
    }
    if (action === "word_back") {
      const cursor = wordStart(draft, selection.start);
      setDraftSelection({ start: cursor, end: cursor });
      return;
    }
    if (action === "word_forward") {
      const cursor = wordEnd(draft, selection.end);
      setDraftSelection({ start: cursor, end: cursor });
      return;
    }
    if (action === "delete_word_back") {
      if (selection.start !== selection.end) {
        const next = `${draft.slice(0, selection.start)}${draft.slice(selection.end)}`;
        applyDraftWithSelection(next, selection.start);
        return;
      }
      const left = wordStart(draft, selection.start);
      if (left === selection.start) {
        return;
      }
      const next = `${draft.slice(0, left)}${draft.slice(selection.end)}`;
      applyDraftWithSelection(next, left);
    }
  };

  const onKeyboardInsertText = (text: string) => {
    if (isReadOnly || isSending) {
      return;
    }
    const selection = selectionRange();
    const next = `${draft.slice(0, selection.start)}${text}${draft.slice(selection.end)}`;
    applyDraftWithSelection(next, selection.start + text.length);
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
              onSelectionChange={(event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) =>
                setDraftSelection(event.nativeEvent.selection)
              }
            />
            <TerminalKeyboardBar
              visible={!isReadOnly}
              onInsertText={onKeyboardInsertText}
              onControlChar={(value) => {
                if (isReadOnly) {
                  return;
                }
                onSendControlChar(value);
              }}
              onAction={onKeyboardAction}
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
