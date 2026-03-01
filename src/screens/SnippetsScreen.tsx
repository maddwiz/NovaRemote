import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";

import { styles } from "../theme/styles";
import { Snippet, TerminalSendMode } from "../types";

type SnippetsScreenProps = {
  snippets: Snippet[];
  activeServerId: string | null;
  openSessions: string[];
  isPro: boolean;
  onShowPaywall: () => void;
  onSaveSnippet: (input: Omit<Snippet, "id"> & { id?: string }) => void;
  onDeleteSnippet: (id: string) => void;
  onInsertSnippet: (session: string, command: string) => void;
  onRunSnippet: (session: string, command: string, mode: TerminalSendMode) => void;
};

export function SnippetsScreen({
  snippets,
  activeServerId,
  openSessions,
  isPro,
  onShowPaywall,
  onSaveSnippet,
  onDeleteSnippet,
  onInsertSnippet,
  onRunSnippet,
}: SnippetsScreenProps) {
  const [name, setName] = useState<string>("");
  const [command, setCommand] = useState<string>("");
  const [mode, setMode] = useState<TerminalSendMode>("shell");
  const [scopeCurrentServer, setScopeCurrentServer] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [targetSession, setTargetSession] = useState<string>("");

  const relevantSnippets = useMemo(
    () =>
      snippets.filter((snippet) => {
        if (!snippet.serverId) {
          return true;
        }
        return activeServerId ? snippet.serverId === activeServerId : false;
      }),
    [activeServerId, snippets]
  );

  return (
    <>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Snippets / Macros</Text>
        <Text style={styles.serverSubtitle}>Save reusable AI prompts and shell commands.</Text>

        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="Snippet name"
          placeholderTextColor="#7f7aa8"
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={command}
          onChangeText={setCommand}
          placeholder="Command or prompt"
          placeholderTextColor="#7f7aa8"
          multiline
        />

        <View style={styles.modeRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="Set snippet mode to AI" style={[styles.modeButton, mode === "ai" ? styles.modeButtonOn : null]} onPress={() => setMode("ai")}>
            <Text style={[styles.modeButtonText, mode === "ai" ? styles.modeButtonTextOn : null]}>AI</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Set snippet mode to shell" style={[styles.modeButton, mode === "shell" ? styles.modeButtonOn : null]} onPress={() => setMode("shell")}>
            <Text style={[styles.modeButtonText, mode === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Toggle snippet scope to this server"
            style={[styles.modeButton, scopeCurrentServer ? styles.modeButtonOn : null]}
            onPress={() => setScopeCurrentServer((prev) => !prev)}
          >
            <Text style={[styles.modeButtonText, scopeCurrentServer ? styles.modeButtonTextOn : null]}>This Server</Text>
          </Pressable>
        </View>

        <Pressable accessibilityRole="button"
          accessibilityLabel={editingId ? "Update snippet" : "Save snippet"}
          accessibilityHint="Stores the snippet for reuse."
          style={styles.buttonPrimary}
          onPress={() => {
            if (!isPro) {
              onShowPaywall();
              return;
            }

            if (!name.trim() || !command.trim()) {
              return;
            }

            onSaveSnippet({
              id: editingId || undefined,
              name,
              command,
              mode,
              serverId: scopeCurrentServer ? activeServerId || undefined : undefined,
            });
            setName("");
            setCommand("");
            setMode("shell");
            setScopeCurrentServer(false);
            setEditingId(null);
          }}
        >
          <Text style={styles.buttonPrimaryText}>{editingId ? "Update Snippet" : "Save Snippet"}</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Target Session</Text>
        {openSessions.length === 0 ? (
          <Text style={styles.emptyText}>Open a session first to insert or run snippets.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {openSessions.map((session) => {
              const active = (targetSession || openSessions[0]) === session;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select target session ${session}`}
                  key={session}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => setTargetSession(session)}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{session}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Saved Snippets</Text>
        {relevantSnippets.length === 0 ? (
          <Text style={styles.emptyText}>No snippets saved yet.</Text>
        ) : (
          relevantSnippets.map((snippet) => {
            const session = targetSession || openSessions[0] || "";
            return (
              <View key={snippet.id} style={styles.terminalCard}>
                <View style={styles.terminalNameRow}>
                  <Text style={styles.terminalName}>{snippet.name}</Text>
                  <Text style={[styles.modePill, snippet.mode === "ai" ? styles.modePillAi : styles.modePillShell]}>
                    {snippet.mode.toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.serverSubtitle}>{snippet.command}</Text>
                <View style={styles.actionsWrap}>
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={`Insert snippet ${snippet.name}`}
                    style={styles.actionButton}
                    disabled={!session}
                    onPress={() => {
                      if (session) {
                        onInsertSnippet(session, snippet.command);
                      }
                    }}
                  >
                    <Text style={styles.actionButtonText}>Insert</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={`Run snippet ${snippet.name}`}
                    style={styles.actionButton}
                    disabled={!session}
                    onPress={() => {
                      if (session) {
                        onRunSnippet(session, snippet.command, snippet.mode);
                      }
                    }}
                  >
                    <Text style={styles.actionButtonText}>Run</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button"
                    accessibilityLabel={`Edit snippet ${snippet.name}`}
                    style={styles.actionButton}
                    onPress={() => {
                      setEditingId(snippet.id);
                      setName(snippet.name);
                      setCommand(snippet.command);
                      setMode(snippet.mode);
                      setScopeCurrentServer(Boolean(snippet.serverId));
                    }}
                  >
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete snippet ${snippet.name}`} style={styles.actionDangerButton} onPress={() => onDeleteSnippet(snippet.id)}>
                    <Text style={styles.actionDangerText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
    </>
  );
}
