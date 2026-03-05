import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import { cloudRequest, getNovaCloudUrl } from "../api/cloudClient";
import { DEFAULT_CWD, DEFAULT_TERMINAL_BACKEND, STORAGE_TEAM_IDENTITY } from "../constants";
import { normalizeCommandBlocklist, normalizeSessionTimeoutMinutes } from "../teamPolicy";
import { ServerProfile, TeamAuthProvider, TeamIdentity, TeamMember, TeamPermission, TeamRole } from "../types";

const TEAM_PROVIDERS: TeamAuthProvider[] = ["novaremote_cloud", "saml", "oidc", "ldap_proxy"];
const TEAM_ROLES: TeamRole[] = ["admin", "operator", "viewer", "billing"];
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
};

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
    return { enforceDangerConfirm: null, commandBlocklist: [], sessionTimeoutMinutes: null };
  }
  const parsed = value as Record<string, unknown>;
  const enforceDangerConfirm =
    typeof parsed.enforceDangerConfirm === "boolean"
      ? parsed.enforceDangerConfirm
      : typeof parsed.requireDangerConfirm === "boolean"
        ? parsed.requireDangerConfirm
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
  };
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
  if (!id || !name || !email) {
    return null;
  }
  return {
    id,
    name,
    email,
    role,
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
      byId.set(normalized.id, normalized);
    }
  });
  return Array.from(byId.values());
}

export function useTeamAuth({ enabled = true, cloudUrl, fetchImpl, onError }: UseTeamAuthArgs = {}) {
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [identity, setIdentity] = useState<TeamIdentity | null>(null);
  const [teamServers, setTeamServers] = useState<ServerProfile[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [teamSettings, setTeamSettings] = useState<TeamSettings>({
    enforceDangerConfirm: null,
    commandBlocklist: [],
    sessionTimeoutMinutes: null,
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
        setTeamSettings({ enforceDangerConfirm: null, commandBlocklist: [], sessionTimeoutMinutes: null });
        return {
          servers: [],
          members: [],
          settings: { enforceDangerConfirm: null, commandBlocklist: [], sessionTimeoutMinutes: null },
        };
      }

      const [serversPayload, membersPayload, settingsPayload] = await Promise.all([
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
      ]);

      const servers = normalizeTeamServers(serversPayload.servers || serversPayload);
      const members = normalizeTeamMembers(membersPayload.members || membersPayload);
      const settings = normalizeTeamSettings(settingsPayload.settings || settingsPayload);
      setTeamServers(servers);
      setTeamMembers(members);
      setTeamSettings(settings);
      return { servers, members, settings };
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

  const logout = useCallback(async () => {
    setIdentity(null);
    setTeamServers([]);
    setTeamMembers([]);
    setTeamSettings({ enforceDangerConfirm: null, commandBlocklist: [], sessionTimeoutMinutes: null });
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

  useEffect(() => {
    if (!enabled || !identity) {
      if (!identity) {
        setTeamServers([]);
        setTeamMembers([]);
        setTeamSettings({ enforceDangerConfirm: null, commandBlocklist: [], sessionTimeoutMinutes: null });
      }
      return;
    }
    void refreshTeamContext(identity).catch((contextError) => {
      setError(contextError instanceof Error ? contextError.message : String(contextError));
      onError?.(contextError);
    });
  }, [enabled, identity, onError, refreshTeamContext]);

  const hasPermission = useCallback(
    (permission: TeamPermission) => {
      if (!identity) {
        return false;
      }
      return identity.role === "admin" || identity.permissions.includes(permission);
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
      teamSettings,
      error,
      cloudUrl: cloudUrl || getNovaCloudUrl(),
      loggedIn: Boolean(identity),
      hasPermission,
      loginWithPassword,
      refreshTeamContext,
      refreshSession,
      logout,
      setIdentityForTesting: setIdentity,
    }),
    [
      busy,
      cloudUrl,
      error,
      hasPermission,
      identity,
      loading,
      loginWithPassword,
      logout,
      refreshSession,
      refreshTeamContext,
      teamMembers,
      teamServers,
      teamSettings,
    ]
  );
}

export const teamAuthTestUtils = {
  normalizeTeamIdentity,
  shouldRefreshTeamIdentity,
  normalizeTeamServers,
  normalizeTeamMembers,
  normalizeTeamSettings,
};
