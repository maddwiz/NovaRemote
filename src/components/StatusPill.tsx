import React from "react";
import { Text, View } from "react-native";

import { summarizeStatusText } from "../statusSummary";
import { styles } from "../theme/styles";
import { Status } from "../types";

type StatusPillProps = {
  status: Status;
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <View style={[styles.statusPill, status.error ? styles.statusPillError : null]}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={styles.statusText}>
        {summarizeStatusText(status.text, 30)}
      </Text>
    </View>
  );
}
