import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { AnsiText } from "../components/AnsiText";
import { styles } from "../theme/styles";
import { RemoteFileEntry } from "../types";

type FilesScreenProps = {
  connected: boolean;
  currentPath: string;
  includeHidden: boolean;
  entries: RemoteFileEntry[];
  selectedFilePath: string | null;
  selectedContent: string;
  tailLines: string;
  openSessions: string[];
  onSetCurrentPath: (value: string) => void;
  onSetIncludeHidden: (value: boolean) => void;
  onSetTailLines: (value: string) => void;
  onRefresh: () => void;
  onGoUp: () => void;
  onOpenEntry: (entry: RemoteFileEntry) => void;
  onReadSelected: () => void;
  onTailSelected: () => void;
  onInsertPath: (session: string, path: string) => void;
  onSendPathCommand: (session: string, path: string) => void;
};

function formatFileMeta(entry: RemoteFileEntry): string {
  const modified = new Date(entry.mtime * 1000).toLocaleString();
  if (entry.is_dir) {
    return `DIR · ${modified}`;
  }
  return `${entry.size} bytes · ${modified}`;
}

export function FilesScreen({
  connected,
  currentPath,
  includeHidden,
  entries,
  selectedFilePath,
  selectedContent,
  tailLines,
  openSessions,
  onSetCurrentPath,
  onSetIncludeHidden,
  onSetTailLines,
  onRefresh,
  onGoUp,
  onOpenEntry,
  onReadSelected,
  onTailSelected,
  onInsertPath,
  onSendPathCommand,
}: FilesScreenProps) {
  const [targetSession, setTargetSession] = useState<string>("");

  const effectiveSession = useMemo(() => targetSession || openSessions[0] || "", [openSessions, targetSession]);

  return (
    <>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Remote Files</Text>
        <TextInput
          style={styles.input}
          value={currentPath}
          onChangeText={onSetCurrentPath}
          placeholder="/path/to/project"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
        />

        <View style={styles.rowInlineSpace}>
          <Pressable style={[styles.buttonPrimary, styles.flexButton]} onPress={onRefresh} disabled={!connected}>
            <Text style={styles.buttonPrimaryText}>List Directory</Text>
          </Pressable>
          <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onGoUp} disabled={!connected}>
            <Text style={styles.buttonGhostText}>Go Up</Text>
          </Pressable>
        </View>

        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Show Hidden Files</Text>
          <Switch
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={includeHidden ? "#d4fdff" : "#d3dee5"}
            value={includeHidden}
            onValueChange={onSetIncludeHidden}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Directory Entries</Text>
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>No entries loaded yet.</Text>
        ) : (
          entries.map((entry) => (
            <Pressable key={entry.path} style={styles.terminalCard} onPress={() => onOpenEntry(entry)}>
              <View style={styles.terminalNameRow}>
                <Text style={styles.terminalName}>{entry.is_dir ? `[DIR] ${entry.name}` : `[FILE] ${entry.name}`}</Text>
              </View>
              <Text style={styles.serverSubtitle}>{entry.path}</Text>
              <Text style={styles.emptyText}>{formatFileMeta(entry)}</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>File Preview</Text>
        <Text style={styles.serverSubtitle}>{selectedFilePath || "Select a file to preview"}</Text>

        <View style={styles.rowInlineSpace}>
          <Pressable style={[styles.actionButton, styles.flexButton]} disabled={!selectedFilePath} onPress={onReadSelected}>
            <Text style={styles.actionButtonText}>Read</Text>
          </Pressable>
          <TextInput
            style={[styles.input, styles.tailInput]}
            value={tailLines}
            onChangeText={onSetTailLines}
            keyboardType="number-pad"
            placeholder="200"
            placeholderTextColor="#7f7aa8"
          />
          <Pressable style={[styles.actionButton, styles.flexButton]} disabled={!selectedFilePath} onPress={onTailSelected}>
            <Text style={styles.actionButtonText}>Tail</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.modalTerminalView}>
          <AnsiText text={selectedContent || "File content will appear here."} style={styles.terminalText} />
        </ScrollView>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Use Path In Terminal</Text>
        {openSessions.length === 0 ? (
          <Text style={styles.emptyText}>Open a terminal session first.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {openSessions.map((session) => {
              const active = effectiveSession === session;
              return (
                <Pressable key={session} style={[styles.chip, active ? styles.chipActive : null]} onPress={() => setTargetSession(session)}>
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>{session}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        <View style={styles.rowInlineSpace}>
          <Pressable
            style={[styles.buttonGhost, styles.flexButton]}
            disabled={!selectedFilePath || !effectiveSession}
            onPress={() => {
              if (selectedFilePath && effectiveSession) {
                onInsertPath(effectiveSession, selectedFilePath);
              }
            }}
          >
            <Text style={styles.buttonGhostText}>Insert Path</Text>
          </Pressable>
          <Pressable
            style={[styles.buttonPrimary, styles.flexButton]}
            disabled={!selectedFilePath || !effectiveSession}
            onPress={() => {
              if (selectedFilePath && effectiveSession) {
                onSendPathCommand(effectiveSession, selectedFilePath);
              }
            }}
          >
            <Text style={styles.buttonPrimaryText}>Run `cat`</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
