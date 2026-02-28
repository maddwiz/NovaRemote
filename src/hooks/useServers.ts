import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import {
  buildDefaultServer,
  DEFAULT_BASE_URL,
  DEFAULT_CWD,
  DEFAULT_SERVER_NAME,
  DEFAULT_TERMINAL_BACKEND,
  STORAGE_ACTIVE_SERVER_ID,
  STORAGE_LEGACY_BASE_URL,
  STORAGE_LEGACY_TOKEN,
  STORAGE_SERVERS,
  makeId,
} from "../constants";
import { ServerProfile } from "../types";

type UseServersArgs = {
  onError: (error: unknown) => void;
  enabled?: boolean;
};

export function useServers({ onError, enabled = true }: UseServersArgs) {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);

  const [serverNameInput, setServerNameInput] = useState<string>(DEFAULT_SERVER_NAME);
  const [serverUrlInput, setServerUrlInput] = useState<string>(DEFAULT_BASE_URL);
  const [serverTokenInput, setServerTokenInput] = useState<string>("");
  const [serverCwdInput, setServerCwdInput] = useState<string>(DEFAULT_CWD);
  const [serverBackendInput, setServerBackendInput] = useState<ServerProfile["terminalBackend"]>(DEFAULT_TERMINAL_BACKEND);
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
    setServerBackendInput(DEFAULT_TERMINAL_BACKEND);
  }, []);

  const beginEditServer = useCallback((server: ServerProfile) => {
    setEditingServerId(server.id);
    setServerNameInput(server.name);
    setServerUrlInput(server.baseUrl);
    setServerTokenInput(server.token);
    setServerCwdInput(server.defaultCwd);
    setServerBackendInput(server.terminalBackend || DEFAULT_TERMINAL_BACKEND);
  }, []);

  const importServerConfig = useCallback((config: { name?: string; url?: string; cwd?: string; backend?: string }) => {
    setEditingServerId(null);
    setServerNameInput(config.name?.trim() || DEFAULT_SERVER_NAME);
    setServerUrlInput(normalizeBaseUrl(config.url || ""));
    setServerTokenInput("");
    setServerCwdInput(config.cwd?.trim() || DEFAULT_CWD);
    setServerBackendInput(
      config.backend === "tmux" ||
        config.backend === "screen" ||
        config.backend === "zellij" ||
        config.backend === "powershell" ||
        config.backend === "cmd" ||
        config.backend === "pty"
        ? config.backend
        : DEFAULT_TERMINAL_BACKEND
    );
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
              terminalBackend: serverBackendInput || DEFAULT_TERMINAL_BACKEND,
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
        terminalBackend: serverBackendInput || DEFAULT_TERMINAL_BACKEND,
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
    serverBackendInput,
    servers,
  ]);

  const addServerDirect = useCallback(
    async (server: { name: string; baseUrl: string; token: string; defaultCwd: string; terminalBackend?: ServerProfile["terminalBackend"] }) => {
      const cleanedBaseUrl = normalizeBaseUrl(server.baseUrl);
      const cleanedToken = server.token.trim();
      if (!cleanedBaseUrl || !cleanedToken) {
        throw new Error("Server URL and token are required.");
      }

      const newServer: ServerProfile = {
        id: makeId(),
        name: server.name.trim() || DEFAULT_SERVER_NAME,
        baseUrl: cleanedBaseUrl,
        token: cleanedToken,
        defaultCwd: server.defaultCwd.trim(),
        terminalBackend: server.terminalBackend || DEFAULT_TERMINAL_BACKEND,
      };

      const nextServers = [newServer, ...servers];
      setServers(nextServers);
      setActiveServerId(newServer.id);
      await persistServers(nextServers, newServer.id);
      return newServer.id;
    },
    [persistServers, servers]
  );

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
      if (!enabled) {
        if (mounted) {
          setLoadingSettings(false);
        }
        return;
      }

      try {
        if (mounted) {
          setLoadingSettings(true);
        }
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
            parsedServers = Array.isArray(parsed)
              ? parsed.map((entry) => ({
                  ...entry,
                  terminalBackend: entry.terminalBackend || DEFAULT_TERMINAL_BACKEND,
                }))
              : [];
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
          fallback.terminalBackend = DEFAULT_TERMINAL_BACKEND;
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
  }, [enabled, onError]);

  return {
    servers,
    activeServer,
    activeServerId,
    loadingSettings,
    serverNameInput,
    serverUrlInput,
    serverTokenInput,
    serverCwdInput,
    serverBackendInput,
    editingServerId,
    tokenMasked,
    setServerNameInput,
    setServerUrlInput,
    setServerTokenInput,
    setServerCwdInput,
    setServerBackendInput,
    setTokenMasked,
    beginCreateServer,
    beginEditServer,
    importServerConfig,
    addServerDirect,
    saveServer,
    deleteServer,
    useServer,
  };
}
