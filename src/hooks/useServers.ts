import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import {
  buildDefaultServer,
  DEFAULT_BASE_URL,
  DEFAULT_CWD,
  DEFAULT_SERVER_NAME,
  DEFAULT_SSH_PORT,
  DEFAULT_TERMINAL_BACKEND,
  STORAGE_ACTIVE_SERVER_ID,
  STORAGE_LEGACY_BASE_URL,
  STORAGE_LEGACY_TOKEN,
  STORAGE_SERVERS,
  makeId,
} from "../constants";
import { getDevSeedServerConfig } from "../devSeed";
import { canDeleteServerProfile, canEditServerProfile, normalizeServerProfile, normalizeTeamPermissionLevel } from "../teamServers";
import { ServerProfile, VmType } from "../types";

type UseServersArgs = {
  onError: (error: unknown) => void;
  enabled?: boolean;
};

function isDevRuntime(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function buildDevSeedServer(): ServerProfile | null {
  const config = getDevSeedServerConfig();
  const baseUrl = normalizeBaseUrl(config?.baseUrl || "");
  const token = config?.token?.trim() || "";
  if (!baseUrl || !token) {
    return null;
  }

  return {
    id: "dev-seeded-server",
    name: config?.name?.trim() || DEFAULT_SERVER_NAME,
    baseUrl,
    token,
    defaultCwd: config?.defaultCwd?.trim() || DEFAULT_CWD,
    source: "local",
    terminalBackend: DEFAULT_TERMINAL_BACKEND,
    sshHost: config?.sshHost?.trim() || undefined,
    sshUser: config?.sshUser?.trim() || undefined,
    sshPort: sanitizeSshPort(config?.sshPort),
    portainerUrl: config?.portainerUrl?.trim() || undefined,
    proxmoxUrl: config?.proxmoxUrl?.trim() || undefined,
    grafanaUrl: config?.grafanaUrl?.trim() || undefined,
  };
}

function mergeDevSeedServer(parsedServers: ServerProfile[], seededServer: ServerProfile | null): {
  servers: ServerProfile[];
  changed: boolean;
} {
  if (!seededServer) {
    return { servers: parsedServers, changed: false };
  }

  const normalizedSeedUrl = normalizeBaseUrl(seededServer.baseUrl);
  const matchIndex = parsedServers.findIndex(
    (server) => server.id === seededServer.id || normalizeBaseUrl(server.baseUrl) === normalizedSeedUrl
  );

  if (matchIndex === -1) {
    return {
      servers: [seededServer, ...parsedServers],
      changed: true,
    };
  }

  const existing = parsedServers[matchIndex];
  const merged: ServerProfile = normalizeServerProfile({
    ...existing,
    ...seededServer,
    id: seededServer.id,
    source: "local",
  });

  const nextServers = parsedServers.map((server, index) => (index === matchIndex ? merged : server));
  const changed = JSON.stringify(existing) !== JSON.stringify(merged);
  return { servers: nextServers, changed };
}

function sanitizeSshPort(value: string | number | undefined): number | undefined {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return undefined;
    }
    const rounded = Math.round(value);
    return rounded >= 1 && rounded <= 65535 ? rounded : undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const digits = value.replace(/[^0-9]/g, "");
  if (!digits) {
    return undefined;
  }
  const parsed = Number.parseInt(digits, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed >= 1 && parsed <= 65535 ? parsed : undefined;
}

function normalizeVmType(value: unknown): VmType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "proxmox" ||
    normalized === "vmware" ||
    normalized === "hyper-v" ||
    normalized === "docker" ||
    normalized === "lxc" ||
    normalized === "qemu" ||
    normalized === "virtualbox" ||
    normalized === "cloud"
  ) {
    return normalized;
  }
  return undefined;
}

export function useServers({ onError, enabled = true }: UseServersArgs) {
  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);

  const [serverNameInput, setServerNameInput] = useState<string>(DEFAULT_SERVER_NAME);
  const [serverUrlInput, setServerUrlInput] = useState<string>(DEFAULT_BASE_URL);
  const [serverTokenInput, setServerTokenInput] = useState<string>("");
  const [serverCwdInput, setServerCwdInput] = useState<string>(DEFAULT_CWD);
  const [serverBackendInput, setServerBackendInput] = useState<ServerProfile["terminalBackend"]>(DEFAULT_TERMINAL_BACKEND);
  const [serverSshHostInput, setServerSshHostInput] = useState<string>("");
  const [serverSshUserInput, setServerSshUserInput] = useState<string>("");
  const [serverSshPortInput, setServerSshPortInput] = useState<string>(String(DEFAULT_SSH_PORT));
  const [serverVmHostInput, setServerVmHostInput] = useState<string>("");
  const [serverVmTypeInput, setServerVmTypeInput] = useState<VmType | "">("");
  const [serverVmNameInput, setServerVmNameInput] = useState<string>("");
  const [serverVmIdInput, setServerVmIdInput] = useState<string>("");
  const [serverPortainerUrlInput, setServerPortainerUrlInput] = useState<string>("");
  const [serverProxmoxUrlInput, setServerProxmoxUrlInput] = useState<string>("");
  const [serverGrafanaUrlInput, setServerGrafanaUrlInput] = useState<string>("");
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
    setServerSshHostInput("");
    setServerSshUserInput("");
    setServerSshPortInput(String(DEFAULT_SSH_PORT));
    setServerVmHostInput("");
    setServerVmTypeInput("");
    setServerVmNameInput("");
    setServerVmIdInput("");
    setServerPortainerUrlInput("");
    setServerProxmoxUrlInput("");
    setServerGrafanaUrlInput("");
  }, []);

  const beginEditServer = useCallback((server: ServerProfile) => {
    setEditingServerId(server.id);
    setServerNameInput(server.name);
    setServerUrlInput(server.baseUrl);
    setServerTokenInput(server.token);
    setServerCwdInput(server.defaultCwd);
    setServerBackendInput(server.terminalBackend || DEFAULT_TERMINAL_BACKEND);
    setServerSshHostInput(server.sshHost || "");
    setServerSshUserInput(server.sshUser || "");
    setServerSshPortInput(String(server.sshPort || DEFAULT_SSH_PORT));
    setServerVmHostInput(server.vmHost || "");
    setServerVmTypeInput(server.vmType || "");
    setServerVmNameInput(server.vmName || "");
    setServerVmIdInput(server.vmId || "");
    setServerPortainerUrlInput(server.portainerUrl || "");
    setServerProxmoxUrlInput(server.proxmoxUrl || "");
    setServerGrafanaUrlInput(server.grafanaUrl || "");
  }, []);

  const importServerConfig = useCallback((config: { name?: string; url?: string; token?: string; cwd?: string; backend?: string; vmHost?: string; vmType?: string; vmName?: string; vmId?: string; sshHost?: string; sshUser?: string; sshPort?: string | number; portainerUrl?: string; proxmoxUrl?: string; grafanaUrl?: string }) => {
    const importedPort = sanitizeSshPort(config.sshPort);
    setEditingServerId(null);
    setServerNameInput(config.name?.trim() || DEFAULT_SERVER_NAME);
    setServerUrlInput(normalizeBaseUrl(config.url || ""));
    setServerTokenInput(config.token?.trim() || "");
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
    setServerVmHostInput(config.vmHost?.trim() || "");
    setServerVmTypeInput(normalizeVmType(config.vmType) || "");
    setServerVmNameInput(config.vmName?.trim() || "");
    setServerVmIdInput(config.vmId?.trim() || "");
    setServerSshHostInput(config.sshHost?.trim() || "");
    setServerSshUserInput(config.sshUser?.trim() || "");
    setServerSshPortInput(String(importedPort || DEFAULT_SSH_PORT));
    setServerPortainerUrlInput(config.portainerUrl?.trim() || "");
    setServerProxmoxUrlInput(config.proxmoxUrl?.trim() || "");
    setServerGrafanaUrlInput(config.grafanaUrl?.trim() || "");
  }, []);

  const saveServer = useCallback(async () => {
    const cleanedName = serverNameInput.trim() || DEFAULT_SERVER_NAME;
    const cleanedBaseUrl = normalizeBaseUrl(serverUrlInput);
    const cleanedToken = serverTokenInput.trim();
    const cleanedCwd = serverCwdInput.trim() || DEFAULT_CWD;
    const cleanedSshHost = serverSshHostInput.trim();
    const cleanedSshUser = serverSshUserInput.trim();
    const cleanedSshPort = sanitizeSshPort(serverSshPortInput);
    const enteredSshPort = serverSshPortInput.trim();
    const cleanedVmHost = serverVmHostInput.trim();
    const cleanedVmType = normalizeVmType(serverVmTypeInput);
    const cleanedVmName = serverVmNameInput.trim();
    const cleanedVmId = serverVmIdInput.trim();
    const cleanedPortainerUrl = serverPortainerUrlInput.trim();
    const cleanedProxmoxUrl = serverProxmoxUrlInput.trim();
    const cleanedGrafanaUrl = serverGrafanaUrlInput.trim();

    if (!cleanedBaseUrl) {
      throw new Error("Server URL is required.");
    }

    if (!cleanedToken) {
      throw new Error("Server token is required.");
    }

    if (cleanedSshHost && enteredSshPort && !cleanedSshPort) {
      throw new Error("SSH port must be between 1 and 65535.");
    }

    let nextServers: ServerProfile[] = [];
    let nextActiveId = activeServerId;

    if (editingServerId) {
      const editingServer = servers.find((server) => server.id === editingServerId);
      if (editingServer && !canEditServerProfile(editingServer)) {
        throw new Error("Team-managed servers are read-only and cannot be edited on this device.");
      }
      nextServers = servers.map((server) =>
        server.id === editingServerId
          ? {
              ...server,
              name: cleanedName,
              baseUrl: cleanedBaseUrl,
              token: cleanedToken,
              defaultCwd: cleanedCwd,
              terminalBackend: serverBackendInput || DEFAULT_TERMINAL_BACKEND,
              vmHost: cleanedVmHost || undefined,
              vmType: cleanedVmType,
              vmName: cleanedVmName || undefined,
              vmId: cleanedVmId || undefined,
              sshHost: cleanedSshHost || undefined,
              sshUser: cleanedSshUser || undefined,
              sshPort: cleanedSshHost ? cleanedSshPort : undefined,
              portainerUrl: cleanedPortainerUrl || undefined,
              proxmoxUrl: cleanedProxmoxUrl || undefined,
              grafanaUrl: cleanedGrafanaUrl || undefined,
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
        source: "local",
        terminalBackend: serverBackendInput || DEFAULT_TERMINAL_BACKEND,
        vmHost: cleanedVmHost || undefined,
        vmType: cleanedVmType,
        vmName: cleanedVmName || undefined,
        vmId: cleanedVmId || undefined,
        sshHost: cleanedSshHost || undefined,
        sshUser: cleanedSshUser || undefined,
        sshPort: cleanedSshHost ? cleanedSshPort : undefined,
        portainerUrl: cleanedPortainerUrl || undefined,
        proxmoxUrl: cleanedProxmoxUrl || undefined,
        grafanaUrl: cleanedGrafanaUrl || undefined,
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
    serverSshHostInput,
    serverSshPortInput,
    serverSshUserInput,
    serverVmHostInput,
    serverVmIdInput,
    serverVmNameInput,
    serverVmTypeInput,
    serverPortainerUrlInput,
    serverProxmoxUrlInput,
    serverGrafanaUrlInput,
    servers,
  ]);

  const addServerDirect = useCallback(
    async (server: { name: string; baseUrl: string; token: string; defaultCwd: string; terminalBackend?: ServerProfile["terminalBackend"]; vmHost?: string; vmType?: VmType | string; vmName?: string; vmId?: string; sshHost?: string; sshUser?: string; sshPort?: number; portainerUrl?: string; proxmoxUrl?: string; grafanaUrl?: string }) => {
      const cleanedBaseUrl = normalizeBaseUrl(server.baseUrl);
      const cleanedToken = server.token.trim();
      const cleanedVmHost = server.vmHost?.trim() || "";
      const cleanedVmType = normalizeVmType(server.vmType);
      const cleanedVmName = server.vmName?.trim() || "";
      const cleanedVmId = server.vmId?.trim() || "";
      const cleanedSshHost = server.sshHost?.trim() || "";
      const cleanedSshUser = server.sshUser?.trim() || "";
      const cleanedSshPort = sanitizeSshPort(server.sshPort);
      const cleanedPortainerUrl = server.portainerUrl?.trim() || "";
      const cleanedProxmoxUrl = server.proxmoxUrl?.trim() || "";
      const cleanedGrafanaUrl = server.grafanaUrl?.trim() || "";
      if (!cleanedBaseUrl || !cleanedToken) {
        throw new Error("Server URL and token are required.");
      }

      const newServer: ServerProfile = {
        id: makeId(),
        name: server.name.trim() || DEFAULT_SERVER_NAME,
        baseUrl: cleanedBaseUrl,
        token: cleanedToken,
        defaultCwd: server.defaultCwd.trim(),
        source: "local",
        terminalBackend: server.terminalBackend || DEFAULT_TERMINAL_BACKEND,
        vmHost: cleanedVmHost || undefined,
        vmType: cleanedVmType,
        vmName: cleanedVmName || undefined,
        vmId: cleanedVmId || undefined,
        sshHost: cleanedSshHost || undefined,
        sshUser: cleanedSshUser || undefined,
        sshPort: cleanedSshHost ? cleanedSshPort : undefined,
        portainerUrl: cleanedPortainerUrl || undefined,
        proxmoxUrl: cleanedProxmoxUrl || undefined,
        grafanaUrl: cleanedGrafanaUrl || undefined,
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
      const target = servers.find((server) => server.id === serverId);
      if (target && !canDeleteServerProfile(target)) {
        throw new Error("Team-managed servers are controlled by your team admin and cannot be deleted locally.");
      }
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

  const replaceTeamServers = useCallback(
    async (incomingTeamServers: ServerProfile[]) => {
      const normalizedTeamServers = incomingTeamServers.map((server) =>
        normalizeServerProfile({
          ...server,
          source: "team",
          permissionLevel: normalizeTeamPermissionLevel(server.permissionLevel),
          teamServerId: server.teamServerId || server.id,
        })
      );

      const teamBaseUrls = new Set(
        normalizedTeamServers
          .map((server) => normalizeBaseUrl(server.baseUrl))
          .filter(Boolean)
      );

      const localServers = servers.filter((server) => {
        if (server.source === "team") {
          return false;
        }
        const normalizedBaseUrl = normalizeBaseUrl(server.baseUrl);
        return !normalizedBaseUrl || !teamBaseUrls.has(normalizedBaseUrl);
      });
      const nextServers = [...normalizedTeamServers, ...localServers];

      const activeServer = servers.find((server) => server.id === activeServerId) || null;
      const activeBaseUrl = activeServer ? normalizeBaseUrl(activeServer.baseUrl) : "";
      const matchingTeamActiveId = activeBaseUrl
        ? normalizedTeamServers.find((server) => normalizeBaseUrl(server.baseUrl) === activeBaseUrl)?.id || null
        : null;
      const resolvedActive =
        nextServers.find((server) => server.id === activeServerId)?.id ??
        matchingTeamActiveId ??
        normalizedTeamServers[0]?.id ??
        localServers[0]?.id ??
        null;

      setServers(nextServers);
      setActiveServerId(resolvedActive);
      await persistServers(nextServers, resolvedActive);
    },
    [activeServerId, persistServers, servers]
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
                  ...normalizeServerProfile(entry),
                  terminalBackend: entry.terminalBackend || DEFAULT_TERMINAL_BACKEND,
                  vmHost: entry.vmHost?.trim() || undefined,
                  vmType: normalizeVmType(entry.vmType),
                  vmName: entry.vmName?.trim() || undefined,
                  vmId: entry.vmId?.trim() || undefined,
                  sshHost: entry.sshHost?.trim() || undefined,
                  sshUser: entry.sshUser?.trim() || undefined,
                  sshPort: entry.sshHost ? sanitizeSshPort(entry.sshPort) : undefined,
                  portainerUrl: entry.portainerUrl?.trim() || undefined,
                  proxmoxUrl: entry.proxmoxUrl?.trim() || undefined,
                  grafanaUrl: entry.grafanaUrl?.trim() || undefined,
                }))
              : [];
          } catch {
            parsedServers = [];
          }
        }

        let seededServer: ServerProfile | null = null;
        let seededServerChanged = false;
        if (isDevRuntime()) {
          seededServer = buildDevSeedServer();
          const merged = mergeDevSeedServer(parsedServers, seededServer);
          parsedServers = merged.servers;
          seededServerChanged = merged.changed;
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
          parsedServers.find((server) => server.id === savedActiveId)?.id ??
          seededServer?.id ??
          parsedServers[0]?.id ??
          null;

        if (isDevRuntime() && seededServerChanged) {
          await Promise.all([
            SecureStore.setItemAsync(STORAGE_SERVERS, JSON.stringify(parsedServers)),
            resolvedActive
              ? SecureStore.setItemAsync(STORAGE_ACTIVE_SERVER_ID, resolvedActive)
              : SecureStore.deleteItemAsync(STORAGE_ACTIVE_SERVER_ID),
          ]);
        }

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
    serverSshHostInput,
    serverSshUserInput,
    serverSshPortInput,
    serverVmHostInput,
    serverVmTypeInput,
    serverVmNameInput,
    serverVmIdInput,
    serverPortainerUrlInput,
    serverProxmoxUrlInput,
    serverGrafanaUrlInput,
    editingServerId,
    tokenMasked,
    setServerNameInput,
    setServerUrlInput,
    setServerTokenInput,
    setServerCwdInput,
    setServerBackendInput,
    setServerSshHostInput,
    setServerSshUserInput,
    setServerSshPortInput,
    setServerVmHostInput,
    setServerVmTypeInput,
    setServerVmNameInput,
    setServerVmIdInput,
    setServerPortainerUrlInput,
    setServerProxmoxUrlInput,
    setServerGrafanaUrlInput,
    setTokenMasked,
    beginCreateServer,
    beginEditServer,
    importServerConfig,
    addServerDirect,
    saveServer,
    deleteServer,
    useServer,
    replaceTeamServers,
  };
}
