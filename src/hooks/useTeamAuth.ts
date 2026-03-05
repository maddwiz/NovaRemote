import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import { cloudRequest, getNovaCloudUrl } from "../api/cloudClient";
import {
  DEFAULT_CWD,
  DEFAULT_TERMINAL_BACKEND,
  STORAGE_TEAM_IDENTITY,
  TEAM_TOKEN_REFRESH_BUFFER_MS,
  TEAM_TOKEN_REFRESH_INTERVAL_MS,
} from "../constants";
import { normalizeCommandBlocklist, normalizeSessionTimeoutMinutes } from "../teamPolicy";
import {
  ServerProfile,
  TeamInvite,
  TeamInviteStatus,
  TeamAuthProvider,
  TeamFleetApproval,
  TeamIdentity,
  TeamMember,
  TeamPermission,
  TeamRole,
} from "../types";

const TEAM_PROVIDERS: TeamAuthProvider[] = ["novaremote_cloud", "saml", "oidc", "ldap_proxy"];
const TEAM_ROLES: TeamRole[] = ["admin", "operator", "viewer", "billing"];
const TEAM_INVITE_STATUSES: TeamInviteStatus[] = ["pending", "accepted", "expired", "revoked"];
const TEAM_PERMISSIONS: TeamPermission[] = [
  "servers:read",
  "servers:write",
  "servers:delete",
  "sessions:create",
  "sessions:send",
  "sessions:view",
  "fleet:execute",
  "settings:manage",
  "team:invite",
  "team:manage",
  "audit:read",
];

type UseTeamAuthArgs = {
  enabled?: boolean;
  cloudUrl?: string;
  fetchImpl?: typeof fetch;
  onError?: (error: unknown) => void;
};

type TeamAuthResponse = {
  identity?: unknown;
} & Record<string, unknown>;

type TeamSettings = {
  enforceDangerConfirm: boolean | null;
  commandBlocklist: string[];
  sessionTimeoutMinutes: number | null;
  requireSessionRecording: boolean | null;
  requireFleetApproval: boolean | null;
};

type TeamSettingsUpdate = {
  enforceDangerConfirm?: boolean | null;
  commandBlocklist?: string[];
  sessionTimeoutMinutes?: number | null;
  requireSessionRecording?: boolean | null;
  requireFleetApproval?: boolean | null;
};

type TeamUsage = {
  activeMembers: number;
  sessionsCreated: number;
  commandsSent: number;
  fleetExecutions: number;
};

type TeamInviteResult = TeamInvite;

type TeamSsoProvider = "saml" | "oidc";

function defaultTeamSettings(): TeamSettings {
  return {
    enforceDangerConfirm: null,
    commandBlocklist: [],
    sessionTimeoutMinutes: null,
    requireSessionRecording: null,
    requireFleetApproval: null,
  };
}

export function normalizeTeamIdentity(value: unknown): TeamIdentity | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Record<string, unknown>;

  const provider = normalizeProvider(parsed.provider);
  const userId = normalizeRequiredString(parsed.userId);
  const email = normalizeRequiredString(parsed.email);
  const displayName = normalizeRequiredString(parsed.displayName);
  const teamId = normalizeRequiredString(parsed.teamId);
  const teamName = normalizeRequiredString(parsed.teamName);
  const role = normalizeRole(parsed.role);
  const accessToken = normalizeRequiredString(parsed.accessToken);
  const refreshToken = normalizeRequiredString(parsed.refreshToken);
  const tokenExpiresAt = normalizeExpiresAt(parsed.tokenExpiresAt);
  const permissions = normalizePermissions(parsed.permissions);

  if (!userId || !email || !displayName || !teamId || !teamName || !role || !accessToken || !refreshToken || !tokenExpiresAt) {
    return null;
  }

  return {
    provider,
    userId,
    email,
    displayName,
    avatarUrl: normalizeOptionalString(parsed.avatarUrl),
    teamId,
    teamName,
    role,
    permissions,
    accessToken,
    tokenExpiresAt,
    refreshToken,
  };
}

export function shouldRefreshTeamIdentity(identity: TeamIdentity | null, nowMs: number, refreshBufferMs: number): boolean {
  if (!identity) {
    return false;
  }
  return identity.tokenExpiresAt - nowMs <= refreshBufferMs;
}

function normalizeProvider(value: unknown): TeamAuthProvider {
  if (typeof value !== "string") {
    return "novaremote_cloud";
  }
  const normalized = value.trim().toLowerCase();
  return TEAM_PROVIDERS.includes(normalized as TeamAuthProvider)
    ? (normalized as TeamAuthProvider)
    : "novaremote_cloud";
}

function normalizeRole(value: unknown): TeamRole | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return TEAM_ROLES.includes(normalized as TeamRole) ? (normalized as TeamRole) : null;
}

function normalizePermissions(value: unknown): TeamPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Set<TeamPermission>();
  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }
    const normalized = entry.trim().toLowerCase() as TeamPermission;
    if (TEAM_PERMISSIONS.includes(normalized)) {
      deduped.add(normalized);
    }
  });
  return Array.from(deduped.values());
}

function normalizeExpiresAt(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string" && value.trim()) {
    const maybeNumber = Number.parseInt(value, 10);
    if (Number.isFinite(maybeNumber) && maybeNumber > 0) {
      return maybeNumber;
    }
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate) && asDate > 0) {
      return asDate;
    }
  }
  return null;
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = normalizeRequiredString(value);
  return normalized || undefined;
}

function parseTeamAuthIdentity(payload: TeamAuthResponse): TeamIdentity | null {
  if (payload.identity && typeof payload.identity === "object") {
    const nested = normalizeTeamIdentity(payload.identity);
    if (nested) {
      return nested;
    }
  }
  return normalizeTeamIdentity(payload);
}

function normalizeTeamServer(value: unknown): ServerProfile | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const id = normalizeRequiredString(parsed.id);
  const name = normalizeRequiredString(parsed.name);
  const baseUrl = normalizeBaseUrl(normalizeRequiredString(parsed.baseUrl));
  const defaultCwd = normalizeOptionalString(parsed.defaultCwd) || DEFAULT_CWD;
  const token = normalizeOptionalString(parsed.token) || "";
  if (!id || !name || !baseUrl) {
    return null;
  }

  const permissionLevelRaw = normalizeRequiredString(parsed.permissionLevel).toLowerCase();
  const permissionLevel =
    permissionLevelRaw === "admin" || permissionLevelRaw === "operator" || permissionLevelRaw === "viewer"
      ? permissionLevelRaw
      : "viewer";

  return {
    id,
    name,
    baseUrl,
    token,
    defaultCwd,
    source: "team",
    teamServerId: normalizeOptionalString(parsed.teamServerId) || id,
    permissionLevel,
    terminalBackend: DEFAULT_TERMINAL_BACKEND,
    vmHost: normalizeOptionalString(parsed.vmHost),
    vmType: normalizeOptionalString(parsed.vmType) as ServerProfile["vmType"],
    vmName: normalizeOptionalString(parsed.vmName),
    vmId: normalizeOptionalString(parsed.vmId),
    sshHost: normalizeOptionalString(parsed.sshHost),
    sshUser: normalizeOptionalString(parsed.sshUser),
    sshPort: typeof parsed.sshPort === "number" ? parsed.sshPort : undefined,
    portainerUrl: normalizeOptionalString(parsed.portainerUrl),
    proxmoxUrl: normalizeOptionalString(parsed.proxmoxUrl),
    grafanaUrl: normalizeOptionalString(parsed.grafanaUrl),
  };
}

function normalizeTeamServers(value: unknown): ServerProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Map<string, ServerProfile>();
  value.forEach((entry) => {
    const normalized = normalizeTeamServer(entry);
    if (normalized) {
      deduped.set(normalized.id, normalized);
    }
  });
  return Array.from(deduped.values());
}

function normalizeTeamSettings(value: unknown): TeamSettings {
  if (!value || typeof value !== "object") {
    return defaultTeamSettings();
  }
  const parsed = value as Record<string, unknown>;
  const enforceDangerConfirm =
    typeof parsed.enforceDangerConfirm === "boolean"
      ? parsed.enforceDangerConfirm
      : typeof parsed.requireDangerConfirm === "boolean"
        ? parsed.requireDangerConfirm
        : null;
  const requireSessionRecording =
    typeof parsed.requireSessionRecording === "boolean"
      ? parsed.requireSessionRecording
      : typeof parsed.enforceSessionRecording === "boolean"
        ? parsed.enforceSessionRecording
        : typeof parsed.mandatorySessionRecording === "boolean"
          ? parsed.mandatorySessionRecording
          : null;
  const requireFleetApproval =
    typeof parsed.requireFleetApproval === "boolean"
      ? parsed.requireFleetApproval
      : typeof parsed.fleetApprovalRequired === "boolean"
        ? parsed.fleetApprovalRequired
        : typeof parsed.enforceFleetApproval === "boolean"
          ? parsed.enforceFleetApproval
          : null;
  const commandBlocklist = normalizeCommandBlocklist(
    parsed.commandBlocklist || parsed.commandBlockList || parsed.blockedCommands || parsed.commandDenylist
  );
  const sessionTimeoutMinutes = normalizeSessionTimeoutMinutes(
    parsed.sessionTimeoutMinutes || parsed.sessionTimeoutMin || parsed.inactivityTimeoutMinutes
  );
  return {
    enforceDangerConfirm,
    commandBlocklist,
    sessionTimeoutMinutes,
    requireSessionRecording,
    requireFleetApproval,
  };
}

function normalizeTeamUsage(value: unknown): TeamUsage {
  if (!value || typeof value !== "object") {
    return {
      activeMembers: 0,
      sessionsCreated: 0,
      commandsSent: 0,
      fleetExecutions: 0,
    };
  }
  const parsed = value as Record<string, unknown>;
  const activeMembers = normalizeCount(
    parsed.activeMembers ?? parsed.active_members ?? parsed.membersActive ?? parsed.members_count ?? parsed.memberCount
  );
  const sessionsCreated = normalizeCount(
    parsed.sessionsCreated ?? parsed.sessions_created ?? parsed.sessions ?? parsed.sessionCount ?? parsed.sessions_count
  );
  const commandsSent = normalizeCount(
    parsed.commandsSent ?? parsed.commands_sent ?? parsed.commands ?? parsed.commandCount ?? parsed.commands_count
  );
  const fleetExecutions = normalizeCount(
    parsed.fleetExecutions ?? parsed.fleet_executions ?? parsed.fleetRuns ?? parsed.fleet_runs ?? parsed.fleetCount
  );
  return {
    activeMembers,
    sessionsCreated,
    commandsSent,
    fleetExecutions,
  };
}

function normalizeCount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
}

function normalizeTeamMember(value: unknown): TeamMember | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const id = normalizeRequiredString(parsed.id);
  const name = normalizeRequiredString(parsed.name);
  const email = normalizeRequiredString(parsed.email);
  const roleRaw = normalizeRequiredString(parsed.role).toLowerCase();
  const role =
    roleRaw === "admin" || roleRaw === "operator" || roleRaw === "viewer" || roleRaw === "billing"
      ? (roleRaw as TeamRole)
      : "viewer";
  const rawServerIds = parsed.serverIds ?? parsed.server_ids;
  const serverIds = Array.isArray(rawServerIds)
    ? rawServerIds.map((entry: unknown) => normalizeRequiredString(entry)).filter(Boolean)
    : [];
  const sessionsCreated = normalizeCount(
    parsed.sessionsCreated ?? parsed.sessions_created ?? parsed.sessions ?? parsed.sessionCount ?? parsed.sessions_count
  );
  const commandsSent = normalizeCount(
    parsed.commandsSent ?? parsed.commands_sent ?? parsed.commands ?? parsed.commandCount ?? parsed.commands_count
  );
  const fleetExecutions = normalizeCount(
    parsed.fleetExecutions ?? parsed.fleet_executions ?? parsed.fleetRuns ?? parsed.fleet_runs ?? parsed.fleetCount
  );
  const lastActiveAt = normalizeOptionalString(parsed.lastActiveAt || parsed.last_active_at);
  if (!id || !name || !email) {
    return null;
  }
  return {
    id,
    name,
    email,
    role,
    serverIds,
    sessionsCreated,
    commandsSent,
    fleetExecutions,
    lastActiveAt,
  };
}

function normalizeTeamMembers(value: unknown): TeamMember[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const byId = new Map<string, TeamMember>();
  value.forEach((entry) => {
    const normalized = normalizeTeamMember(entry);
    if (normalized) {
      const previous = byId.get(normalized.id);
      const nextServerIds =
        normalized.serverIds && normalized.serverIds.length > 0 ? normalized.serverIds : previous?.serverIds || [];
      byId.set(normalized.id, {
        ...normalized,
        serverIds: nextServerIds,
        sessionsCreated:
          normalized.sessionsCreated && normalized.sessionsCreated > 0
            ? normalized.sessionsCreated
            : previous?.sessionsCreated || 0,
        commandsSent:
          normalized.commandsSent && normalized.commandsSent > 0 ? normalized.commandsSent : previous?.commandsSent || 0,
        fleetExecutions:
          normalized.fleetExecutions && normalized.fleetExecutions > 0
            ? normalized.fleetExecutions
            : previous?.fleetExecutions || 0,
        lastActiveAt: normalized.lastActiveAt || previous?.lastActiveAt,
      });
    }
  });
  return Array.from(byId.values());
}

function normalizeInviteStatus(value: unknown): TeamInviteStatus {
  const normalized = normalizeRequiredString(value).toLowerCase();
  if (TEAM_INVITE_STATUSES.includes(normalized as TeamInviteStatus)) {
    return normalized as TeamInviteStatus;
  }
  return "pending";
}

function normalizeTeamInvite(value: unknown): TeamInvite | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const id =
    normalizeOptionalString(parsed.id) ||
    normalizeOptionalString(parsed.inviteId) ||
    normalizeOptionalString(parsed.invite_id);
  const email = normalizeRequiredString(parsed.email).toLowerCase();
  const role = normalizeRole(parsed.role) || "viewer";
  const createdAt =
    normalizeOptionalString(parsed.createdAt) ||
    normalizeOptionalString(parsed.created_at) ||
    new Date().toISOString();
  if (!id || !email) {
    return null;
  }
  return {
    id,
    email,
    role,
    status: normalizeInviteStatus(parsed.status),
    inviteCode: normalizeOptionalString(parsed.inviteCode || parsed.code),
    inviteLink: normalizeOptionalString(parsed.inviteLink || parsed.url),
    createdAt,
    expiresAt: normalizeOptionalString(parsed.expiresAt || parsed.expires_at),
    revokedAt: normalizeOptionalString(parsed.revokedAt || parsed.revoked_at),
  };
}

function normalizeTeamInvites(value: unknown): TeamInvite[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Map<string, TeamInvite>();
  value.forEach((entry) => {
    const normalized = normalizeTeamInvite(entry);
    if (normalized) {
      deduped.set(normalized.id, normalized);
    }
  });
  return Array.from(deduped.values()).sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") {
      return -1;
    }
    if (a.status !== "pending" && b.status === "pending") {
      return 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function normalizeFleetApprovalStatus(value: unknown): TeamFleetApproval["status"] {
  const raw = normalizeRequiredString(value).toLowerCase();
  if (raw === "approved" || raw === "denied" || raw === "expired") {
    return raw;
  }
  return "pending";
}

function normalizeFleetApproval(value: unknown): TeamFleetApproval | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const id = normalizeRequiredString(parsed.id);
  const command = normalizeRequiredString(parsed.command);
  const requestedByUserId = normalizeRequiredString(parsed.requestedByUserId || parsed.requested_by_user_id);
  const requestedByEmail = normalizeRequiredString(parsed.requestedByEmail || parsed.requested_by_email);
  const createdAt = normalizeRequiredString(parsed.createdAt || parsed.created_at);
  const updatedAt = normalizeRequiredString(parsed.updatedAt || parsed.updated_at) || createdAt;
  const expiresAt = normalizeOptionalString(parsed.expiresAt || parsed.expires_at);
  const targets = Array.isArray(parsed.targets)
    ? parsed.targets.map((entry) => normalizeRequiredString(entry)).filter(Boolean)
    : [];

  if (!id || !command || !requestedByUserId || !requestedByEmail || !createdAt) {
    return null;
  }

  let status = normalizeFleetApprovalStatus(parsed.status);
  if (status === "pending" && expiresAt) {
    const expiresMs = Date.parse(expiresAt);
    if (Number.isFinite(expiresMs) && expiresMs <= Date.now()) {
      status = "expired";
    }
  }

  return {
    id,
    command,
    requestedByUserId,
    requestedByEmail,
    targets,
    createdAt,
    updatedAt,
    status,
    note: normalizeOptionalString(parsed.note),
    expiresAt: expiresAt || undefined,
  };
}

function normalizeFleetApprovals(value: unknown): TeamFleetApproval[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const byId = new Map<string, TeamFleetApproval>();
  value.forEach((entry) => {
    const normalized = normalizeFleetApproval(entry);
    if (normalized) {
      byId.set(normalized.id, normalized);
    }
  });
  return Array.from(byId.values()).sort((a, b) => {
    if (a.status === "pending" && b.status !== "pending") {
      return -1;
    }
    if (a.status !== "pending" && b.status === "pending") {
      return 1;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });
}

function hasTeamPermission(identity: TeamIdentity | null, permission: TeamPermission): boolean {
  if (!identity) {
    return false;
  }
  return identity.role === "admin" || identity.permissions.includes(permission);
}

function toDashboardUrl(rawCloudUrl: string): string {
  const trimmed = rawCloudUrl.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://cloud.novaremote.dev";
  }
  const normalized = trimmed.replace(/^https?:\/\//i, "");
  if (normalized.startsWith("api.")) {
    return `https://${normalized.replace(/^api\./, "cloud.")}`;
  }
  if (normalized.includes("/api")) {
    return `https://${normalized.split("/api")[0]}`;
  }
  return `https://${normalized}`;
}

export function useTeamAuth({ enabled = true, cloudUrl, fetchImpl, onError }: UseTeamAuthArgs = {}) {
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [identity, setIdentity] = useState<TeamIdentity | null>(null);
  const [teamServers, setTeamServers] = useState<ServerProfile[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamInvites, setTeamInvites] = useState<TeamInvite[]>([]);
  const [fleetApprovals, setFleetApprovals] = useState<TeamFleetApproval[]>([]);
  const [teamSettings, setTeamSettings] = useState<TeamSettings>({
    ...defaultTeamSettings(),
  });
  const [teamUsage, setTeamUsage] = useState<TeamUsage>({
    activeMembers: 0,
    sessionsCreated: 0,
    commandsSent: 0,
    fleetExecutions: 0,
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadIdentity() {
      if (!enabled) {
        if (mounted) {
          setIdentity(null);
          setLoading(false);
        }
        return;
      }

      try {
        const raw = await SecureStore.getItemAsync(STORAGE_TEAM_IDENTITY);
        if (!mounted) {
          return;
        }
        if (!raw) {
          setIdentity(null);
          return;
        }
        const parsed = JSON.parse(raw) as unknown;
        setIdentity(normalizeTeamIdentity(parsed));
      } catch (loadError) {
        if (mounted) {
          setIdentity(null);
          setError(loadError instanceof Error ? loadError.message : String(loadError));
          onError?.(loadError);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void loadIdentity();
    return () => {
      mounted = false;
    };
  }, [enabled, onError]);

  const persistIdentity = useCallback(async (nextIdentity: TeamIdentity | null) => {
    if (!nextIdentity) {
      await SecureStore.deleteItemAsync(STORAGE_TEAM_IDENTITY);
      return;
    }
    await SecureStore.setItemAsync(STORAGE_TEAM_IDENTITY, JSON.stringify(nextIdentity));
  }, []);

  const refreshTeamContext = useCallback(
    async (nextIdentity?: TeamIdentity | null) => {
      const currentIdentity = nextIdentity ?? identity;
      if (!currentIdentity) {
        setTeamServers([]);
        setTeamMembers([]);
        setTeamInvites([]);
        setFleetApprovals([]);
        setTeamSettings(defaultTeamSettings());
        setTeamUsage({ activeMembers: 0, sessionsCreated: 0, commandsSent: 0, fleetExecutions: 0 });
        return {
          servers: [],
          members: [],
          invites: [],
          approvals: [],
          settings: defaultTeamSettings(),
          usage: { activeMembers: 0, sessionsCreated: 0, commandsSent: 0, fleetExecutions: 0 },
        };
      }

      const approvalsPromise =
        hasTeamPermission(currentIdentity, "team:manage") || hasTeamPermission(currentIdentity, "fleet:execute")
          ? cloudRequest<{ approvals?: unknown }>(
              "/v1/team/fleet/approvals",
              { method: "GET" },
              {
                accessToken: currentIdentity.accessToken,
                cloudUrl: cloudUrl || getNovaCloudUrl(),
                fetchImpl,
              }
            ).catch(() => ({ approvals: [] }))
          : Promise.resolve<{ approvals?: unknown }>({ approvals: [] });
      const invitesPromise =
        hasTeamPermission(currentIdentity, "team:invite") || hasTeamPermission(currentIdentity, "team:manage")
          ? cloudRequest<{ invites?: unknown }>(
              "/v1/team/invites",
              { method: "GET" },
              {
                accessToken: currentIdentity.accessToken,
                cloudUrl: cloudUrl || getNovaCloudUrl(),
                fetchImpl,
              }
            ).catch(() => ({ invites: [] }))
          : Promise.resolve<{ invites?: unknown }>({ invites: [] });

      const [serversPayload, membersPayload, settingsPayload, usagePayload, approvalsPayload, invitesPayload] = await Promise.all([
        cloudRequest<{ servers?: unknown }>(
          "/v1/team/servers",
          { method: "GET" },
          {
            accessToken: currentIdentity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        ),
        cloudRequest<{ members?: unknown }>(
          "/v1/team/members",
          { method: "GET" },
          {
            accessToken: currentIdentity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        ),
        cloudRequest<{ settings?: unknown }>(
          "/v1/team/settings",
          { method: "GET" },
          {
            accessToken: currentIdentity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        ),
        cloudRequest<{ usage?: unknown }>(
          "/v1/team/usage",
          { method: "GET" },
          {
            accessToken: currentIdentity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        ).catch(() => ({ usage: {} })),
        approvalsPromise,
        invitesPromise,
      ]);

      const servers = normalizeTeamServers(serversPayload.servers || serversPayload);
      const members = normalizeTeamMembers(membersPayload.members || membersPayload);
      const approvals = normalizeFleetApprovals(approvalsPayload.approvals || approvalsPayload);
      const invites = normalizeTeamInvites(invitesPayload.invites || invitesPayload);
      const settings = normalizeTeamSettings(settingsPayload.settings || settingsPayload);
      const usage = normalizeTeamUsage(usagePayload.usage || usagePayload);
      setTeamServers(servers);
      setTeamMembers(members);
      setTeamInvites(invites);
      setFleetApprovals(approvals);
      setTeamSettings(settings);
      setTeamUsage(usage);
      return { servers, members, invites, approvals, settings, usage };
    },
    [cloudUrl, fetchImpl, identity]
  );

  const loginWithPassword = useCallback(
    async (input: { email: string; password: string; inviteCode?: string }) => {
      const email = input.email.trim().toLowerCase();
      const password = input.password;
      const inviteCode = input.inviteCode?.trim() || "";

      if (!email || !password) {
        throw new Error("Email and password are required.");
      }

      setBusy(true);
      setError(null);
      try {
        const payload = await cloudRequest<TeamAuthResponse>(
          "/v1/auth/login",
          {
            method: "POST",
            body: JSON.stringify({
              provider: "novaremote_cloud",
              email,
              password,
              inviteCode: inviteCode || undefined,
            }),
          },
          {
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        const nextIdentity = parseTeamAuthIdentity(payload);
        if (!nextIdentity) {
          throw new Error("Team auth response is missing identity details.");
        }
        setIdentity(nextIdentity);
        await persistIdentity(nextIdentity);
        await refreshTeamContext(nextIdentity);
        return nextIdentity;
      } catch (loginError) {
        setError(loginError instanceof Error ? loginError.message : String(loginError));
        onError?.(loginError);
        throw loginError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, onError, persistIdentity, refreshTeamContext]
  );

  const loginWithSso = useCallback(
    async (input: { provider: TeamSsoProvider; idToken?: string; accessToken?: string; inviteCode?: string }) => {
      const provider = input.provider;
      const idToken = normalizeOptionalString(input.idToken);
      const accessToken = normalizeOptionalString(input.accessToken);
      const inviteCode = normalizeOptionalString(input.inviteCode);
      if (!idToken && !accessToken) {
        throw new Error("SSO login requires an idToken or accessToken.");
      }

      setBusy(true);
      setError(null);
      try {
        const payload = await cloudRequest<TeamAuthResponse>(
          "/v1/auth/sso/exchange",
          {
            method: "POST",
            body: JSON.stringify({
              provider,
              idToken: idToken || undefined,
              accessToken: accessToken || undefined,
              inviteCode: inviteCode || undefined,
            }),
          },
          {
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        const nextIdentity = parseTeamAuthIdentity(payload);
        if (!nextIdentity) {
          throw new Error("Team SSO response is missing identity details.");
        }
        setIdentity(nextIdentity);
        await persistIdentity(nextIdentity);
        await refreshTeamContext(nextIdentity);
        return nextIdentity;
      } catch (loginError) {
        setError(loginError instanceof Error ? loginError.message : String(loginError));
        onError?.(loginError);
        throw loginError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, onError, persistIdentity, refreshTeamContext]
  );

  const logout = useCallback(async () => {
    setIdentity(null);
    setTeamServers([]);
    setTeamMembers([]);
    setTeamInvites([]);
    setFleetApprovals([]);
    setTeamSettings(defaultTeamSettings());
    setTeamUsage({ activeMembers: 0, sessionsCreated: 0, commandsSent: 0, fleetExecutions: 0 });
    setError(null);
    await persistIdentity(null);
  }, [persistIdentity]);

  const refreshSession = useCallback(async () => {
    if (!identity) {
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = await cloudRequest<TeamAuthResponse>(
        "/v1/auth/refresh",
        {
          method: "POST",
          body: JSON.stringify({
            refreshToken: identity.refreshToken,
          }),
        },
        {
          accessToken: identity.accessToken,
          cloudUrl: cloudUrl || getNovaCloudUrl(),
          fetchImpl,
        }
      );
      const refreshed = parseTeamAuthIdentity({
        ...payload,
        identity: payload.identity || {
          ...identity,
          ...(payload as Record<string, unknown>),
        },
      });
      if (!refreshed) {
        throw new Error("Unable to refresh team session.");
      }
      setIdentity(refreshed);
      await persistIdentity(refreshed);
      await refreshTeamContext(refreshed);
      return refreshed;
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : String(refreshError));
      onError?.(refreshError);
      throw refreshError;
    } finally {
      setBusy(false);
    }
  }, [cloudUrl, fetchImpl, identity, onError, persistIdentity, refreshTeamContext]);

  const inviteMember = useCallback(
    async (input: { email: string; role?: TeamRole }): Promise<TeamInviteResult> => {
      if (!identity) {
        throw new Error("Sign in to a team account before sending invites.");
      }
      if (!hasTeamPermission(identity, "team:invite")) {
        throw new Error("You do not have permission to invite team members.");
      }

      const email = input.email.trim().toLowerCase();
      const role = normalizeRole(input.role || "viewer");
      if (!email) {
        throw new Error("Invite email is required.");
      }
      if (!role) {
        throw new Error("Invite role is invalid.");
      }

      setBusy(true);
      setError(null);
      try {
        const payload = await cloudRequest<Record<string, unknown>>(
          "/v1/team/invites",
          {
            method: "POST",
            body: JSON.stringify({
              email,
              role,
            }),
          },
          {
            accessToken: identity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        const invite =
          normalizeTeamInvite(payload.invite || payload) ||
          ({
            id: normalizeOptionalString(payload.id) || normalizeOptionalString(payload.inviteCode) || `invite-${Date.now()}`,
            email,
            role,
            status: "pending",
            inviteCode: normalizeOptionalString(payload.inviteCode || payload.code),
            inviteLink: normalizeOptionalString(payload.inviteLink || payload.url),
            createdAt: new Date().toISOString(),
            expiresAt: normalizeOptionalString(payload.expiresAt || payload.expires_at),
          } satisfies TeamInvite);
        setTeamInvites((previous) => normalizeTeamInvites([invite, ...previous]));
        await refreshTeamContext(identity);
        return invite;
      } catch (inviteError) {
        setError(inviteError instanceof Error ? inviteError.message : String(inviteError));
        onError?.(inviteError);
        throw inviteError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, identity, onError, refreshTeamContext]
  );

  const updateMemberRole = useCallback(
    async (memberId: string, role: TeamRole) => {
      if (!identity) {
        throw new Error("Sign in to a team account before managing members.");
      }
      if (!hasTeamPermission(identity, "team:manage")) {
        throw new Error("You do not have permission to manage team members.");
      }

      const normalizedMemberId = memberId.trim();
      const normalizedRole = normalizeRole(role);
      if (!normalizedMemberId) {
        throw new Error("Member ID is required.");
      }
      if (!normalizedRole) {
        throw new Error("Role is invalid.");
      }

      setBusy(true);
      setError(null);
      try {
        await cloudRequest<Record<string, unknown>>(
          `/v1/team/members/${encodeURIComponent(normalizedMemberId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ role: normalizedRole }),
          },
          {
            accessToken: identity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        setTeamMembers((prev) => prev.map((member) => (member.id === normalizedMemberId ? { ...member, role: normalizedRole } : member)));
        await refreshTeamContext(identity);
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : String(updateError));
        onError?.(updateError);
        throw updateError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, identity, onError, refreshTeamContext]
  );

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      if (!identity) {
        throw new Error("Sign in to a team account before managing invites.");
      }
      if (!hasTeamPermission(identity, "team:invite") && !hasTeamPermission(identity, "team:manage")) {
        throw new Error("You do not have permission to manage invites.");
      }
      const normalizedInviteId = inviteId.trim();
      if (!normalizedInviteId) {
        throw new Error("Invite ID is required.");
      }

      setBusy(true);
      setError(null);
      try {
        await cloudRequest<Record<string, unknown>>(
          `/v1/team/invites/${encodeURIComponent(normalizedInviteId)}`,
          { method: "DELETE" },
          {
            accessToken: identity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        setTeamInvites((previous) =>
          previous.map((invite) =>
            invite.id === normalizedInviteId
              ? {
                  ...invite,
                  status: "revoked",
                  revokedAt: new Date().toISOString(),
                }
              : invite
          )
        );
        await refreshTeamContext(identity);
      } catch (revokeError) {
        setError(revokeError instanceof Error ? revokeError.message : String(revokeError));
        onError?.(revokeError);
        throw revokeError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, identity, onError, refreshTeamContext]
  );

  const updateMemberServers = useCallback(
    async (memberId: string, serverIds: string[]) => {
      if (!identity) {
        throw new Error("Sign in to a team account before managing member server access.");
      }
      if (!hasTeamPermission(identity, "team:manage")) {
        throw new Error("You do not have permission to manage team members.");
      }

      const normalizedMemberId = memberId.trim();
      if (!normalizedMemberId) {
        throw new Error("Member ID is required.");
      }
      const normalizedServerIds = Array.from(
        new Set(
          serverIds
            .map((entry) => entry.trim())
            .filter(Boolean)
        )
      );

      setBusy(true);
      setError(null);
      try {
        await cloudRequest<Record<string, unknown>>(
          `/v1/team/members/${encodeURIComponent(normalizedMemberId)}/servers`,
          {
            method: "PUT",
            body: JSON.stringify({ serverIds: normalizedServerIds }),
          },
          {
            accessToken: identity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        setTeamMembers((prev) =>
          prev.map((member) => (member.id === normalizedMemberId ? { ...member, serverIds: normalizedServerIds } : member))
        );
        await refreshTeamContext(identity);
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : String(updateError));
        onError?.(updateError);
        throw updateError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, identity, onError, refreshTeamContext]
  );

  const updateTeamSettings = useCallback(
    async (input: TeamSettingsUpdate) => {
      if (!identity) {
        throw new Error("Sign in to a team account before managing team settings.");
      }
      if (!hasTeamPermission(identity, "settings:manage") && !hasTeamPermission(identity, "team:manage")) {
        throw new Error("You do not have permission to manage team settings.");
      }

      const nextSettings: TeamSettingsUpdate = {};
      if ("enforceDangerConfirm" in input) {
        nextSettings.enforceDangerConfirm =
          typeof input.enforceDangerConfirm === "boolean" || input.enforceDangerConfirm === null
            ? input.enforceDangerConfirm
            : null;
      }
      if ("commandBlocklist" in input) {
        nextSettings.commandBlocklist = normalizeCommandBlocklist(input.commandBlocklist);
      }
      if ("sessionTimeoutMinutes" in input) {
        nextSettings.sessionTimeoutMinutes = normalizeSessionTimeoutMinutes(input.sessionTimeoutMinutes);
      }
      if ("requireSessionRecording" in input) {
        nextSettings.requireSessionRecording =
          typeof input.requireSessionRecording === "boolean" || input.requireSessionRecording === null
            ? input.requireSessionRecording
            : null;
      }
      if ("requireFleetApproval" in input) {
        nextSettings.requireFleetApproval =
          typeof input.requireFleetApproval === "boolean" || input.requireFleetApproval === null
            ? input.requireFleetApproval
            : null;
      }

      if (Object.keys(nextSettings).length === 0) {
        throw new Error("No team settings changes were provided.");
      }

      setBusy(true);
      setError(null);
      try {
        const payload = await cloudRequest<Record<string, unknown>>(
          "/v1/team/settings",
          {
            method: "PATCH",
            body: JSON.stringify(nextSettings),
          },
          {
            accessToken: identity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        const normalizedSettings = normalizeTeamSettings(payload.settings || payload);
        setTeamSettings((previous) => ({
          ...previous,
          ...nextSettings,
          ...normalizedSettings,
        }));
        await refreshTeamContext(identity);
      } catch (updateError) {
        setError(updateError instanceof Error ? updateError.message : String(updateError));
        onError?.(updateError);
        throw updateError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, identity, onError, refreshTeamContext]
  );

  const requestFleetApproval = useCallback(
    async (input: { command: string; targets: string[]; note?: string }) => {
      if (!identity) {
        throw new Error("Sign in to a team account before requesting fleet approval.");
      }
      if (!hasTeamPermission(identity, "fleet:execute")) {
        throw new Error("You do not have permission to request fleet execution.");
      }

      const command = input.command.trim();
      const targets = input.targets.map((entry) => entry.trim()).filter(Boolean);
      const note = normalizeOptionalString(input.note);
      if (!command) {
        throw new Error("Fleet command is required for approval request.");
      }
      if (targets.length === 0) {
        throw new Error("At least one target server is required for approval request.");
      }

      setBusy(true);
      setError(null);
      try {
        const payload = await cloudRequest<Record<string, unknown>>(
          "/v1/team/fleet/approvals",
          {
            method: "POST",
            body: JSON.stringify({
              command,
              targets,
              note: note || undefined,
            }),
          },
          {
            accessToken: identity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        const approval = normalizeFleetApproval(payload.approval || payload);
        await refreshTeamContext(identity);
        return approval;
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : String(requestError));
        onError?.(requestError);
        throw requestError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, identity, onError, refreshTeamContext]
  );

  const reviewFleetApproval = useCallback(
    async (approvalId: string, action: "approve" | "deny", note?: string) => {
      if (!identity) {
        throw new Error("Sign in to a team account before reviewing approvals.");
      }
      if (!hasTeamPermission(identity, "team:manage")) {
        throw new Error("You do not have permission to review fleet approvals.");
      }
      const normalizedApprovalId = approvalId.trim();
      if (!normalizedApprovalId) {
        throw new Error("Approval ID is required.");
      }
      if (action === "approve") {
        const approval = fleetApprovals.find((entry) => entry.id === normalizedApprovalId);
        if (approval && approval.requestedByUserId === identity.userId) {
          throw new Error("Fleet approvals must be reviewed by another team member.");
        }
      }

      setBusy(true);
      setError(null);
      try {
        await cloudRequest<Record<string, unknown>>(
          `/v1/team/fleet/approvals/${encodeURIComponent(normalizedApprovalId)}/${action}`,
          {
            method: "POST",
            body: JSON.stringify({
              note: normalizeOptionalString(note),
            }),
          },
          {
            accessToken: identity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        await refreshTeamContext(identity);
      } catch (reviewError) {
        setError(reviewError instanceof Error ? reviewError.message : String(reviewError));
        onError?.(reviewError);
        throw reviewError;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, fleetApprovals, identity, onError, refreshTeamContext]
  );

  const approveFleetApproval = useCallback(
    async (approvalId: string, note?: string) => {
      await reviewFleetApproval(approvalId, "approve", note);
    },
    [reviewFleetApproval]
  );

  const denyFleetApproval = useCallback(
    async (approvalId: string, note?: string) => {
      await reviewFleetApproval(approvalId, "deny", note);
    },
    [reviewFleetApproval]
  );

  useEffect(() => {
    if (!enabled || !identity) {
      if (!identity) {
        setTeamServers([]);
        setTeamMembers([]);
        setTeamInvites([]);
        setFleetApprovals([]);
        setTeamSettings(defaultTeamSettings());
        setTeamUsage({ activeMembers: 0, sessionsCreated: 0, commandsSent: 0, fleetExecutions: 0 });
      }
      return;
    }
    void refreshTeamContext(identity).catch((contextError) => {
      setError(contextError instanceof Error ? contextError.message : String(contextError));
      onError?.(contextError);
    });
  }, [enabled, identity, onError, refreshTeamContext]);

  useEffect(() => {
    if (!enabled || !identity) {
      return;
    }
    const timer = setInterval(() => {
      if (busy) {
        return;
      }
      if (!shouldRefreshTeamIdentity(identity, Date.now(), TEAM_TOKEN_REFRESH_BUFFER_MS)) {
        return;
      }
      void refreshSession().catch(() => {});
    }, TEAM_TOKEN_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [busy, enabled, identity, refreshSession]);

  const hasPermission = useCallback(
    (permission: TeamPermission) => {
      return hasTeamPermission(identity, permission);
    },
    [identity]
  );

  return useMemo(
    () => ({
      loading,
      busy,
      identity,
      teamServers,
      teamMembers,
      teamInvites,
      fleetApprovals,
      teamSettings,
      teamUsage,
      error,
      cloudUrl: cloudUrl || getNovaCloudUrl(),
      cloudDashboardUrl: toDashboardUrl(cloudUrl || getNovaCloudUrl()),
      loggedIn: Boolean(identity),
      hasPermission,
      loginWithPassword,
      loginWithSso,
      refreshTeamContext,
      refreshSession,
      inviteMember,
      revokeInvite,
      updateMemberRole,
      updateMemberServers,
      updateTeamSettings,
      requestFleetApproval,
      approveFleetApproval,
      denyFleetApproval,
      logout,
      setIdentityForTesting: setIdentity,
    }),
    [
      busy,
      cloudUrl,
      error,
      fleetApprovals,
      hasPermission,
      identity,
      loading,
      approveFleetApproval,
      denyFleetApproval,
      loginWithPassword,
      loginWithSso,
      logout,
      inviteMember,
      requestFleetApproval,
      refreshSession,
      refreshTeamContext,
      teamMembers,
      teamInvites,
      teamServers,
      teamSettings,
      teamUsage,
      revokeInvite,
      updateMemberServers,
      updateTeamSettings,
      updateMemberRole,
    ]
  );
}

export const teamAuthTestUtils = {
  normalizeTeamIdentity,
  shouldRefreshTeamIdentity,
  normalizeTeamServers,
  normalizeTeamMembers,
  normalizeTeamInvites,
  normalizeFleetApprovals,
  normalizeTeamSettings,
  normalizeTeamUsage,
  toDashboardUrl,
};
