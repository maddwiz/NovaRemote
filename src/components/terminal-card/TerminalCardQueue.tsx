import React, { useMemo } from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../../theme/styles";
import { QueuedCommand, QueuedCommandStatus } from "../../types";

function queueStatus(entry: QueuedCommand): QueuedCommandStatus {
  const status = entry.status;
  if (status === "sending" || status === "sent" || status === "failed") {
    return status;
  }
  return "pending";
}

type TerminalCardQueueProps = {
  session: string;
  queuedItems: QueuedCommand[];
  onFlushQueue: () => void;
  onRemoveQueuedCommand: (index: number) => void;
};

export function TerminalCardQueue({ session, queuedItems, onFlushQueue, onRemoveQueuedCommand }: TerminalCardQueueProps) {
  const queuedCount = queuedItems.length;
  const queuedPending = useMemo(
    () => queuedItems.filter((entry) => queueStatus(entry) === "pending" || queueStatus(entry) === "sending").length,
    [queuedItems]
  );
  const queuedFailed = useMemo(() => queuedItems.filter((entry) => queueStatus(entry) === "failed").length, [queuedItems]);

  if (queuedCount === 0) {
    return null;
  }

  return (
    <View style={styles.serverCard}>
      <View style={styles.rowInlineSpace}>
        <Text style={styles.emptyText}>
          {`${queuedCount} queued (${queuedPending} pending`}
          {queuedFailed > 0 ? `, ${queuedFailed} failed` : ""}
          {")"}
        </Text>
        <Pressable accessibilityRole="button" style={styles.actionButton} onPress={onFlushQueue}>
          <Text style={styles.actionButtonText}>Flush Queue</Text>
        </Pressable>
      </View>
      {queuedItems.slice(0, 5).map((entry, index) => {
        const status = queueStatus(entry);
        return (
          <View key={`${entry.id || session}-${index}`} style={styles.serverCard}>
            <View style={styles.rowInlineSpace}>
              <Text style={styles.serverSubtitle}>{entry.command}</Text>
              <Text style={styles.emptyText}>{status.toUpperCase()}</Text>
            </View>
            {status === "failed" && entry.lastError ? <Text style={styles.emptyText}>{entry.lastError}</Text> : null}
            <View style={styles.rowInlineSpace}>
              <Text style={styles.emptyText}>{new Date(entry.queuedAt).toLocaleTimeString()}</Text>
              <Pressable accessibilityRole="button" style={styles.actionDangerButton} onPress={() => onRemoveQueuedCommand(index)}>
                <Text style={styles.actionDangerText}>Remove</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
      {queuedItems.length > 5 ? <Text style={styles.emptyText}>{`+${queuedItems.length - 5} more queued`}</Text> : null}
    </View>
  );
}
