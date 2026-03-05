import React, { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { TeamBadge } from "../components/TeamBadge";
import { styles } from "../theme/styles";
import { TeamIdentity, TeamMember, TeamRole } from "../types";

const INVITE_ROLE_OPTIONS: TeamRole[] = ["viewer", "operator", "admin", "billing"];
const MEMBER_ROLE_OPTIONS: TeamRole[] = ["viewer", "operator", "admin", "billing"];

type TeamScreenProps = {
  identity: TeamIdentity | null;
  members: TeamMember[];
  planTier?: "free" | "pro" | "team" | "enterprise";
  planSeats?: number | null;
  settings?: {
    enforceDangerConfirm: boolean | null;
    commandBlocklist: string[];
    sessionTimeoutMinutes: number | null;
    requireSessionRecording: boolean | null;
  };
  usage?: {
    activeMembers: number;
    sessionsCreated: number;
    commandsSent: number;
    fleetExecutions: number;
  };
  loading: boolean;
  busy: boolean;
  authError?: string | null;
  onLogin?: (input: { email: string; password: string; inviteCode?: string }) => Promise<void>;
  onLogout?: () => Promise<void>;
  onRefresh?: () => void;
  canInvite?: boolean;
  canManage?: boolean;
  onInviteMember?: (input: { email: string; role: TeamRole }) => Promise<void>;
  onChangeMemberRole?: (memberId: string, role: TeamRole) => Promise<void>;
  auditPendingCount?: number;
  auditLastSyncAt?: number | null;
  onSyncAudit?: () => Promise<void>;
  onExportAuditJson?: () => Promise<void>;
  onExportAuditCsv?: () => Promise<void>;
};

export function TeamScreen({
  identity,
  members,
  planTier = "free",
  planSeats = null,
  settings,
  usage,
  loading,
  busy,
  authError,
  onLogin,
  onLogout,
  onRefresh,
  canInvite = false,
  canManage = false,
  onInviteMember,
  onChangeMemberRole,
  auditPendingCount = 0,
  auditLastSyncAt = null,
  onSyncAudit,
  onExportAuditJson,
  onExportAuditCsv,
}: TeamScreenProps) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [teamStatus, setTeamStatus] = useState<string>("");
  const canLogin = email.trim().length > 0 && password.trim().length > 0 && !busy;
  const canSubmitInvite = Boolean(identity && canInvite && onInviteMember && inviteEmail.trim().length > 0 && !busy);
  const canSyncAudit = Boolean(identity && onSyncAudit && !busy);
  const canExportAuditJson = Boolean(identity && onExportAuditJson && !busy);
  const canExportAuditCsv = Boolean(identity && onExportAuditCsv && !busy);

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

  const handleInviteMember = useCallback(() => {
    if (!onInviteMember || !canSubmitInvite) {
      return;
    }
    setTeamStatus("");
    void onInviteMember({
      email: inviteEmail.trim().toLowerCase(),
      role: inviteRole,
    })
      .then(() => {
        setInviteEmail("");
        setTeamStatus(`Invite sent to ${inviteEmail.trim().toLowerCase()} as ${inviteRole}.`);
      })
      .catch((error) => {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      });
  }, [canSubmitInvite, inviteEmail, inviteRole, onInviteMember]);

  const handleChangeMemberRole = useCallback(
    (member: TeamMember, nextRole: TeamRole) => {
      if (!onChangeMemberRole || !canManage || busy) {
        return;
      }
      if (member.role === nextRole) {
        return;
      }
      setTeamStatus("");
      void onChangeMemberRole(member.id, nextRole)
        .then(() => {
          setTeamStatus(`Updated ${member.email} to ${nextRole}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [busy, canManage, onChangeMemberRole]
  );

  const handleSyncAudit = useCallback(() => {
    if (!onSyncAudit || !canSyncAudit) {
      return;
    }
    setTeamStatus("");
    void onSyncAudit()
      .then(() => {
        setTeamStatus("Audit log synced.");
      })
      .catch((error) => {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      });
  }, [canSyncAudit, onSyncAudit]);

  const handleExportAuditJson = useCallback(() => {
    if (!onExportAuditJson || !canExportAuditJson) {
      return;
    }
    setTeamStatus("");
    void onExportAuditJson()
      .then(() => {
        setTeamStatus("Audit JSON export prepared.");
      })
      .catch((error) => {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      });
  }, [canExportAuditJson, onExportAuditJson]);

  const handleExportAuditCsv = useCallback(() => {
    if (!onExportAuditCsv || !canExportAuditCsv) {
      return;
    }
    setTeamStatus("");
    void onExportAuditCsv()
      .then(() => {
        setTeamStatus("Audit CSV export prepared.");
      })
      .catch((error) => {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      });
  }, [canExportAuditCsv, onExportAuditCsv]);

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
      {identity ? <Text style={styles.emptyText}>{`Plan: ${planTier}`}</Text> : null}
      {identity && planSeats ? <Text style={styles.emptyText}>{`Seats included: ${planSeats}`}</Text> : null}
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
          <Text style={styles.emptyText}>
            {`Session recording: ${
              settings.requireSessionRecording === null
                ? "user controlled"
                : settings.requireSessionRecording
                  ? "enforced on"
                  : "enforced off"
            }`}
          </Text>
          <Text style={styles.emptyText}>{`Audit queue: ${auditPendingCount}`}</Text>
          <Text style={styles.emptyText}>
            {`Last audit sync: ${auditLastSyncAt ? new Date(auditLastSyncAt).toLocaleTimeString() : "never"}`}
          </Text>
          {usage ? (
            <Text style={styles.emptyText}>
              {`Usage: members ${usage.activeMembers} • sessions ${usage.sessionsCreated} • commands ${usage.commandsSent} • fleet ${usage.fleetExecutions}`}
            </Text>
          ) : null}
        </>
      ) : null}
      {authError ? <Text style={styles.emptyText}>{authError}</Text> : null}
      {teamStatus ? <Text style={styles.emptyText}>{teamStatus}</Text> : null}

      {identity && canInvite && onInviteMember ? (
        <View style={styles.serverCard}>
          <Text style={styles.serverName}>Invite Member</Text>
          <TextInput
            style={styles.input}
            value={inviteEmail}
            onChangeText={setInviteEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            placeholder="member email"
            placeholderTextColor="#7f7aa8"
            accessibilityLabel="Team invite email"
          />
          <View style={styles.modeRow}>
            {INVITE_ROLE_OPTIONS.map((role) => {
              const selected = inviteRole === role;
              return (
                <Pressable
                  key={role}
                  accessibilityRole="button"
                  accessibilityLabel={`Invite role ${role}`}
                  style={[styles.modeButton, selected ? styles.modeButtonOn : null]}
                  onPress={() => setInviteRole(role)}
                >
                  <Text style={[styles.modeButtonText, selected ? styles.modeButtonTextOn : null]}>{role}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send team invite"
            style={[styles.buttonPrimary, !canSubmitInvite ? styles.buttonDisabled : null]}
            onPress={handleInviteMember}
            disabled={!canSubmitInvite}
          >
            <Text style={styles.buttonPrimaryText}>{busy ? "Sending..." : "Send Invite"}</Text>
          </Pressable>
        </View>
      ) : null}

      {identity ? (
        <View style={styles.rowInlineSpace}>
          {onSyncAudit ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sync audit log"
              style={[styles.actionButton, !canSyncAudit ? styles.buttonDisabled : null]}
              onPress={handleSyncAudit}
              disabled={!canSyncAudit}
            >
              <Text style={styles.actionButtonText}>{busy ? "Syncing..." : "Sync Audit"}</Text>
            </Pressable>
          ) : null}
          {onExportAuditJson ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export audit log as JSON"
              style={[styles.actionButton, !canExportAuditJson ? styles.buttonDisabled : null]}
              onPress={handleExportAuditJson}
              disabled={!canExportAuditJson}
            >
              <Text style={styles.actionButtonText}>{busy ? "Exporting..." : "Export JSON"}</Text>
            </Pressable>
          ) : null}
          {onExportAuditCsv ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Export audit log as CSV"
              style={[styles.actionButton, !canExportAuditCsv ? styles.buttonDisabled : null]}
              onPress={handleExportAuditCsv}
              disabled={!canExportAuditCsv}
            >
              <Text style={styles.actionButtonText}>{busy ? "Exporting..." : "Export CSV"}</Text>
            </Pressable>
          ) : null}
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
              {canManage && onChangeMemberRole ? (
                <View style={styles.modeRow}>
                  {MEMBER_ROLE_OPTIONS.map((role) => {
                    const selected = member.role === role;
                    return (
                      <Pressable
                        key={`${member.id}:${role}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Set ${member.email} to ${role}`}
                        style={[styles.modeButton, selected ? styles.modeButtonOn : null, busy ? styles.buttonDisabled : null]}
                        onPress={() => handleChangeMemberRole(member, role)}
                        disabled={busy}
                      >
                        <Text style={[styles.modeButtonText, selected ? styles.modeButtonTextOn : null]}>{role}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
