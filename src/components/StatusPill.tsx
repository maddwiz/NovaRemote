import React from "react";
import { Text, View } from "react-native";

import { styles } from "../theme/styles";
import { Status } from "../types";

type StatusPillProps = {
  status: Status;
};

function compactStatusText(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= 42) {
    return compact;
  }

  const firstSentence = compact.split(/(?<=[.!?])\s+/)[0]?.trim();
  if (firstSentence && firstSentence.length <= 42) {
    return firstSentence;
  }

  const firstClause = compact.split(/[:;,.]/)[0]?.trim();
  if (firstClause && firstClause.length <= 42) {
    return firstClause;
  }

  return `${compact.slice(0, 39).trimEnd()}...`;
}

export function StatusPill({ status }: StatusPillProps) {
  return (
    <View style={[styles.statusPill, status.error ? styles.statusPillError : null]}>
      <Text numberOfLines={2} ellipsizeMode="tail" style={styles.statusText}>
        {compactStatusText(status.text)}
      </Text>
    </View>
  );
}
