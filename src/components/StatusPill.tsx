import React from "react";
import { Text, View } from "react-native";

import { styles } from "../theme/styles";
import { Status } from "../types";

type StatusPillProps = {
  status: Status;
};

export function StatusPill({ status }: StatusPillProps) {
  return (
    <View style={[styles.statusPill, status.error ? styles.statusPillError : null]}>
      <Text style={styles.statusText}>{status.text}</Text>
    </View>
  );
}
