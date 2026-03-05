import React, { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { TeamBadge } from "../components/TeamBadge";
import { styles } from "../theme/styles";
import { TeamIdentity, TeamMember } from "../types";

type TeamScreenProps = {
  identity: TeamIdentity | null;
  members: TeamMember[];
  settings?: {
    enforceDangerConfirm: boolean | null;
    commandBlocklist: string[];
    sessionTimeoutMinutes: number | null;
  };
  loading: boolean;
  busy: boolean;
  authError?: string | null;
  onLogin?: (input: { email: string; password: string; inviteCode?: string }) => Promise<void>;
  onLogout?: () => Promise<void>;
  onRefresh?: () => void;
};

export function TeamScreen({
  identity,
  members,
  settings,
  loading,
  busy,
  authError,
  onLogin,
  onLogout,
  onRefresh,
}: TeamScreenProps) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const canLogin = email.trim().length > 0 && password.trim().length > 0 && !busy;

  const handleLogin = useCallback(() => {
    if (!onLogin || !canLogin) {
      return;
    }
    void onLogin({
      email: email.trim(),
      password,
      inviteCode: inviteCode.trim() || undefined,
    }).then(() => {
      setPassword("");
    });
  }, [canLogin, email, inviteCode, onLogin, password]);

  const handleLogout = useCallback(() => {
    if (!onLogout || busy) {
      return;
    }
    void onLogout();
  }, [busy, onLogout]);

  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>Team</Text>
      {!identity ? <Text style={styles.emptyText}>Sign in with your team account to view members and roles.</Text> : null}
      {!identity ? (
        <>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="team email"
            placeholderTextColor="#7f7aa8"
            accessibilityLabel="Team login email"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
            placeholder="password"
            placeholderTextColor="#7f7aa8"
            accessibilityLabel="Team login password"
          />
          <TextInput
            style={styles.input}
            value={inviteCode}
            onChangeText={setInviteCode}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="invite code (optional)"
            placeholderTextColor="#7f7aa8"
            accessibilityLabel="Team invite code"
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Sign in to team account"
            style={[styles.buttonPrimary, !canLogin ? styles.buttonDisabled : null]}
            onPress={handleLogin}
            disabled={!canLogin}
          >
            <Text style={styles.buttonPrimaryText}>{busy ? "Signing in..." : "Sign In"}</Text>
          </Pressable>
        </>
      ) : null}
      {identity ? <TeamBadge teamName={identity.teamName} role={identity.role} /> : null}
      {identity ? <Text style={styles.serverSubtitle}>{identity.email}</Text> : null}
      {identity && settings ? (
        <>
          <Text style={styles.emptyText}>
            {`Danger confirm: ${
              settings.enforceDangerConfirm === null ? "user controlled" : settings.enforceDangerConfirm ? "enforced on" : "enforced off"
            }`}
          </Text>
          <Text style={styles.emptyText}>
            {`Session timeout: ${settings.sessionTimeoutMinutes ? `${settings.sessionTimeoutMinutes} min` : "disabled"}`}
          </Text>
          <Text style={styles.emptyText}>{`Command blocklist rules: ${settings.commandBlocklist.length}`}</Text>
        </>
      ) : null}
      {authError ? <Text style={styles.emptyText}>{authError}</Text> : null}

      {identity ? (
        <View style={styles.rowInlineSpace}>
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
          {onLogout ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sign out from team account"
              style={[styles.actionDangerButton, busy ? styles.buttonDisabled : null]}
              onPress={handleLogout}
              disabled={busy}
            >
              <Text style={styles.actionDangerText}>Sign Out</Text>
            </Pressable>
          ) : null}
        </View>
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
