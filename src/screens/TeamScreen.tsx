import React from "react";
import { Pressable, Text, View } from "react-native";

import { TeamBadge } from "../components/TeamBadge";
import { styles } from "../theme/styles";
import { TeamIdentity, TeamMember } from "../types";

type TeamScreenProps = {
  identity: TeamIdentity | null;
  members: TeamMember[];
  loading: boolean;
  busy: boolean;
  onRefresh?: () => void;
};

export function TeamScreen({ identity, members, loading, busy, onRefresh }: TeamScreenProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>Team</Text>
      {!identity ? <Text style={styles.emptyText}>Sign in with your team account to view members and roles.</Text> : null}
      {identity ? <TeamBadge teamName={identity.teamName} role={identity.role} /> : null}
      {identity ? <Text style={styles.serverSubtitle}>{identity.email}</Text> : null}

      {onRefresh ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh team members"
          style={[styles.actionButton, busy ? styles.buttonDisabled : null]}
          onPress={onRefresh}
          disabled={busy}
        >
          <Text style={styles.actionButtonText}>{busy ? "Refreshing..." : "Refresh Members"}</Text>
        </Pressable>
      ) : null}

      {loading ? <Text style={styles.emptyText}>Loading team members...</Text> : null}
      {!loading && identity && members.length === 0 ? <Text style={styles.emptyText}>No members found.</Text> : null}
      {!loading && members.length > 0 ? (
        <View style={styles.serverListWrap}>
          {members.map((member) => (
            <View key={member.id} style={styles.serverCard}>
              <Text style={styles.serverName}>{member.name}</Text>
              <Text style={styles.serverUrl}>{member.email}</Text>
              <Text style={styles.emptyText}>{`Role: ${member.role}`}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
