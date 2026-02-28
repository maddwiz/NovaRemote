import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import {
  buildDefaultServer,
  DEFAULT_BASE_URL,
  DEFAULT_CWD,
  DEFAULT_SERVER_NAME,
  STORAGE_ACTIVE_SERVER_ID,
  STORAGE_LEGACY_BASE_URL,
  STORAGE_LEGACY_TOKEN,
  STORAGE_SERVERS,
  makeId,
} from "../constants";
import { ServerProfile } from "../types";

type UseServersArgs = {
  onError: (error: unknown) => void;
};

export function useServers({ onError }: UseServersArgs) {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);

  const [serverNameInput, setServerNameInput] = useState<string>(DEFAULT_SERVER_NAME);
  const [serverUrlInput, setServerUrlInput] = useState<string>(DEFAULT_BASE_URL);
  const [serverTokenInput, setServerTokenInput] = useState<string>("");
  const [serverCwdInput, setServerCwdInput] = useState<string>(DEFAULT_CWD);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [tokenMasked, setTokenMasked] = useState<boolean>(true);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) ?? null,
    [servers, activeServerId]
  );

  const persistServers = useCallback(async (nextServers: ServerProfile[], nextActiveId: string | null) => {
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_SERVERS, JSON.stringify(nextServers)),
      nextActiveId
        ? SecureStore.setItemAsync(STORAGE_ACTIVE_SERVER_ID, nextActiveId)
        : SecureStore.deleteItemAsync(STORAGE_ACTIVE_SERVER_ID),
    ]);
  }, []);

  const beginCreateServer = useCallback(() => {
    setEditingServerId(null);
    setServerNameInput(DEFAULT_SERVER_NAME);
    setServerUrlInput(DEFAULT_BASE_URL);
    setServerTokenInput("");
    setServerCwdInput(DEFAULT_CWD);
  }, []);

  const beginEditServer = useCallback((server: ServerProfile) => {
    setEditingServerId(server.id);
    setServerNameInput(server.name);
    setServerUrlInput(server.baseUrl);
    setServerTokenInput(server.token);
    setServerCwdInput(server.defaultCwd);
  }, []);

  const saveServer = useCallback(async () => {
    const cleanedName = serverNameInput.trim() || DEFAULT_SERVER_NAME;
    const cleanedBaseUrl = normalizeBaseUrl(serverUrlInput);
    const cleanedToken = serverTokenInput.trim();
    const cleanedCwd = serverCwdInput.trim() || DEFAULT_CWD;

    if (!cleanedBaseUrl) {
      throw new Error("Server URL is required.");
    }

    if (!cleanedToken) {
      throw new Error("Server token is required.");
    }

    let nextServers: ServerProfile[] = [];
    let nextActiveId = activeServerId;

    if (editingServerId) {
      nextServers = servers.map((server) =>
        server.id === editingServerId
          ? {
              ...server,
              name: cleanedName,
              baseUrl: cleanedBaseUrl,
              token: cleanedToken,
              defaultCwd: cleanedCwd,
            }
          : server
      );
      nextActiveId = nextActiveId ?? editingServerId;
    } else {
      const newServer: ServerProfile = {
        id: makeId(),
        name: cleanedName,
        baseUrl: cleanedBaseUrl,
        token: cleanedToken,
        defaultCwd: cleanedCwd,
      };
      nextServers = [newServer, ...servers];
      nextActiveId = newServer.id;
    }

    setServers(nextServers);
    setActiveServerId(nextActiveId ?? null);
    await persistServers(nextServers, nextActiveId ?? null);
    beginCreateServer();
  }, [
    activeServerId,
    beginCreateServer,
    editingServerId,
    persistServers,
    serverCwdInput,
    serverNameInput,
    serverTokenInput,
    serverUrlInput,
    servers,
  ]);

  const deleteServer = useCallback(
    async (serverId: string) => {
      const nextServers = servers.filter((server) => server.id !== serverId);
      const nextActiveId = activeServerId === serverId ? nextServers[0]?.id ?? null : activeServerId;
      setServers(nextServers);
      setActiveServerId(nextActiveId ?? null);
      await persistServers(nextServers, nextActiveId ?? null);

      if (editingServerId === serverId) {
        beginCreateServer();
      }
    },
    [activeServerId, beginCreateServer, editingServerId, persistServers, servers]
  );

  const useServer = useCallback(
    async (serverId: string) => {
      setActiveServerId(serverId);
      await persistServers(servers, serverId);
    },
    [persistServers, servers]
  );

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const [savedServersRaw, savedActiveId, legacyBaseUrl, legacyToken] = await Promise.all([
          SecureStore.getItemAsync(STORAGE_SERVERS),
          SecureStore.getItemAsync(STORAGE_ACTIVE_SERVER_ID),
          SecureStore.getItemAsync(STORAGE_LEGACY_BASE_URL),
          SecureStore.getItemAsync(STORAGE_LEGACY_TOKEN),
        ]);

        if (!mounted) {
          return;
        }

        let parsedServers: ServerProfile[] = [];
        if (savedServersRaw) {
          try {
            const parsed = JSON.parse(savedServersRaw) as ServerProfile[];
            parsedServers = Array.isArray(parsed) ? parsed : [];
          } catch {
            parsedServers = [];
          }
        }

        if (parsedServers.length === 0) {
          const fallback = buildDefaultServer();
          if (legacyBaseUrl) {
            fallback.baseUrl = normalizeBaseUrl(legacyBaseUrl);
          }
          if (legacyToken) {
            fallback.token = legacyToken;
          }
          parsedServers = [fallback];
        }

        const resolvedActive =
          parsedServers.find((server) => server.id === savedActiveId)?.id ?? parsedServers[0]?.id ?? null;

        setServers(parsedServers);
        setActiveServerId(resolvedActive);
      } catch (error) {
        if (mounted) {
          onError(error);
        }
      } finally {
        if (mounted) {
          setLoadingSettings(false);
        }
      }
    }

    void loadSettings();

    return () => {
      mounted = false;
    };
  }, [onError]);

  return {
    servers,
    activeServer,
    activeServerId,
    loadingSettings,
    serverNameInput,
    serverUrlInput,
    serverTokenInput,
    serverCwdInput,
    editingServerId,
    tokenMasked,
    setServerNameInput,
    setServerUrlInput,
    setServerTokenInput,
    setServerCwdInput,
    setTokenMasked,
    beginCreateServer,
    beginEditServer,
    saveServer,
    deleteServer,
    useServer,
  };
}
