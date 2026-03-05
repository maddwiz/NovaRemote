import React, { useCallback, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { TeamBadge } from "../components/TeamBadge";
import { styles } from "../theme/styles";
import { TeamFleetApproval, TeamIdentity, TeamMember, TeamRole } from "../types";

const INVITE_ROLE_OPTIONS: TeamRole[] = ["viewer", "operator", "admin", "billing"];
const MEMBER_ROLE_OPTIONS: TeamRole[] = ["viewer", "operator", "admin", "billing"];
const MEMBER_ROLE_FILTER_OPTIONS: Array<"all" | TeamRole> = ["all", "viewer", "operator", "admin", "billing"];
const TEAM_SSO_PROVIDERS = ["oidc", "saml"] as const;
type TeamSsoProvider = (typeof TEAM_SSO_PROVIDERS)[number];

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
    requireFleetApproval: boolean | null;
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
  onLoginSso?: (input: { provider: TeamSsoProvider; idToken?: string; accessToken?: string; inviteCode?: string }) => Promise<void>;
  onLogout?: () => Promise<void>;
  onRefresh?: () => void;
  canInvite?: boolean;
  canManage?: boolean;
  onInviteMember?: (input: { email: string; role: TeamRole }) => Promise<void>;
  onChangeMemberRole?: (memberId: string, role: TeamRole) => Promise<void>;
  fleetApprovals?: TeamFleetApproval[];
  onApproveFleetApproval?: (approvalId: string, note?: string) => Promise<void>;
  onDenyFleetApproval?: (approvalId: string, note?: string) => Promise<void>;
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
  onLoginSso,
  onLogout,
  onRefresh,
  canInvite = false,
  canManage = false,
  onInviteMember,
  onChangeMemberRole,
  fleetApprovals = [],
  onApproveFleetApproval,
  onDenyFleetApproval,
  auditPendingCount = 0,
  auditLastSyncAt = null,
  onSyncAudit,
  onExportAuditJson,
  onExportAuditCsv,
}: TeamScreenProps) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loginMethod, setLoginMethod] = useState<"password" | "sso">("password");
  const [ssoProvider, setSsoProvider] = useState<TeamSsoProvider>("oidc");
  const [ssoToken, setSsoToken] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [memberQuery, setMemberQuery] = useState<string>("");
  const [memberRoleFilter, setMemberRoleFilter] = useState<"all" | TeamRole>("all");
  const [teamStatus, setTeamStatus] = useState<string>("");
  const canPasswordLogin = email.trim().length > 0 && password.trim().length > 0 && !busy;
  const canSsoLogin = ssoToken.trim().length > 0 && !busy;
  const canSubmitInvite = Boolean(identity && canInvite && onInviteMember && inviteEmail.trim().length > 0 && !busy);
  const canReviewFleetApprovals = Boolean(identity && canManage && !busy && (onApproveFleetApproval || onDenyFleetApproval));
  const pendingFleetApprovals = fleetApprovals.filter((approval) => approval.status === "pending");
  const canSyncAudit = Boolean(identity && onSyncAudit && !busy);
  const canExportAuditJson = Boolean(identity && onExportAuditJson && !busy);
  const canExportAuditCsv = Boolean(identity && onExportAuditCsv && !busy);
  const normalizedMemberQuery = memberQuery.trim().toLowerCase();
  const visibleMembers = members.filter((member) => {
    if (memberRoleFilter !== "all" && member.role !== memberRoleFilter) {
      return false;
    }
    if (!normalizedMemberQuery) {
      return true;
    }
    return (
      member.name.toLowerCase().includes(normalizedMemberQuery) ||
      member.email.toLowerCase().includes(normalizedMemberQuery)
    );
  });

  const handleLogin = useCallback(() => {
    if (!onLogin || !canPasswordLogin) {
      return;
    }
    void onLogin({
      email: email.trim(),
      password,
      inviteCode: inviteCode.trim() || undefined,
    }).then(() => {
      setPassword("");
    });
  }, [canPasswordLogin, email, inviteCode, onLogin, password]);

  const handleSsoLogin = useCallback(() => {
    if (!onLoginSso || !canSsoLogin) {
      return;
    }
    void onLoginSso({
      provider: ssoProvider,
      idToken: ssoToken.trim(),
      inviteCode: inviteCode.trim() || undefined,
    }).then(() => {
      setSsoToken("");
    });
  }, [canSsoLogin, inviteCode, onLoginSso, ssoProvider, ssoToken]);

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

  const handleApproveFleetApproval = useCallback(
    (approval: TeamFleetApproval) => {
      if (!onApproveFleetApproval || !canReviewFleetApprovals) {
        return;
      }
      setTeamStatus("");
      void onApproveFleetApproval(approval.id)
        .then(() => {
          setTeamStatus(`Approved fleet request ${approval.id}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canReviewFleetApprovals, onApproveFleetApproval]
  );

  const handleDenyFleetApproval = useCallback(
    (approval: TeamFleetApproval) => {
      if (!onDenyFleetApproval || !canReviewFleetApprovals) {
        return;
      }
      setTeamStatus("");
      void onDenyFleetApproval(approval.id)
        .then(() => {
          setTeamStatus(`Denied fleet request ${approval.id}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canReviewFleetApprovals, onDenyFleetApproval]
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
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use password login"
              style={[styles.modeButton, loginMethod === "password" ? styles.modeButtonOn : null]}
              onPress={() => setLoginMethod("password")}
            >
              <Text style={[styles.modeButtonText, loginMethod === "password" ? styles.modeButtonTextOn : null]}>password</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Use SSO login"
              style={[styles.modeButton, loginMethod === "sso" ? styles.modeButtonOn : null]}
              onPress={() => setLoginMethod("sso")}
            >
              <Text style={[styles.modeButtonText, loginMethod === "sso" ? styles.modeButtonTextOn : null]}>sso</Text>
            </Pressable>
          </View>
          {loginMethod === "password" ? (
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
            </>
          ) : (
            <>
              <View style={styles.modeRow}>
                {TEAM_SSO_PROVIDERS.map((provider) => {
                  const selected = ssoProvider === provider;
                  return (
                    <Pressable
                      key={provider}
                      accessibilityRole="button"
                      accessibilityLabel={`Set SSO provider ${provider}`}
                      style={[styles.modeButton, selected ? styles.modeButtonOn : null]}
                      onPress={() => setSsoProvider(provider)}
                    >
                      <Text style={[styles.modeButtonText, selected ? styles.modeButtonTextOn : null]}>{provider}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                style={styles.input}
                value={ssoToken}
                onChangeText={setSsoToken}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="sso id/access token"
                placeholderTextColor="#7f7aa8"
                accessibilityLabel="Team SSO token"
              />
            </>
          )}
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
            style={[
              styles.buttonPrimary,
              !(loginMethod === "password" ? canPasswordLogin : canSsoLogin) ? styles.buttonDisabled : null,
            ]}
            onPress={loginMethod === "password" ? handleLogin : handleSsoLogin}
            disabled={!(loginMethod === "password" ? canPasswordLogin : canSsoLogin)}
          >
            <Text style={styles.buttonPrimaryText}>
              {busy ? "Signing in..." : loginMethod === "password" ? "Sign In" : `Sign In (${ssoProvider.toUpperCase()})`}
            </Text>
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
          <Text style={styles.emptyText}>{`Fleet approvals pending: ${pendingFleetApprovals.length}`}</Text>
          <Text style={styles.emptyText}>
            {`Fleet approval: ${
              settings.requireFleetApproval === null
                ? "user controlled"
                : settings.requireFleetApproval
                  ? "enforced on"
                  : "enforced off"
            }`}
          </Text>
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

      {!loading && identity && fleetApprovals.length > 0 ? (
        <View style={styles.serverCard}>
          <Text style={styles.serverName}>{`Fleet Approvals (${pendingFleetApprovals.length} pending)`}</Text>
          {fleetApprovals.map((approval) => (
            <View key={approval.id} style={styles.serverCard}>
              <Text style={styles.serverSubtitle}>{`#${approval.id} • ${approval.status}`}</Text>
              <Text style={styles.serverUrl}>{approval.command}</Text>
              <Text style={styles.emptyText}>{`Requested by ${approval.requestedByEmail}`}</Text>
              <Text style={styles.emptyText}>
                {`Targets: ${approval.targets.length > 0 ? approval.targets.join(", ") : "none"}`}
              </Text>
              {approval.note ? <Text style={styles.emptyText}>{`Note: ${approval.note}`}</Text> : null}
              {approval.status === "pending" ? (
                <View style={styles.rowInlineSpace}>
                  {onApproveFleetApproval ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Approve fleet request ${approval.id}`}
                      style={[styles.actionButton, !canReviewFleetApprovals ? styles.buttonDisabled : null]}
                      onPress={() => handleApproveFleetApproval(approval)}
                      disabled={!canReviewFleetApprovals}
                    >
                      <Text style={styles.actionButtonText}>Approve</Text>
                    </Pressable>
                  ) : null}
                  {onDenyFleetApproval ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Deny fleet request ${approval.id}`}
                      style={[styles.actionDangerButton, !canReviewFleetApprovals ? styles.buttonDisabled : null]}
                      onPress={() => handleDenyFleetApproval(approval)}
                      disabled={!canReviewFleetApprovals}
                    >
                      <Text style={styles.actionDangerText}>Deny</Text>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {loading ? <Text style={styles.emptyText}>Loading team members...</Text> : null}
      {!loading && identity && members.length === 0 ? <Text style={styles.emptyText}>No members found.</Text> : null}
      {!loading && identity && members.length > 0 ? (
        <View style={styles.serverCard}>
          <Text style={styles.serverName}>Member Filters</Text>
          <TextInput
            style={styles.input}
            value={memberQuery}
            onChangeText={setMemberQuery}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="search members by name or email"
            placeholderTextColor="#7f7aa8"
            accessibilityLabel="Filter team members by query"
          />
          <View style={styles.modeRow}>
            {MEMBER_ROLE_FILTER_OPTIONS.map((role) => {
              const selected = memberRoleFilter === role;
              const label = role === "all" ? "all" : role;
              return (
                <Pressable
                  key={`member-filter-${role}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter members by ${label}`}
                  style={[styles.modeButton, selected ? styles.modeButtonOn : null]}
                  onPress={() => setMemberRoleFilter(role)}
                >
                  <Text style={[styles.modeButtonText, selected ? styles.modeButtonTextOn : null]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.emptyText}>{`Showing ${visibleMembers.length} of ${members.length}`}</Text>
        </View>
      ) : null}
      {!loading && visibleMembers.length > 0 ? (
        <View style={styles.serverListWrap}>
          {visibleMembers.map((member) => (
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
      {!loading && identity && members.length > 0 && visibleMembers.length === 0 ? (
        <Text style={styles.emptyText}>No members match the current filters.</Text>
      ) : null}
    </View>
  );
}
