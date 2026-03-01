import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../theme/styles";
import { SessionCollaborator } from "../../types";

type TerminalCardCollaborationProps = {
  collaborationAvailable: boolean;
  collaborators: SessionCollaborator[];
  readOnly: boolean;
  onRefreshPresence: () => void;
  onSetReadOnly: (value: boolean) => void;
};

export function TerminalCardCollaboration({
  collaborationAvailable,
  collaborators,
  readOnly,
  onRefreshPresence,
  onSetReadOnly,
}: TerminalCardCollaborationProps) {
  const activeCollaborators = useMemo(() => collaborators.filter((entry) => !entry.isSelf), [collaborators]);
  const collaboratorNames = useMemo(() => activeCollaborators.map((entry) => entry.name).slice(0, 4), [activeCollaborators]);

  if (!collaborationAvailable) {
    return null;
  }

  return (
    <View style={styles.serverCard}>
      <View style={styles.rowInlineSpace}>
        <Text style={styles.panelLabel}>Collaboration</Text>
        <View style={styles.actionsWrap}>
          <Pressable accessibilityRole="button" accessibilityLabel="Refresh collaborator presence" style={styles.actionButton} onPress={onRefreshPresence}>
            <Text style={styles.actionButtonText}>Refresh Viewers</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={readOnly ? "Disable read-only mode for this session" : "Enable read-only mode for this session"}
            style={[styles.actionButton, readOnly ? styles.modeButtonOn : null]}
            onPress={() => onSetReadOnly(!readOnly)}
          >
            <Text style={styles.actionButtonText}>{readOnly ? "Read-Only" : "Interactive"}</Text>
          </Pressable>
        </View>
      </View>
      <Text style={styles.serverSubtitle}>
        {activeCollaborators.length === 0 ? "No other viewers detected." : `${activeCollaborators.length} viewer(s) connected.`}
      </Text>
      {collaboratorNames.length > 0 ? (
        <Text style={styles.emptyText}>{`Watching: ${collaboratorNames.join(", ")}${activeCollaborators.length > 4 ? "..." : ""}`}</Text>
      ) : null}
      {readOnly ? <Text style={styles.emptyText}>Read-only mode is enabled for this session.</Text> : null}
    </View>
  );
}
