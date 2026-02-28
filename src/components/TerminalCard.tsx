import React, { useRef } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { styles } from "../theme/styles";
import { TerminalSendMode } from "../types";
import { AnsiText } from "./AnsiText";

type TerminalCardProps = {
  session: string;
  output: string;
  draft: string;
  isSending: boolean;
  isLive: boolean;
  mode: TerminalSendMode;
  onSetMode: (mode: TerminalSendMode) => void;
  onOpenOnMac: () => void;
  onSync: () => void;
  onFullscreen: () => void;
  onStop: () => void;
  onHide: () => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
};

export function TerminalCard({
  session,
  output,
  draft,
  isSending,
  isLive,
  mode,
  onSetMode,
  onOpenOnMac,
  onSync,
  onFullscreen,
  onStop,
  onHide,
  onDraftChange,
  onSend,
  onClear,
}: TerminalCardProps) {
  const terminalRef = useRef<ScrollView | null>(null);

  return (
    <View style={styles.terminalCard}>
      <View style={styles.terminalHeader}>
        <View style={styles.terminalNameRow}>
          <Text style={styles.terminalName}>{session}</Text>
          <View style={styles.pillGroup}>
            <Text style={[styles.modePill, mode === "ai" ? styles.modePillAi : styles.modePillShell]}>
              {mode.toUpperCase()}
            </Text>
            <Text style={[styles.livePill, isLive ? styles.livePillOn : styles.livePillOff]}>{isLive ? "LIVE" : "SYNC"}</Text>
          </View>
        </View>

        <View style={styles.modeRow}>
          <Pressable style={[styles.modeButton, mode === "ai" ? styles.modeButtonOn : null]} onPress={() => onSetMode("ai")}>
            <Text style={[styles.modeButtonText, mode === "ai" ? styles.modeButtonTextOn : null]}>AI</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, mode === "shell" ? styles.modeButtonOn : null]}
            onPress={() => onSetMode("shell")}
          >
            <Text style={[styles.modeButtonText, mode === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
          </Pressable>
        </View>

        <View style={styles.actionsWrap}>
          <Pressable style={styles.actionButton} onPress={onOpenOnMac}>
            <Text style={styles.actionButtonText}>Open on Mac</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onSync}>
            <Text style={styles.actionButtonText}>Sync</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onFullscreen}>
            <Text style={styles.actionButtonText}>Fullscreen</Text>
          </Pressable>
          <Pressable style={styles.actionDangerButton} onPress={onStop}>
            <Text style={styles.actionDangerText}>Stop</Text>
          </Pressable>
          <Pressable style={styles.actionButton} onPress={onHide}>
            <Text style={styles.actionButtonText}>Hide</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={terminalRef}
        style={styles.terminalView}
        onContentSizeChange={() => terminalRef.current?.scrollToEnd({ animated: true })}
      >
        <AnsiText text={output || "Waiting for output..."} style={styles.terminalText} />
      </ScrollView>

      <TextInput
        style={[styles.input, styles.multilineInput]}
        value={draft}
        multiline
        editable={!isSending}
        placeholder={mode === "ai" ? "Message AI..." : "Run shell command..."}
        placeholderTextColor="#7f7aa8"
        onChangeText={onDraftChange}
      />

      <View style={styles.rowInlineSpace}>
        <Pressable style={[styles.buttonPrimary, styles.flexButton, isSending ? styles.buttonDisabled : null]} disabled={isSending} onPress={onSend}>
          <Text style={styles.buttonPrimaryText}>{isSending ? "Sending..." : "Send"}</Text>
        </Pressable>
        <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onClear}>
          <Text style={styles.buttonGhostText}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}
