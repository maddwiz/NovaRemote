import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";

import { AnsiText } from "../components/AnsiText";
import { styles } from "../theme/styles";
import { RemoteFileEntry } from "../types";

type FilesScreenProps = {
  connected: boolean;
  busy: boolean;
  busyLabel: string;
  canWrite: boolean;
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
  onSetSelectedFilePath: (value: string | null) => void;
  onSetSelectedContent: (value: string) => void;
  onRefresh: () => void;
  onGoUp: () => void;
  onOpenEntry: (entry: RemoteFileEntry) => void;
  onReadSelected: () => void;
  onTailSelected: () => void;
  onSaveFile: (path: string, content: string) => void;
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
  busy,
  busyLabel,
  canWrite,
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
  onSetSelectedFilePath,
  onSetSelectedContent,
  onRefresh,
  onGoUp,
  onOpenEntry,
  onReadSelected,
  onTailSelected,
  onSaveFile,
  onInsertPath,
  onSendPathCommand,
}: FilesScreenProps) {
  const [targetSession, setTargetSession] = useState<string>("");
  const [editorMode, setEditorMode] = useState<boolean>(false);

  const effectiveSession = useMemo(() => targetSession || openSessions[0] || "", [openSessions, targetSession]);

  return (
    <>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Remote Files</Text>
        {busy ? <Text style={styles.emptyText}>{busyLabel || "Working..."}</Text> : null}
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="List remote directory"
            accessibilityHint="Loads files and folders from the current path."
            style={[styles.buttonPrimary, styles.flexButton, (!connected || busy) ? styles.buttonDisabled : null]}
            onPress={onRefresh}
            disabled={!connected || busy}
          >
            <Text style={styles.buttonPrimaryText}>List Directory</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Go to parent directory"
            accessibilityHint="Navigates to the parent path."
            style={[styles.buttonGhost, styles.flexButton, (!connected || busy) ? styles.buttonDisabled : null]}
            onPress={onGoUp}
            disabled={!connected || busy}
          >
            <Text style={styles.buttonGhostText}>Go Up</Text>
          </Pressable>
        </View>

        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Show Hidden Files</Text>
          <Switch
            accessibilityLabel="Show hidden files"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={includeHidden ? "#d4fdff" : "#d3dee5"}
            value={includeHidden}
            onValueChange={onSetIncludeHidden}
          />
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Directory Entries</Text>
        {!connected ? (
          <Text style={styles.emptyText}>Connect to a server to browse files.</Text>
        ) : busy && entries.length === 0 ? (
          <Text style={styles.emptyText}>Loading directory entries...</Text>
        ) : entries.length === 0 ? (
          <Text style={styles.emptyText}>No files or folders found in this directory.</Text>
        ) : (
          entries.map((entry) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={entry.is_dir ? `Open folder ${entry.name}` : `Read file ${entry.name}`}
              accessibilityHint={entry.is_dir ? "Opens this folder." : "Loads this file preview."}
              key={entry.path}
              style={[styles.terminalCard, busy ? styles.buttonDisabled : null]}
              onPress={() => onOpenEntry(entry)}
              disabled={busy}
            >
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Read selected file"
            accessibilityHint="Loads full file content into preview."
            style={[styles.actionButton, styles.flexButton, (!selectedFilePath || busy) ? styles.buttonDisabled : null]}
            disabled={!selectedFilePath || busy}
            onPress={onReadSelected}
          >
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tail selected file"
            accessibilityHint="Loads the last N lines of the selected file."
            style={[styles.actionButton, styles.flexButton, (!selectedFilePath || busy) ? styles.buttonDisabled : null]}
            disabled={!selectedFilePath || busy}
            onPress={onTailSelected}
          >
            <Text style={styles.actionButtonText}>Tail</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={editorMode ? "Switch to preview mode" : "Switch to edit mode"}
            accessibilityHint="Toggles between ANSI preview and editable file content."
            style={[styles.actionButton, styles.flexButton]}
            onPress={() => setEditorMode((prev) => !prev)}
          >
            <Text style={styles.actionButtonText}>{editorMode ? "Preview" : "Edit"}</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          value={selectedFilePath || ""}
          onChangeText={(value) => onSetSelectedFilePath(value || null)}
          placeholder="/path/to/file.txt"
          placeholderTextColor="#7f7aa8"
          autoCapitalize="none"
          autoCorrect={false}
        />

        {editorMode ? (
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={selectedContent}
            onChangeText={onSetSelectedContent}
            placeholder="File content"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
        ) : (
          <ScrollView style={styles.modalTerminalView}>
            <AnsiText text={selectedContent || (busy ? "Loading file content..." : "File content will appear here.")} style={styles.terminalText} />
          </ScrollView>
        )}

        {canWrite ? (
          <View style={styles.rowInlineSpace}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Create new file draft"
              accessibilityHint="Prepares a new untitled file in the current path."
              style={[styles.buttonGhost, styles.flexButton, busy ? styles.buttonDisabled : null]}
              onPress={() => {
                const base = currentPath.trim().replace(/\/+$/, "") || "/";
                const nextPath = base === "/" ? "/untitled.txt" : `${base}/untitled.txt`;
                onSetSelectedFilePath(nextPath);
                onSetSelectedContent("");
                setEditorMode(true);
              }}
              disabled={busy}
            >
              <Text style={styles.buttonGhostText}>New File</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save file content"
              accessibilityHint="Writes the current editor content to the selected remote file path."
              style={[
                styles.buttonPrimary,
                styles.flexButton,
                (!selectedFilePath || !connected || busy) ? styles.buttonDisabled : null,
              ]}
              onPress={() => {
                if (!selectedFilePath) {
                  return;
                }
                onSaveFile(selectedFilePath, selectedContent);
              }}
              disabled={!selectedFilePath || !connected || busy}
            >
              <Text style={styles.buttonPrimaryText}>Save / Upload</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.emptyText}>Server is read-only for files. Add `/files/write` to enable editing/upload.</Text>
        )}
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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Select file action session ${session}`}
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

        <View style={styles.rowInlineSpace}>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Insert selected path into draft"
            accessibilityHint="Adds the selected file path to the draft input for the target session."
            style={[styles.buttonGhost, styles.flexButton]}
            disabled={!selectedFilePath || !effectiveSession || busy}
            onPress={() => {
              if (selectedFilePath && effectiveSession) {
                onInsertPath(effectiveSession, selectedFilePath);
              }
            }}
          >
            <Text style={styles.buttonGhostText}>Insert Path</Text>
          </Pressable>
          <Pressable accessibilityRole="button"
            accessibilityLabel="Run cat command for selected file"
            accessibilityHint="Runs cat with the selected path in the target terminal session."
            style={[styles.buttonPrimary, styles.flexButton]}
            disabled={!selectedFilePath || !effectiveSession || busy}
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
