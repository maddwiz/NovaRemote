import React from "react";
import { Text, View } from "react-native";

import { styles } from "../theme/styles";
import { TeamRole } from "../types";

type TeamBadgeProps = {
  teamName: string;
  role: TeamRole;
};

export function TeamBadge({ teamName, role }: TeamBadgeProps) {
  return (
    <View style={styles.pillGroup}>
      <Text style={[styles.modePill, styles.modePillShell]} numberOfLines={1}>
        TEAM
      </Text>
      <Text style={styles.serverSubtitle} numberOfLines={1}>
        {`${teamName} (${role})`}
      </Text>
    </View>
  );
}
