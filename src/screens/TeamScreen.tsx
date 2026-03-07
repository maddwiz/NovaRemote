import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { TeamBadge } from "../components/TeamBadge";
import { styles } from "../theme/styles";
import {
  ServerProfile,
  TeamAuditExportJob,
  TeamFleetApproval,
  TeamIdentity,
  TeamInvite,
  TeamMember,
  TeamRole,
  TeamSsoProvider,
  TeamSsoProviderConfig,
} from "../types";

const INVITE_ROLE_OPTIONS: TeamRole[] = ["viewer", "operator", "admin", "billing"];
const MEMBER_ROLE_OPTIONS: TeamRole[] = ["viewer", "operator", "admin", "billing"];
const MEMBER_ROLE_FILTER_OPTIONS: Array<"all" | TeamRole> = ["all", "viewer", "operator", "admin", "billing"];
const TEAM_SSO_PROVIDERS = ["oidc", "saml"] as const;

type TeamSettingsInput = {
  enforceDangerConfirm: boolean | null;
  commandBlocklist: string[];
  sessionTimeoutMinutes: number | null;
  requireSessionRecording: boolean | null;
  requireFleetApproval: boolean | null;
};

type TeamSsoProviderDraft = {
  displayName: string;
  issuerUrl: string;
  clientId: string;
};

function createEmptySsoDraft(): TeamSsoProviderDraft {
  return {
    displayName: "",
    issuerUrl: "",
    clientId: "",
  };
}

function policyValueLabel(value: boolean | null): string {
  if (value === true) {
    return "enforced on";
  }
  if (value === false) {
    return "enforced off";
  }
  return "user controlled";
}

function parseBlocklistInput(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/\r?\n|,/)
        .map((entry) => entry.trim())
        .filter(Boolean)
    )
  );
}

function formatMemberUsage(member: TeamMember): string | null {
  const sessions = member.sessionsCreated || 0;
  const commands = member.commandsSent || 0;
  const fleet = member.fleetExecutions || 0;
  const usageParts: string[] = [];
  if (sessions > 0) {
    usageParts.push(`sessions ${sessions}`);
  }
  if (commands > 0) {
    usageParts.push(`commands ${commands}`);
  }
  if (fleet > 0) {
    usageParts.push(`fleet ${fleet}`);
  }
  const hasUsage = usageParts.length > 0;
  if (member.lastActiveAt) {
    const asDate = new Date(member.lastActiveAt);
    const lastActive = Number.isNaN(asDate.getTime()) ? member.lastActiveAt : asDate.toLocaleString();
    return hasUsage ? `${usageParts.join(" • ")} • active ${lastActive}` : `active ${lastActive}`;
  }
  return hasUsage ? usageParts.join(" • ") : null;
}

function summarizeInvites(invites: TeamInvite[]) {
  return invites.reduce(
    (summary, invite) => {
      if (invite.status === "pending") {
        summary.pending += 1;
      } else if (invite.status === "accepted") {
        summary.accepted += 1;
      } else if (invite.status === "expired") {
        summary.expired += 1;
      } else if (invite.status === "revoked") {
        summary.revoked += 1;
      }
      return summary;
    },
    { pending: 0, accepted: 0, expired: 0, revoked: 0 }
  );
}

type TeamScreenProps = {
  identity: TeamIdentity | null;
  members: TeamMember[];
  planTier?: "free" | "pro" | "team" | "enterprise";
  planSeats?: number | null;
  settings?: TeamSettingsInput;
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
  canManageSettings?: boolean;
  teamServers?: ServerProfile[];
  teamInvites?: TeamInvite[];
  teamSsoProviders?: TeamSsoProviderConfig[];
  cloudDashboardUrl?: string;
  onOpenCloudDashboard?: () => void;
  onInviteMember?: (input: { email: string; role: TeamRole }) => Promise<void>;
  onRevokeInvite?: (inviteId: string) => Promise<void>;
  onUpdateSsoProvider?: (input: {
    provider: TeamSsoProvider;
    enabled: boolean;
    displayName?: string;
    issuerUrl?: string;
    authUrl?: string;
    tokenUrl?: string;
    clientId?: string;
    callbackUrl?: string;
  }) => Promise<void>;
  onChangeMemberRole?: (memberId: string, role: TeamRole) => Promise<void>;
  onSetMemberServers?: (memberId: string, serverIds: string[]) => Promise<void>;
  onUpdateSettings?: (input: TeamSettingsInput) => Promise<void>;
  fleetApprovals?: TeamFleetApproval[];
  onApproveFleetApproval?: (approvalId: string, note?: string) => Promise<void>;
  onDenyFleetApproval?: (approvalId: string, note?: string) => Promise<void>;
  onClaimFleetExecution?: (approvalId: string) => Promise<void>;
  onCompleteFleetExecution?: (input: {
    approvalId: string;
    executionToken: string;
    status: "succeeded" | "failed";
    summary?: string;
  }) => Promise<void>;
  auditPendingCount?: number;
  auditLastSyncAt?: number | null;
  onSyncAudit?: () => Promise<void>;
  onExportAuditJson?: () => Promise<void>;
  onExportAuditCsv?: () => Promise<void>;
  cloudAuditExportJob?: TeamAuditExportJob | null;
  cloudAuditExports?: TeamAuditExportJob[];
  onRequestCloudAuditExportJson?: () => Promise<void>;
  onRequestCloudAuditExportCsv?: () => Promise<void>;
  onRefreshCloudAuditExports?: () => Promise<void>;
  onRetryCloudAuditExport?: (exportId: string) => Promise<void>;
  onDeleteCloudAuditExport?: (exportId: string) => Promise<void>;
  onOpenCloudAuditExport?: (job?: TeamAuditExportJob) => void;
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
  canManageSettings = false,
  teamServers = [],
  teamInvites = [],
  teamSsoProviders = [],
  cloudDashboardUrl,
  onOpenCloudDashboard,
  onInviteMember,
  onRevokeInvite,
  onUpdateSsoProvider,
  onChangeMemberRole,
  onSetMemberServers,
  onUpdateSettings,
  fleetApprovals = [],
  onApproveFleetApproval,
  onDenyFleetApproval,
  onClaimFleetExecution,
  onCompleteFleetExecution,
  auditPendingCount = 0,
  auditLastSyncAt = null,
  onSyncAudit,
  onExportAuditJson,
  onExportAuditCsv,
  cloudAuditExportJob,
  cloudAuditExports = [],
  onRequestCloudAuditExportJson,
  onRequestCloudAuditExportCsv,
  onRefreshCloudAuditExports,
  onRetryCloudAuditExport,
  onDeleteCloudAuditExport,
  onOpenCloudAuditExport,
}: TeamScreenProps) {
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [loginMethod, setLoginMethod] = useState<"password" | "sso">("password");
  const [ssoProvider, setSsoProvider] = useState<TeamSsoProvider>("oidc");
  const [ssoToken, setSsoToken] = useState<string>("");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("viewer");
  const [inviteStatusFilter, setInviteStatusFilter] = useState<string>("");
  const [inviteRoleFilter, setInviteRoleFilter] = useState<string>("");
  const [inviteEmailFilter, setInviteEmailFilter] = useState<string>("");
  const [memberQuery, setMemberQuery] = useState<string>("");
  const [memberRoleFilter, setMemberRoleFilter] = useState<"all" | TeamRole>("all");
  const [memberServerDrafts, setMemberServerDrafts] = useState<Record<string, string[]>>({});
  const [fleetApprovalNotes, setFleetApprovalNotes] = useState<Record<string, string>>({});
  const [ssoProviderDrafts, setSsoProviderDrafts] = useState<Record<TeamSsoProvider, TeamSsoProviderDraft>>({
    oidc: createEmptySsoDraft(),
    saml: createEmptySsoDraft(),
  });
  const [policyDangerConfirm, setPolicyDangerConfirm] = useState<boolean | null>(null);
  const [policyFleetApproval, setPolicyFleetApproval] = useState<boolean | null>(null);
  const [policySessionRecording, setPolicySessionRecording] = useState<boolean | null>(null);
  const [policySessionTimeoutInput, setPolicySessionTimeoutInput] = useState<string>("");
  const [policyBlocklistInput, setPolicyBlocklistInput] = useState<string>("");
  const [teamStatus, setTeamStatus] = useState<string>("");
  const canPasswordLogin = email.trim().length > 0 && password.trim().length > 0 && !busy;
  const canSsoLogin = ssoToken.trim().length > 0 && !busy;
  const canSubmitInvite = Boolean(identity && canInvite && onInviteMember && inviteEmail.trim().length > 0 && !busy);
  const canManageInvites = Boolean(identity && (canInvite || canManage) && onRevokeInvite && !busy);
  const canManageSsoProviders = Boolean(identity && canManage && onUpdateSsoProvider && !busy);
  const canManageMemberServers = Boolean(identity && canManage && onSetMemberServers && teamServers.length > 0 && !busy);
  const canEditTeamPolicies = Boolean(identity && canManageSettings && onUpdateSettings && settings && !busy);
  const canReviewFleetApprovals = Boolean(identity && canManage && !busy && (onApproveFleetApproval || onDenyFleetApproval));
  const canClaimFleetExecution = Boolean(identity && !busy && onClaimFleetExecution);
  const canCompleteFleetExecution = Boolean(identity && !busy && onCompleteFleetExecution);
  const pendingFleetApprovals = fleetApprovals.filter((approval) => approval.status === "pending");
  const canSyncAudit = Boolean(identity && onSyncAudit && !busy);
  const canExportAuditJson = Boolean(identity && onExportAuditJson && !busy);
  const canExportAuditCsv = Boolean(identity && onExportAuditCsv && !busy);
  const canRequestCloudAuditExportJson = Boolean(identity && onRequestCloudAuditExportJson && !busy);
  const canRequestCloudAuditExportCsv = Boolean(identity && onRequestCloudAuditExportCsv && !busy);
  const canRefreshCloudAuditExports = Boolean(identity && onRefreshCloudAuditExports && !busy);
  const canRetryCloudAuditExport = Boolean(identity && onRetryCloudAuditExport && !busy);
  const canDeleteCloudAuditExport = Boolean(identity && onDeleteCloudAuditExport && !busy);
  const canOpenAnyCloudAuditExport = Boolean(identity && onOpenCloudAuditExport && !busy);
  const canOpenCloudAuditExport = Boolean(identity && cloudAuditExportJob?.downloadUrl && onOpenCloudAuditExport && !busy);
  const canOpenCloudDashboard = Boolean(identity && cloudDashboardUrl && onOpenCloudDashboard && !busy);
  const inviteSummary = useMemo(() => summarizeInvites(teamInvites), [teamInvites]);
  const pendingInvites = inviteSummary.pending;
  const filteredTeamInvites = useMemo(() => {
    const statusNeedle = inviteStatusFilter.trim().toLowerCase();
    const roleNeedle = inviteRoleFilter.trim().toLowerCase();
    const emailNeedle = inviteEmailFilter.trim().toLowerCase();
    return teamInvites.filter((invite) => {
      if (statusNeedle && !invite.status.toLowerCase().includes(statusNeedle)) {
        return false;
      }
      if (roleNeedle && !invite.role.toLowerCase().includes(roleNeedle)) {
        return false;
      }
      if (emailNeedle && !invite.email.toLowerCase().includes(emailNeedle)) {
        return false;
      }
      return true;
    });
  }, [inviteEmailFilter, inviteRoleFilter, inviteStatusFilter, teamInvites]);
  const visibleSsoProviders = TEAM_SSO_PROVIDERS.map(
    (provider) => teamSsoProviders.find((entry) => entry.provider === provider) || { provider, enabled: false }
  );
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

  useEffect(() => {
    setMemberServerDrafts((previous) => {
      const next: Record<string, string[]> = {};
      members.forEach((member) => {
        next[member.id] = previous[member.id] || member.serverIds || [];
      });
      return next;
    });
  }, [members]);

  useEffect(() => {
    setFleetApprovalNotes((previous) => {
      const next: Record<string, string> = {};
      fleetApprovals.forEach((approval) => {
        next[approval.id] = previous[approval.id] || "";
      });
      const previousKeys = Object.keys(previous);
      const nextKeys = Object.keys(next);
      if (previousKeys.length !== nextKeys.length) {
        return next;
      }
      for (const key of nextKeys) {
        if (previous[key] !== next[key]) {
          return next;
        }
      }
      return previous;
    });
  }, [fleetApprovals]);

  useEffect(() => {
    setSsoProviderDrafts((previous) => {
      let changed = false;
      const next: Record<TeamSsoProvider, TeamSsoProviderDraft> = {
        oidc: { ...previous.oidc },
        saml: { ...previous.saml },
      };
      TEAM_SSO_PROVIDERS.forEach((provider) => {
        const config = teamSsoProviders.find((entry) => entry.provider === provider);
        const draft: TeamSsoProviderDraft = {
          displayName: config?.displayName || "",
          issuerUrl: config?.issuerUrl || "",
          clientId: config?.clientId || "",
        };
        const previousDraft = previous[provider];
        if (
          !previousDraft ||
          previousDraft.displayName !== draft.displayName ||
          previousDraft.issuerUrl !== draft.issuerUrl ||
          previousDraft.clientId !== draft.clientId
        ) {
          next[provider] = draft;
          changed = true;
        }
      });
      return changed ? next : previous;
    });
  }, [teamSsoProviders]);

  useEffect(() => {
    if (!identity || !settings) {
      return;
    }
    setPolicyDangerConfirm(settings.enforceDangerConfirm);
    setPolicyFleetApproval(settings.requireFleetApproval);
    setPolicySessionRecording(settings.requireSessionRecording);
    setPolicySessionTimeoutInput(settings.sessionTimeoutMinutes ? String(settings.sessionTimeoutMinutes) : "");
    setPolicyBlocklistInput(settings.commandBlocklist.join("\n"));
  }, [identity, settings]);

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

  const handleRevokeInvite = useCallback(
    (invite: TeamInvite) => {
      if (!onRevokeInvite || !canManageInvites || invite.status !== "pending") {
        return;
      }
      setTeamStatus("");
      void onRevokeInvite(invite.id)
        .then(() => {
          setTeamStatus(`Revoked invite for ${invite.email}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canManageInvites, onRevokeInvite]
  );

  const handleToggleSsoProvider = useCallback(
    (provider: TeamSsoProvider, enabled: boolean) => {
      if (!onUpdateSsoProvider || !canManageSsoProviders) {
        return;
      }
      const draft = ssoProviderDrafts[provider] || createEmptySsoDraft();
      const displayName = draft.displayName.trim();
      const issuerUrl = draft.issuerUrl.trim();
      const clientId = draft.clientId.trim();
      setTeamStatus("");
      void onUpdateSsoProvider({
        provider,
        enabled,
        displayName: displayName || undefined,
        issuerUrl: issuerUrl || undefined,
        clientId: clientId || undefined,
      })
        .then(() => {
          setTeamStatus(`${provider.toUpperCase()} ${enabled ? "enabled" : "disabled"}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canManageSsoProviders, onUpdateSsoProvider, ssoProviderDrafts]
  );

  const handleSaveSsoProviderSettings = useCallback(
    (providerConfig: TeamSsoProviderConfig) => {
      if (!onUpdateSsoProvider || !canManageSsoProviders) {
        return;
      }
      const draft = ssoProviderDrafts[providerConfig.provider] || createEmptySsoDraft();
      const displayName = draft.displayName.trim();
      const issuerUrl = draft.issuerUrl.trim();
      const clientId = draft.clientId.trim();
      setTeamStatus("");
      void onUpdateSsoProvider({
        provider: providerConfig.provider,
        enabled: providerConfig.enabled,
        displayName: displayName || undefined,
        issuerUrl: issuerUrl || undefined,
        clientId: clientId || undefined,
      })
        .then(() => {
          setTeamStatus(`${providerConfig.provider.toUpperCase()} provider settings saved.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canManageSsoProviders, onUpdateSsoProvider, ssoProviderDrafts]
  );

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

  const selectedServerIdsForMember = useCallback(
    (member: TeamMember) => {
      return memberServerDrafts[member.id] || member.serverIds || [];
    },
    [memberServerDrafts]
  );

  const toggleMemberServerSelection = useCallback((memberId: string, serverId: string) => {
    setMemberServerDrafts((previous) => {
      const current = previous[memberId] || [];
      const exists = current.includes(serverId);
      return {
        ...previous,
        [memberId]: exists ? current.filter((id) => id !== serverId) : [...current, serverId],
      };
    });
  }, []);

  const handleSaveMemberServers = useCallback(
    (member: TeamMember) => {
      if (!onSetMemberServers || !canManageMemberServers) {
        return;
      }
      const nextServerIds = selectedServerIdsForMember(member);
      setTeamStatus("");
      void onSetMemberServers(member.id, nextServerIds)
        .then(() => {
          setTeamStatus(`Updated server access for ${member.email}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canManageMemberServers, onSetMemberServers, selectedServerIdsForMember]
  );

  const handleApproveFleetApproval = useCallback(
    (approval: TeamFleetApproval) => {
      if (!onApproveFleetApproval || !canReviewFleetApprovals) {
        return;
      }
      setTeamStatus("");
      const note = fleetApprovalNotes[approval.id]?.trim() || undefined;
      void onApproveFleetApproval(approval.id, note)
        .then(() => {
          setTeamStatus(`Approved fleet request ${approval.id}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canReviewFleetApprovals, fleetApprovalNotes, onApproveFleetApproval]
  );

  const handleDenyFleetApproval = useCallback(
    (approval: TeamFleetApproval) => {
      if (!onDenyFleetApproval || !canReviewFleetApprovals) {
        return;
      }
      setTeamStatus("");
      const note = fleetApprovalNotes[approval.id]?.trim() || undefined;
      void onDenyFleetApproval(approval.id, note)
        .then(() => {
          setTeamStatus(`Denied fleet request ${approval.id}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canReviewFleetApprovals, fleetApprovalNotes, onDenyFleetApproval]
  );

  const handleClaimFleetExecution = useCallback(
    (approval: TeamFleetApproval) => {
      if (!onClaimFleetExecution || !canClaimFleetExecution) {
        return;
      }
      setTeamStatus("");
      void onClaimFleetExecution(approval.id)
        .then(() => {
          setTeamStatus(`Claimed fleet execution ${approval.id}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canClaimFleetExecution, onClaimFleetExecution]
  );

  const handleCompleteFleetExecution = useCallback(
    (approval: TeamFleetApproval, status: "succeeded" | "failed") => {
      if (!onCompleteFleetExecution || !canCompleteFleetExecution) {
        return;
      }
      const executionToken = approval.executionToken?.trim() || "";
      if (!executionToken) {
        setTeamStatus("Execution token is required before completion.");
        return;
      }
      setTeamStatus("");
      const summary = fleetApprovalNotes[approval.id]?.trim() || undefined;
      void onCompleteFleetExecution({
        approvalId: approval.id,
        executionToken,
        status,
        summary,
      })
        .then(() => {
          setTeamStatus(`Marked fleet execution ${approval.id} as ${status}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canCompleteFleetExecution, fleetApprovalNotes, onCompleteFleetExecution]
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

  const handleOpenCloudDashboard = useCallback(() => {
    if (!onOpenCloudDashboard || !canOpenCloudDashboard) {
      return;
    }
    setTeamStatus("");
    try {
      onOpenCloudDashboard();
    } catch (error) {
      setTeamStatus(error instanceof Error ? error.message : String(error));
    }
  }, [canOpenCloudDashboard, onOpenCloudDashboard]);

  const handleRequestCloudAuditExportJson = useCallback(() => {
    if (!onRequestCloudAuditExportJson || !canRequestCloudAuditExportJson) {
      return;
    }
    setTeamStatus("");
    void onRequestCloudAuditExportJson()
      .then(() => {
        setTeamStatus("Requested cloud audit export (JSON).");
      })
      .catch((error) => {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      });
  }, [canRequestCloudAuditExportJson, onRequestCloudAuditExportJson]);

  const handleRequestCloudAuditExportCsv = useCallback(() => {
    if (!onRequestCloudAuditExportCsv || !canRequestCloudAuditExportCsv) {
      return;
    }
    setTeamStatus("");
    void onRequestCloudAuditExportCsv()
      .then(() => {
        setTeamStatus("Requested cloud audit export (CSV).");
      })
      .catch((error) => {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      });
  }, [canRequestCloudAuditExportCsv, onRequestCloudAuditExportCsv]);

  const handleRefreshCloudAuditExports = useCallback(() => {
    if (!onRefreshCloudAuditExports || !canRefreshCloudAuditExports) {
      return;
    }
    setTeamStatus("");
    void onRefreshCloudAuditExports()
      .then(() => {
        setTeamStatus("Cloud audit exports refreshed.");
      })
      .catch((error) => {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      });
  }, [canRefreshCloudAuditExports, onRefreshCloudAuditExports]);

  const handleRetryCloudAuditExport = useCallback(
    (job: TeamAuditExportJob) => {
      if (!onRetryCloudAuditExport || !canRetryCloudAuditExport) {
        return;
      }
      setTeamStatus("");
      void onRetryCloudAuditExport(job.exportId)
        .then(() => {
          setTeamStatus(`Retry queued for export ${job.exportId}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canRetryCloudAuditExport, onRetryCloudAuditExport]
  );

  const handleDeleteCloudAuditExport = useCallback(
    (job: TeamAuditExportJob) => {
      if (!onDeleteCloudAuditExport || !canDeleteCloudAuditExport) {
        return;
      }
      setTeamStatus("");
      void onDeleteCloudAuditExport(job.exportId)
        .then(() => {
          setTeamStatus(`Deleted export ${job.exportId}.`);
        })
        .catch((error) => {
          setTeamStatus(error instanceof Error ? error.message : String(error));
        });
    },
    [canDeleteCloudAuditExport, onDeleteCloudAuditExport]
  );

  const handleOpenCloudAuditExport = useCallback(
    (job?: TeamAuditExportJob) => {
      if (!onOpenCloudAuditExport || !canOpenAnyCloudAuditExport) {
        return;
      }
      if (!job && !canOpenCloudAuditExport) {
        return;
      }
      if (job && !job.downloadUrl) {
        return;
      }
      setTeamStatus("");
      try {
        onOpenCloudAuditExport(job);
      } catch (error) {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      }
    },
    [canOpenAnyCloudAuditExport, canOpenCloudAuditExport, onOpenCloudAuditExport]
  );

  const handleSaveTeamPolicies = useCallback(() => {
    if (!onUpdateSettings || !canEditTeamPolicies || !settings) {
      return;
    }
    const timeoutRaw = policySessionTimeoutInput.trim();
    let timeoutMinutes: number | null = null;
    if (timeoutRaw) {
      const parsed = Number.parseInt(timeoutRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setTeamStatus("Session timeout must be a positive number of minutes.");
        return;
      }
      timeoutMinutes = parsed;
    }

    const payload: TeamSettingsInput = {
      enforceDangerConfirm: policyDangerConfirm,
      requireFleetApproval: policyFleetApproval,
      requireSessionRecording: policySessionRecording,
      sessionTimeoutMinutes: timeoutMinutes,
      commandBlocklist: parseBlocklistInput(policyBlocklistInput),
    };
    setTeamStatus("");
    void onUpdateSettings(payload)
      .then(() => {
        setTeamStatus("Team policies updated.");
      })
      .catch((error) => {
        setTeamStatus(error instanceof Error ? error.message : String(error));
      });
  }, [
    canEditTeamPolicies,
    onUpdateSettings,
    policyBlocklistInput,
    policyDangerConfirm,
    policyFleetApproval,
    policySessionRecording,
    policySessionTimeoutInput,
    settings,
  ]);

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
            {`Danger confirm: ${policyValueLabel(settings.enforceDangerConfirm)}`}
          </Text>
          <Text style={styles.emptyText}>
            {`Session timeout: ${settings.sessionTimeoutMinutes ? `${settings.sessionTimeoutMinutes} min` : "disabled"}`}
          </Text>
          <Text style={styles.emptyText}>{`Command blocklist rules: ${settings.commandBlocklist.length}`}</Text>
          <Text style={styles.emptyText}>{`Fleet approvals pending: ${pendingFleetApprovals.length}`}</Text>
          <Text style={styles.emptyText}>{`Invites pending: ${pendingInvites}`}</Text>
          <Text style={styles.emptyText}>{`Fleet approval: ${policyValueLabel(settings.requireFleetApproval)}`}</Text>
          <Text style={styles.emptyText}>{`Session recording: ${policyValueLabel(settings.requireSessionRecording)}`}</Text>
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

      {identity && settings ? (
        <View style={styles.serverCard}>
          <Text style={styles.serverName}>Team Policies</Text>
          <Text style={styles.emptyText}>Danger confirmation policy</Text>
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set danger confirmation policy user"
              style={[styles.modeButton, policyDangerConfirm === null ? styles.modeButtonOn : null]}
              onPress={() => setPolicyDangerConfirm(null)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policyDangerConfirm === null ? styles.modeButtonTextOn : null]}>user</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set danger confirmation policy on"
              style={[styles.modeButton, policyDangerConfirm === true ? styles.modeButtonOn : null]}
              onPress={() => setPolicyDangerConfirm(true)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policyDangerConfirm === true ? styles.modeButtonTextOn : null]}>enforce on</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set danger confirmation policy off"
              style={[styles.modeButton, policyDangerConfirm === false ? styles.modeButtonOn : null]}
              onPress={() => setPolicyDangerConfirm(false)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policyDangerConfirm === false ? styles.modeButtonTextOn : null]}>enforce off</Text>
            </Pressable>
          </View>

          <Text style={styles.emptyText}>Fleet approval policy</Text>
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set fleet approval policy user"
              style={[styles.modeButton, policyFleetApproval === null ? styles.modeButtonOn : null]}
              onPress={() => setPolicyFleetApproval(null)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policyFleetApproval === null ? styles.modeButtonTextOn : null]}>user</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set fleet approval policy on"
              style={[styles.modeButton, policyFleetApproval === true ? styles.modeButtonOn : null]}
              onPress={() => setPolicyFleetApproval(true)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policyFleetApproval === true ? styles.modeButtonTextOn : null]}>enforce on</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set fleet approval policy off"
              style={[styles.modeButton, policyFleetApproval === false ? styles.modeButtonOn : null]}
              onPress={() => setPolicyFleetApproval(false)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policyFleetApproval === false ? styles.modeButtonTextOn : null]}>enforce off</Text>
            </Pressable>
          </View>

          <Text style={styles.emptyText}>Session recording policy</Text>
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set session recording policy user"
              style={[styles.modeButton, policySessionRecording === null ? styles.modeButtonOn : null]}
              onPress={() => setPolicySessionRecording(null)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policySessionRecording === null ? styles.modeButtonTextOn : null]}>user</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set session recording policy on"
              style={[styles.modeButton, policySessionRecording === true ? styles.modeButtonOn : null]}
              onPress={() => setPolicySessionRecording(true)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policySessionRecording === true ? styles.modeButtonTextOn : null]}>enforce on</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Set session recording policy off"
              style={[styles.modeButton, policySessionRecording === false ? styles.modeButtonOn : null]}
              onPress={() => setPolicySessionRecording(false)}
              disabled={!canEditTeamPolicies}
            >
              <Text style={[styles.modeButtonText, policySessionRecording === false ? styles.modeButtonTextOn : null]}>enforce off</Text>
            </Pressable>
          </View>

          <TextInput
            style={styles.input}
            value={policySessionTimeoutInput}
            onChangeText={setPolicySessionTimeoutInput}
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="session timeout minutes (blank disables)"
            placeholderTextColor="#7f7aa8"
            editable={canEditTeamPolicies}
            accessibilityLabel="Team session timeout minutes"
          />
          <TextInput
            style={[styles.input, { minHeight: 72, textAlignVertical: "top" }]}
            value={policyBlocklistInput}
            onChangeText={setPolicyBlocklistInput}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
            placeholder="command blocklist patterns (one per line)"
            placeholderTextColor="#7f7aa8"
            editable={canEditTeamPolicies}
            accessibilityLabel="Team command blocklist patterns"
          />
          {canEditTeamPolicies ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Save team policies"
              style={[styles.buttonPrimary, busy ? styles.buttonDisabled : null]}
              onPress={handleSaveTeamPolicies}
              disabled={busy}
            >
              <Text style={styles.buttonPrimaryText}>{busy ? "Saving..." : "Save Policies"}</Text>
            </Pressable>
          ) : (
            <Text style={styles.emptyText}>Managed by team admin.</Text>
          )}
        </View>
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

      {identity && teamInvites.length > 0 ? (
        <View style={styles.serverCard}>
          <Text style={styles.serverName}>{`Team Invites (${pendingInvites} pending)`}</Text>
          <Text style={styles.emptyText}>
            {`Invite summary: pending ${inviteSummary.pending} • accepted ${inviteSummary.accepted} • expired ${inviteSummary.expired} • revoked ${inviteSummary.revoked}`}
          </Text>
          <View style={styles.serverFiltersRow}>
            <TextInput
              style={[styles.input, styles.serverFilterInput]}
              value={inviteStatusFilter}
              onChangeText={setInviteStatusFilter}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="filter status"
              placeholderTextColor="#7f7aa8"
              accessibilityLabel="Filter invites by status"
            />
            <TextInput
              style={[styles.input, styles.serverFilterInput]}
              value={inviteRoleFilter}
              onChangeText={setInviteRoleFilter}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="filter role"
              placeholderTextColor="#7f7aa8"
              accessibilityLabel="Filter invites by role"
            />
            <TextInput
              style={[styles.input, styles.serverFilterInput]}
              value={inviteEmailFilter}
              onChangeText={setInviteEmailFilter}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="filter email"
              placeholderTextColor="#7f7aa8"
              accessibilityLabel="Filter invites by email"
            />
          </View>
          {filteredTeamInvites.length === 0 ? <Text style={styles.emptyText}>No invites match current filters.</Text> : null}
          {filteredTeamInvites.map((invite) => (
            <View key={invite.id} style={styles.panel}>
              <Text style={styles.emptyText}>{`${invite.email} • ${invite.role} • ${invite.status}`}</Text>
              {invite.expiresAt ? (
                <Text style={styles.emptyText}>{`Expires ${new Date(invite.expiresAt).toLocaleString()}`}</Text>
              ) : null}
              {invite.inviteCode ? <Text style={styles.emptyText}>{`Code: ${invite.inviteCode}`}</Text> : null}
              {invite.status === "pending" && canManageInvites ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Revoke invite ${invite.id}`}
                  style={styles.actionDangerButton}
                  onPress={() => handleRevokeInvite(invite)}
                >
                  <Text style={styles.actionDangerText}>Revoke Invite</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {identity && cloudDashboardUrl ? (
        <View style={styles.serverCard}>
          <Text style={styles.serverName}>Cloud Dashboard</Text>
          <Text style={styles.emptyText}>{cloudDashboardUrl}</Text>
          {onOpenCloudDashboard ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open cloud dashboard"
              style={[styles.actionButton, !canOpenCloudDashboard ? styles.buttonDisabled : null]}
              onPress={handleOpenCloudDashboard}
              disabled={!canOpenCloudDashboard}
            >
              <Text style={styles.actionButtonText}>Open Dashboard</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {identity && (visibleSsoProviders.length > 0 || canManageSsoProviders) ? (
        <View style={styles.serverCard}>
          <Text style={styles.serverName}>SSO Providers</Text>
          {visibleSsoProviders.map((providerConfig) => {
            const draft = ssoProviderDrafts[providerConfig.provider] || createEmptySsoDraft();
            return (
              <View key={providerConfig.provider} style={styles.panel}>
              <Text style={styles.serverSubtitle}>
                {`${providerConfig.provider.toUpperCase()} • ${providerConfig.enabled ? "enabled" : "disabled"}`}
              </Text>
              {providerConfig.issuerUrl ? <Text style={styles.emptyText}>{providerConfig.issuerUrl}</Text> : null}
              {providerConfig.clientId ? <Text style={styles.emptyText}>{`Client ID: ${providerConfig.clientId}`}</Text> : null}
              <TextInput
                style={styles.input}
                value={draft.displayName}
                onChangeText={(value) =>
                  setSsoProviderDrafts((previous) => ({
                    ...previous,
                    [providerConfig.provider]: {
                      ...(previous[providerConfig.provider] || createEmptySsoDraft()),
                      displayName: value,
                    },
                  }))
                }
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Display name"
                placeholderTextColor="#7f7aa8"
                editable={canManageSsoProviders}
                accessibilityLabel={`${providerConfig.provider.toUpperCase()} display name`}
              />
              <TextInput
                style={styles.input}
                value={draft.issuerUrl}
                onChangeText={(value) =>
                  setSsoProviderDrafts((previous) => ({
                    ...previous,
                    [providerConfig.provider]: {
                      ...(previous[providerConfig.provider] || createEmptySsoDraft()),
                      issuerUrl: value,
                    },
                  }))
                }
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Issuer URL"
                placeholderTextColor="#7f7aa8"
                editable={canManageSsoProviders}
                accessibilityLabel={`${providerConfig.provider.toUpperCase()} issuer URL`}
              />
              <TextInput
                style={styles.input}
                value={draft.clientId}
                onChangeText={(value) =>
                  setSsoProviderDrafts((previous) => ({
                    ...previous,
                    [providerConfig.provider]: {
                      ...(previous[providerConfig.provider] || createEmptySsoDraft()),
                      clientId: value,
                    },
                  }))
                }
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Client ID"
                placeholderTextColor="#7f7aa8"
                editable={canManageSsoProviders}
                accessibilityLabel={`${providerConfig.provider.toUpperCase()} client ID`}
              />
              <View style={styles.rowInlineSpace}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Enable ${providerConfig.provider} provider`}
                  style={[
                    styles.actionButton,
                    providerConfig.enabled || !canManageSsoProviders ? styles.buttonDisabled : null,
                  ]}
                  onPress={() => handleToggleSsoProvider(providerConfig.provider, true)}
                  disabled={providerConfig.enabled || !canManageSsoProviders}
                >
                  <Text style={styles.actionButtonText}>Enable</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Disable ${providerConfig.provider} provider`}
                  style={[
                    styles.actionDangerButton,
                    !providerConfig.enabled || !canManageSsoProviders ? styles.buttonDisabled : null,
                  ]}
                  onPress={() => handleToggleSsoProvider(providerConfig.provider, false)}
                  disabled={!providerConfig.enabled || !canManageSsoProviders}
                >
                  <Text style={styles.actionDangerText}>Disable</Text>
                </Pressable>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Save ${providerConfig.provider} provider settings`}
                style={[styles.actionButton, !canManageSsoProviders ? styles.buttonDisabled : null]}
                onPress={() => handleSaveSsoProviderSettings(providerConfig)}
                disabled={!canManageSsoProviders}
              >
                <Text style={styles.actionButtonText}>Save Provider</Text>
              </Pressable>
              </View>
            );
          })}
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

      {identity ? (
        <View style={styles.serverCard}>
          <Text style={styles.serverName}>Cloud Audit Exports</Text>
          {cloudAuditExportJob ? (
            <>
              <Text style={styles.emptyText}>
                {`Last export: ${cloudAuditExportJob.format.toUpperCase()} • ${cloudAuditExportJob.status}`}
              </Text>
              <Text style={styles.emptyText}>
                {`Created: ${new Date(cloudAuditExportJob.createdAt).toLocaleString()}`}
              </Text>
              {cloudAuditExportJob.expiresAt ? (
                <Text style={styles.emptyText}>
                  {`Expires: ${new Date(cloudAuditExportJob.expiresAt).toLocaleString()}`}
                </Text>
              ) : null}
              {cloudAuditExportJob.detail ? <Text style={styles.emptyText}>{cloudAuditExportJob.detail}</Text> : null}
            </>
          ) : (
            <Text style={styles.emptyText}>No cloud exports requested yet.</Text>
          )}
          <View style={styles.rowInlineSpace}>
            {onRequestCloudAuditExportJson ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Request cloud audit export as JSON"
                style={[styles.actionButton, !canRequestCloudAuditExportJson ? styles.buttonDisabled : null]}
                onPress={handleRequestCloudAuditExportJson}
                disabled={!canRequestCloudAuditExportJson}
              >
                <Text style={styles.actionButtonText}>Request JSON</Text>
              </Pressable>
            ) : null}
            {onRequestCloudAuditExportCsv ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Request cloud audit export as CSV"
                style={[styles.actionButton, !canRequestCloudAuditExportCsv ? styles.buttonDisabled : null]}
                onPress={handleRequestCloudAuditExportCsv}
                disabled={!canRequestCloudAuditExportCsv}
              >
                <Text style={styles.actionButtonText}>Request CSV</Text>
              </Pressable>
            ) : null}
            {onRefreshCloudAuditExports ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh cloud audit exports"
                style={[styles.actionButton, !canRefreshCloudAuditExports ? styles.buttonDisabled : null]}
                onPress={handleRefreshCloudAuditExports}
                disabled={!canRefreshCloudAuditExports}
              >
                <Text style={styles.actionButtonText}>Refresh</Text>
              </Pressable>
            ) : null}
            {onOpenCloudAuditExport ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Open latest cloud audit export"
                style={[styles.actionButton, !canOpenCloudAuditExport ? styles.buttonDisabled : null]}
                onPress={() => handleOpenCloudAuditExport()}
                disabled={!canOpenCloudAuditExport}
              >
                <Text style={styles.actionButtonText}>Open Export</Text>
              </Pressable>
            ) : null}
          </View>
          {cloudAuditExports.length > 0 ? (
            <View style={styles.serverCard}>
              <Text style={styles.serverSubtitle}>Recent Exports</Text>
              {cloudAuditExports.map((job) => (
                <View key={job.exportId} style={styles.panel}>
                  <Text style={styles.emptyText}>
                    {`${job.exportId} • ${job.format.toUpperCase()} • ${job.status}`}
                  </Text>
                  <Text style={styles.emptyText}>{`Created ${new Date(job.createdAt).toLocaleString()}`}</Text>
                  {job.readyAt ? <Text style={styles.emptyText}>{`Ready ${new Date(job.readyAt).toLocaleString()}`}</Text> : null}
                  {job.failedAt ? <Text style={styles.emptyText}>{`Failed ${new Date(job.failedAt).toLocaleString()}`}</Text> : null}
                  {job.rangeHours ? <Text style={styles.emptyText}>{`Range ${job.rangeHours}h`}</Text> : null}
                  {typeof job.eventCount === "number" ? <Text style={styles.emptyText}>{`Events ${job.eventCount}`}</Text> : null}
                  {typeof job.attemptCount === "number" ? <Text style={styles.emptyText}>{`Attempts ${job.attemptCount}`}</Text> : null}
                  {job.detail ? <Text style={styles.emptyText}>{job.detail}</Text> : null}
                  {job.downloadUrl ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open cloud audit export ${job.exportId}`}
                      style={[styles.actionButton, !canOpenAnyCloudAuditExport ? styles.buttonDisabled : null]}
                      onPress={() => handleOpenCloudAuditExport(job)}
                      disabled={!canOpenAnyCloudAuditExport}
                    >
                      <Text style={styles.actionButtonText}>Open</Text>
                    </Pressable>
                  ) : null}
                  {job.status === "failed" && onRetryCloudAuditExport ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Retry cloud audit export ${job.exportId}`}
                      style={[styles.actionButton, !canRetryCloudAuditExport ? styles.buttonDisabled : null]}
                      onPress={() => handleRetryCloudAuditExport(job)}
                      disabled={!canRetryCloudAuditExport}
                    >
                      <Text style={styles.actionButtonText}>Retry</Text>
                    </Pressable>
                  ) : null}
                  {onDeleteCloudAuditExport ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete cloud audit export ${job.exportId}`}
                      style={[styles.actionDangerButton, !canDeleteCloudAuditExport ? styles.buttonDisabled : null]}
                      onPress={() => handleDeleteCloudAuditExport(job)}
                      disabled={!canDeleteCloudAuditExport}
                    >
                      <Text style={styles.actionDangerText}>Delete</Text>
                    </Pressable>
                  ) : null}
                </View>
              ))}
            </View>
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
              {approval.reviewedByEmail ? (
                <Text style={styles.emptyText}>
                  {`Reviewed by ${approval.reviewedByEmail}${approval.reviewedAt ? ` • ${new Date(approval.reviewedAt).toLocaleString()}` : ""}`}
                </Text>
              ) : null}
              {approval.executionClaimedByEmail ? (
                <Text style={styles.emptyText}>
                  {`Claimed by ${approval.executionClaimedByEmail}${approval.executionClaimedAt ? ` • ${new Date(approval.executionClaimedAt).toLocaleString()}` : ""}`}
                </Text>
              ) : null}
              {approval.executionCompletedByEmail ? (
                <Text style={styles.emptyText}>
                  {`Completed ${approval.executionResult || "done"} by ${approval.executionCompletedByEmail}${approval.executionCompletedAt ? ` • ${new Date(approval.executionCompletedAt).toLocaleString()}` : ""}`}
                </Text>
              ) : null}
              {approval.executionSummary ? <Text style={styles.emptyText}>{`Execution summary: ${approval.executionSummary}`}</Text> : null}
              {approval.executionToken ? <Text style={styles.emptyText}>{`Execution token: ${approval.executionToken}`}</Text> : null}
              {approval.status === "pending" ? (
                <View style={styles.rowInlineSpace}>
                  <TextInput
                    style={styles.input}
                    value={fleetApprovalNotes[approval.id] || ""}
                    onChangeText={(text) =>
                      setFleetApprovalNotes((previous) => ({
                        ...previous,
                        [approval.id]: text,
                      }))
                    }
                    autoCapitalize="sentences"
                    autoCorrect
                    placeholder="review note (optional)"
                    placeholderTextColor="#7f7aa8"
                    editable={canReviewFleetApprovals}
                    accessibilityLabel={`Fleet approval note ${approval.id}`}
                  />
                  {identity?.userId === approval.requestedByUserId ? (
                    <Text style={styles.emptyText}>Self-approval is blocked. Another team member must approve.</Text>
                  ) : null}
                  {onApproveFleetApproval ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Approve fleet request ${approval.id}`}
                      style={[
                        styles.actionButton,
                        !canReviewFleetApprovals || identity?.userId === approval.requestedByUserId
                          ? styles.buttonDisabled
                          : null,
                      ]}
                      onPress={() => handleApproveFleetApproval(approval)}
                      disabled={!canReviewFleetApprovals || identity?.userId === approval.requestedByUserId}
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
              {approval.status === "approved" && !approval.executionClaimedAt && onClaimFleetExecution ? (
                <View style={styles.rowInlineSpace}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Claim fleet execution ${approval.id}`}
                    style={[styles.actionButton, !canClaimFleetExecution ? styles.buttonDisabled : null]}
                    onPress={() => handleClaimFleetExecution(approval)}
                    disabled={!canClaimFleetExecution}
                  >
                    <Text style={styles.actionButtonText}>Claim Execution</Text>
                  </Pressable>
                </View>
              ) : null}
              {approval.status === "approved" &&
              Boolean(approval.executionClaimedAt) &&
              !approval.executionCompletedAt &&
              onCompleteFleetExecution ? (
                <View style={styles.rowInlineSpace}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark fleet execution ${approval.id} succeeded`}
                    style={[styles.actionButton, !canCompleteFleetExecution ? styles.buttonDisabled : null]}
                    onPress={() => handleCompleteFleetExecution(approval, "succeeded")}
                    disabled={!canCompleteFleetExecution}
                  >
                    <Text style={styles.actionButtonText}>Mark Succeeded</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Mark fleet execution ${approval.id} failed`}
                    style={[styles.actionDangerButton, !canCompleteFleetExecution ? styles.buttonDisabled : null]}
                    onPress={() => handleCompleteFleetExecution(approval, "failed")}
                    disabled={!canCompleteFleetExecution}
                  >
                    <Text style={styles.actionDangerText}>Mark Failed</Text>
                  </Pressable>
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
          {visibleMembers.map((member) => {
            const usageText = formatMemberUsage(member);
            return (
              <View key={member.id} style={styles.serverCard}>
                <Text style={styles.serverName}>{member.name}</Text>
                <Text style={styles.serverUrl}>{member.email}</Text>
                <Text style={styles.emptyText}>{`Role: ${member.role}`}</Text>
                {usageText ? <Text style={styles.emptyText}>{`Usage: ${usageText}`}</Text> : null}
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
                {canManageMemberServers ? (
                  <View style={styles.serverCard}>
                    <Text style={styles.serverSubtitle}>Server Access</Text>
                    <View style={styles.modeRow}>
                      {teamServers.map((server) => {
                        const selected = selectedServerIdsForMember(member).includes(server.id);
                        return (
                          <Pressable
                            key={`${member.id}:${server.id}`}
                            accessibilityRole="button"
                            accessibilityLabel={`Toggle ${member.email} access to ${server.name}`}
                            style={[styles.modeButton, selected ? styles.modeButtonOn : null]}
                            onPress={() => toggleMemberServerSelection(member.id, server.id)}
                          >
                            <Text style={[styles.modeButtonText, selected ? styles.modeButtonTextOn : null]}>{server.name}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Save server access for ${member.email}`}
                      style={[styles.actionButton, busy ? styles.buttonDisabled : null]}
                      onPress={() => handleSaveMemberServers(member)}
                      disabled={busy}
                    >
                      <Text style={styles.actionButtonText}>{busy ? "Saving..." : "Save Server Access"}</Text>
                    </Pressable>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
      {!loading && identity && members.length > 0 && visibleMembers.length === 0 ? (
        <Text style={styles.emptyText}>No members match the current filters.</Text>
      ) : null}
    </View>
  );
}
