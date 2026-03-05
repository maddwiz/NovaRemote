import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cloudRequest, getNovaCloudUrl } from "../api/cloudClient";
import { STORAGE_TOKEN_BROKER_CACHE, TEAM_TOKEN_REFRESH_BUFFER_MS, TEAM_TOKEN_REFRESH_INTERVAL_MS } from "../constants";
import { ServerProfile, TeamIdentity, TokenBrokerPermission, TokenBrokerResult } from "../types";
import { isTeamManagedServer } from "../teamServers";

type UseTokenBrokerArgs = {
  identity: TeamIdentity | null;
  servers: ServerProfile[];
  enabled?: boolean;
  cloudUrl?: string;
  fetchImpl?: typeof fetch;
  onError?: (error: unknown) => void;
};

type TokenProvisionResponse = {
  serverId?: unknown;
  token?: unknown;
  expiresAt?: unknown;
  permissions?: unknown;
};

type TokenCache = Record<string, TokenBrokerResult>;

const TOKEN_PERMISSIONS: TokenBrokerPermission[] = ["read", "write", "execute", "admin"];

export function shouldRefreshToken(result: TokenBrokerResult | null, nowMs: number, bufferMs: number): boolean {
  if (!result) {
    return true;
  }
  return result.expiresAt - nowMs <= bufferMs;
}

function normalizeTokenPermissions(value: unknown): TokenBrokerPermission[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Set<TokenBrokerPermission>();
  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }
    const normalized = entry.trim().toLowerCase() as TokenBrokerPermission;
    if (TOKEN_PERMISSIONS.includes(normalized)) {
      deduped.add(normalized);
    }
  });
  return Array.from(deduped.values());
}

function normalizeExpiresAt(value: unknown): number {
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
  return Date.now() + 60 * 60 * 1000;
}

function normalizeProvisionResult(serverId: string, payload: TokenProvisionResponse): TokenBrokerResult | null {
  const token = typeof payload.token === "string" ? payload.token.trim() : "";
  if (!token) {
    return null;
  }
  return {
    serverId,
    token,
    expiresAt: normalizeExpiresAt(payload.expiresAt),
    permissions: normalizeTokenPermissions(payload.permissions),
  };
}

function normalizeTokenCache(value: unknown): TokenCache {
  if (!value || typeof value !== "object") {
    return {};
  }
  const parsed = value as Record<string, unknown>;
  const next: TokenCache = {};
  Object.entries(parsed).forEach(([serverId, entry]) => {
    if (!entry || typeof entry !== "object") {
      return;
    }
    const normalized = normalizeProvisionResult(serverId, entry as TokenProvisionResponse);
    if (normalized) {
      next[serverId] = normalized;
    }
  });
  return next;
}

export function applyBrokerTokens(servers: ServerProfile[], tokenCache: TokenCache): ServerProfile[] {
  return servers.map((server) => {
    if (!isTeamManagedServer(server)) {
      return server;
    }
    const tokenEntry = tokenCache[server.id];
    if (!tokenEntry?.token) {
      return server;
    }
    return {
      ...server,
      token: tokenEntry.token,
    };
  });
}

export function useTokenBroker({
  identity,
  servers,
  enabled = true,
  cloudUrl,
  fetchImpl,
  onError,
}: UseTokenBrokerArgs) {
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [tokenCache, setTokenCache] = useState<TokenCache>({});
  const [lastError, setLastError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!enabled) {
        if (mounted) {
          setTokenCache({});
          setLoading(false);
        }
        return;
      }
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_TOKEN_BROKER_CACHE);
        if (!mounted) {
          return;
        }
        if (!raw) {
          setTokenCache({});
          return;
        }
        const parsed = JSON.parse(raw) as unknown;
        setTokenCache(normalizeTokenCache(parsed));
      } catch (error) {
        if (mounted) {
          setLastError(error instanceof Error ? error.message : String(error));
          onError?.(error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [enabled, onError]);

  useEffect(() => {
    if (loading) {
      return;
    }
    void SecureStore.setItemAsync(STORAGE_TOKEN_BROKER_CACHE, JSON.stringify(tokenCache)).catch(() => {});
  }, [loading, tokenCache]);

  const teamServers = useMemo(() => servers.filter((server) => isTeamManagedServer(server)), [servers]);

  const provisionServerToken = useCallback(
    async (server: ServerProfile): Promise<TokenBrokerResult> => {
      if (!identity) {
        throw new Error("Team login is required to provision server tokens.");
      }
      if (!isTeamManagedServer(server)) {
        return {
          serverId: server.id,
          token: server.token,
          expiresAt: Number.MAX_SAFE_INTEGER,
          permissions: ["admin"],
        };
      }

      setBusy(true);
      setLastError(null);
      try {
        const payload = await cloudRequest<TokenProvisionResponse>(
          "/v1/tokens/provision",
          {
            method: "POST",
            body: JSON.stringify({
              serverId: server.teamServerId || server.id,
              permissionLevel: server.permissionLevel || "viewer",
            }),
          },
          {
            accessToken: identity.accessToken,
            cloudUrl: cloudUrl || getNovaCloudUrl(),
            fetchImpl,
          }
        );
        const normalized = normalizeProvisionResult(server.id, payload);
        if (!normalized) {
          throw new Error(`Token broker response is invalid for server ${server.name}.`);
        }
        setTokenCache((prev) => ({ ...prev, [server.id]: normalized }));
        return normalized;
      } catch (error) {
        setLastError(error instanceof Error ? error.message : String(error));
        onError?.(error);
        throw error;
      } finally {
        setBusy(false);
      }
    },
    [cloudUrl, fetchImpl, identity, onError]
  );

  const refreshExpiringTokens = useCallback(async () => {
    if (!identity || teamServers.length === 0) {
      return;
    }
    const now = Date.now();
    const refreshTargets = teamServers.filter((server) =>
      shouldRefreshToken(tokenCache[server.id] || null, now, TEAM_TOKEN_REFRESH_BUFFER_MS)
    );
    if (refreshTargets.length === 0) {
      return;
    }
    await Promise.all(
      refreshTargets.map(async (server) => {
        await provisionServerToken(server);
      })
    );
  }, [identity, provisionServerToken, teamServers, tokenCache]);

  useEffect(() => {
    if (!enabled || !identity) {
      return;
    }
    const timer = setInterval(() => {
      void refreshExpiringTokens().catch((error) => {
        setLastError(error instanceof Error ? error.message : String(error));
        onError?.(error);
      });
    }, TEAM_TOKEN_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [enabled, identity, onError, refreshExpiringTokens]);

  const tokenByServerId = useMemo(() => {
    const next: Record<string, string> = {};
    Object.entries(tokenCache).forEach(([serverId, entry]) => {
      next[serverId] = entry.token;
    });
    return next;
  }, [tokenCache]);

  const brokeredServers = useMemo(() => applyBrokerTokens(servers, tokenCache), [servers, tokenCache]);

  return useMemo(
    () => ({
      loading,
      busy,
      lastError,
      tokenCache,
      tokenByServerId,
      brokeredServers,
      provisionServerToken,
      refreshExpiringTokens,
    }),
    [
      brokeredServers,
      busy,
      lastError,
      loading,
      provisionServerToken,
      refreshExpiringTokens,
      tokenByServerId,
      tokenCache,
    ]
  );
}

export const tokenBrokerTestUtils = {
  shouldRefreshToken,
  applyBrokerTokens,
};
