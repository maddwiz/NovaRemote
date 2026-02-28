import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";

type SessionMeta = {
  name: string;
  created_at?: string;
  attached?: boolean;
  windows?: number;
};

type CodexStartResponse = {
  ok: boolean;
  session: string;
  tail?: string;
  open_on_mac?: {
    requested: boolean;
    opened: boolean;
    error: string | null;
  };
};

type CodexMessageResponse = {
  ok: boolean;
  session: string;
  tail?: string;
};

type ShellRunResponse = {
  ok: boolean;
  session: string;
  output?: string;
};

type TmuxTailResponse = {
  session: string;
  output?: string;
};

type TmuxStreamMessage = {
  type: "delta" | "snapshot" | "session_closed" | "error";
  session: string;
  data: string;
};

type ServerProfile = {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  defaultCwd: string;
};

type TerminalSendMode = "ai" | "shell";

type RouteTab = "terminals" | "servers";

type Status = {
  text: string;
  error: boolean;
};

const STORAGE_SERVERS = "novaremote.servers.v1";
const STORAGE_ACTIVE_SERVER_ID = "novaremote.active_server_id.v1";
const STORAGE_LEGACY_BASE_URL = "novaremote.base_url";
const STORAGE_LEGACY_TOKEN = "novaremote.token";

const DEFAULT_BASE_URL = "http://desmonds-macbook-pro.tail9961a2.ts.net:8787";
const DEFAULT_CWD = "/Users/desmondpottle/Documents/New project";
const BRAND_LOGO = require("./assets/novaai-logo-user.png");

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function websocketUrl(baseUrl: string, token: string, session: string): string {
  const safeBase = normalizeBaseUrl(baseUrl);
  const wsBase = safeBase.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
  return `${wsBase}/tmux/stream?session=${encodeURIComponent(session)}&token=${encodeURIComponent(token.trim())}`;
}

function sortByCreatedAt(sessions: SessionMeta[]): SessionMeta[] {
  return sessions.slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildDefaultServer(): ServerProfile {
  return {
    id: makeId(),
    name: "My Mac",
    baseUrl: DEFAULT_BASE_URL,
    token: "",
    defaultCwd: DEFAULT_CWD,
  };
}

function isLikelyAiSession(name: string): boolean {
  return name.toLowerCase().includes("codex");
}

function makeShellSessionName(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `term-${stamp}-${suffix}`;
}

async function apiRequest<T>(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, { ...init, headers });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        detail = `${response.status} ${payload.detail}`;
      }
    } catch {
      // Ignore JSON parse failures.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

export default function App() {
  const [route, setRoute] = useState<RouteTab>("terminals");

  const [servers, setServers] = useState<ServerProfile[]>([]);
  const [activeServerId, setActiveServerId] = useState<string | null>(null);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);

  const [serverNameInput, setServerNameInput] = useState<string>("");
  const [serverUrlInput, setServerUrlInput] = useState<string>(DEFAULT_BASE_URL);
  const [serverTokenInput, setServerTokenInput] = useState<string>("");
  const [serverCwdInput, setServerCwdInput] = useState<string>(DEFAULT_CWD);
  const [editingServerId, setEditingServerId] = useState<string | null>(null);
  const [tokenMasked, setTokenMasked] = useState<boolean>(true);

  const [status, setStatus] = useState<Status>({ text: "Booting", error: false });

  const [allSessions, setAllSessions] = useState<string[]>([]);
  const [openSessions, setOpenSessions] = useState<string[]>([]);
  const [tails, setTails] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendBusy, setSendBusy] = useState<Record<string, boolean>>({});
  const [streamLive, setStreamLive] = useState<Record<string, boolean>>({});
  const [sendModes, setSendModes] = useState<Record<string, TerminalSendMode>>({});

  const [startCwd, setStartCwd] = useState<string>(DEFAULT_CWD);
  const [startPrompt, setStartPrompt] = useState<string>("");
  const [startOpenOnMac, setStartOpenOnMac] = useState<boolean>(true);
  const [startKind, setStartKind] = useState<TerminalSendMode>("ai");

  const [focusedSession, setFocusedSession] = useState<string | null>(null);

  const pollInFlight = useRef<Set<string>>(new Set());
  const sendInFlight = useRef<Set<string>>(new Set());
  const terminalRefs = useRef<Record<string, ScrollView | null>>({});
  const streamRefs = useRef<Record<string, WebSocket | null>>({});
  const streamRetryRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const openSessionsRef = useRef<string[]>([]);
  const connectedRef = useRef<boolean>(false);

  const activeServer = useMemo(
    () => servers.find((server) => server.id === activeServerId) ?? null,
    [servers, activeServerId]
  );

  const connected = useMemo(() => {
    if (!activeServer) {
      return false;
    }
    return Boolean(normalizeBaseUrl(activeServer.baseUrl) && activeServer.token.trim());
  }, [activeServer]);

  const setReady = useCallback((text: string = "Ready") => {
    setStatus({ text, error: false });
  }, []);

  const setError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ text: message, error: true });
  }, []);

  const persistServers = useCallback(async (nextServers: ServerProfile[], nextActiveId: string | null) => {
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_SERVERS, JSON.stringify(nextServers)),
      nextActiveId
        ? SecureStore.setItemAsync(STORAGE_ACTIVE_SERVER_ID, nextActiveId)
        : SecureStore.deleteItemAsync(STORAGE_ACTIVE_SERVER_ID),
    ]);
  }, []);

  const closeStream = useCallback((session: string) => {
    const retry = streamRetryRefs.current[session];
    if (retry) {
      clearTimeout(retry);
      streamRetryRefs.current[session] = null;
    }

    const ws = streamRefs.current[session];
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // Ignore close failures.
      }
      streamRefs.current[session] = null;
    }

    setStreamLive((prev) => {
      if (!(session in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[session];
      return next;
    });
  }, []);

  const closeAllStreams = useCallback(() => {
    Object.keys(streamRefs.current).forEach(closeStream);
  }, [closeStream]);

  const fetchTail = useCallback(
    async (session: string, showErrors: boolean) => {
      if (!activeServer || !connected || pollInFlight.current.has(session)) {
        return;
      }

      pollInFlight.current.add(session);
      try {
        const data = await apiRequest<TmuxTailResponse>(
          activeServer.baseUrl,
          activeServer.token,
          `/tmux/tail?session=${encodeURIComponent(session)}&lines=600`
        );
        const output = data.output ?? "";
        setTails((prev) => (prev[session] === output ? prev : { ...prev, [session]: output }));
      } catch (error) {
        if (showErrors) {
          setError(error);
        }
      } finally {
        pollInFlight.current.delete(session);
      }
    },
    [activeServer, connected, setError]
  );

  const connectStream = useCallback(
    (session: string) => {
      if (!activeServer || !connected) {
        return;
      }

      const existing = streamRefs.current[session];
      if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
        return;
      }

      const retry = streamRetryRefs.current[session];
      if (retry) {
        clearTimeout(retry);
        streamRetryRefs.current[session] = null;
      }

      const ws = new WebSocket(websocketUrl(activeServer.baseUrl, activeServer.token, session));
      streamRefs.current[session] = ws;

      ws.onopen = () => {
        setStreamLive((prev) => ({ ...prev, [session]: true }));
      };

      ws.onmessage = (event) => {
        let message: TmuxStreamMessage | null = null;
        try {
          message = JSON.parse(String(event.data)) as TmuxStreamMessage;
        } catch {
          return;
        }

        if (!message || message.session !== session) {
          return;
        }

        if (message.type === "snapshot") {
          const output = message.data ?? "";
          setTails((prev) => (prev[session] === output ? prev : { ...prev, [session]: output }));
          return;
        }

        if (message.type === "delta") {
          const delta = message.data ?? "";
          setTails((prev) => {
            const nextOutput = `${prev[session] ?? ""}${delta}`;
            if (prev[session] === nextOutput) {
              return prev;
            }
            return { ...prev, [session]: nextOutput };
          });
          return;
        }

        if (message.type === "session_closed") {
          closeStream(session);
        }
      };

      ws.onclose = () => {
        setStreamLive((prev) => ({ ...prev, [session]: false }));
        streamRefs.current[session] = null;

        if (!connectedRef.current || !openSessionsRef.current.includes(session)) {
          return;
        }

        streamRetryRefs.current[session] = setTimeout(() => {
          streamRetryRefs.current[session] = null;
          connectStream(session);
        }, 900);
      };

      ws.onerror = () => {
        // Let onclose trigger retries.
      };
    },
    [activeServer, closeStream, connected]
  );

  const runWithStatus = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setStatus({ text: label, error: false });
      try {
        await fn();
        setReady();
      } catch (error) {
        setError(error);
      }
    },
    [setError, setReady]
  );

  const resetTerminalState = useCallback(() => {
    setAllSessions([]);
    setOpenSessions([]);
    setTails({});
    setDrafts({});
    setSendBusy({});
    setStreamLive({});
    setSendModes({});
    setFocusedSession(null);
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!activeServer || !connected) {
      throw new Error("Select a server with URL and token first.");
    }

    const data = await apiRequest<{ sessions: SessionMeta[] }>(
      activeServer.baseUrl,
      activeServer.token,
      "/tmux/sessions"
    );

    const names = sortByCreatedAt(data.sessions || []).map((entry) => entry.name);
    setAllSessions(names);

    setSendModes((prev) => {
      const next = { ...prev };
      names.forEach((session) => {
        if (!next[session]) {
          next[session] = isLikelyAiSession(session) ? "ai" : "shell";
        }
      });
      Object.keys(next).forEach((session) => {
        if (!names.includes(session)) {
          delete next[session];
        }
      });
      return next;
    });

    setOpenSessions((prev) => {
      const existing = prev.filter((name) => names.includes(name));
      if (existing.length > 0) {
        return existing;
      }
      if (names.length > 0) {
        return [names[0]];
      }
      return [];
    });
  }, [activeServer, connected]);

  const beginCreateServer = useCallback(() => {
    setEditingServerId(null);
    setServerNameInput("");
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
    setRoute("servers");
  }, []);

  const saveServer = useCallback(async () => {
    const cleanedName = serverNameInput.trim();
    const cleanedBaseUrl = normalizeBaseUrl(serverUrlInput);
    const cleanedToken = serverTokenInput.trim();
    const cleanedCwd = serverCwdInput.trim() || DEFAULT_CWD;

    if (!cleanedName) {
      throw new Error("Server name is required.");
    }

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
    setRoute("terminals");
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
      setRoute("terminals");
    },
    [persistServers, servers]
  );

  const toggleSessionVisible = useCallback((session: string) => {
    setOpenSessions((prev) => {
      if (prev.includes(session)) {
        return prev.filter((name) => name !== session);
      }
      return [session, ...prev];
    });
  }, []);

  const removeOpenSession = useCallback((session: string) => {
    setOpenSessions((prev) => prev.filter((name) => name !== session));
    closeStream(session);
    setFocusedSession((prev) => (prev === session ? null : prev));
  }, [closeStream]);

  const setSessionMode = useCallback((session: string, mode: TerminalSendMode) => {
    setSendModes((prev) => ({ ...prev, [session]: mode }));
  }, []);

  const handleStartSession = useCallback(async () => {
    if (!activeServer || !connected) {
      throw new Error("Connect to a server first.");
    }

    const cwd = startCwd.trim() || activeServer.defaultCwd || DEFAULT_CWD;

    if (startKind === "ai") {
      const payload = {
        cwd,
        initial_prompt: startPrompt.trim() || null,
        open_on_mac: startOpenOnMac,
      };

      const data = await apiRequest<CodexStartResponse>(activeServer.baseUrl, activeServer.token, "/codex/start", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const session = data.session;
      setAllSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
      setOpenSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
      setSendModes((prev) => ({ ...prev, [session]: "ai" }));
      if (data.tail) {
        setTails((prev) => ({ ...prev, [session]: data.tail || "" }));
      }

      if (startPrompt.trim()) {
        setStartPrompt("");
      }

      if (startOpenOnMac && data.open_on_mac && !data.open_on_mac.opened) {
        throw new Error(data.open_on_mac.error || "Session started, but Mac open failed.");
      }

      return;
    }

    const session = makeShellSessionName();
    await apiRequest(activeServer.baseUrl, activeServer.token, "/tmux/session", {
      method: "POST",
      body: JSON.stringify({ session, cwd }),
    });

    const initialCommand = startPrompt.trim();
    if (initialCommand) {
      await apiRequest(activeServer.baseUrl, activeServer.token, "/tmux/send", {
        method: "POST",
        body: JSON.stringify({ session, text: initialCommand, enter: true }),
      });
      setStartPrompt("");
    }

    const tail = await apiRequest<TmuxTailResponse>(
      activeServer.baseUrl,
      activeServer.token,
      `/tmux/tail?session=${encodeURIComponent(session)}&lines=380`
    );

    setAllSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
    setOpenSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
    setSendModes((prev) => ({ ...prev, [session]: "shell" }));
    setTails((prev) => ({ ...prev, [session]: tail.output || "" }));
  }, [activeServer, connected, startCwd, startKind, startOpenOnMac, startPrompt]);

  const handleSend = useCallback(
    async (session: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      if (sendInFlight.current.has(session)) {
        return;
      }

      const currentDraft = (drafts[session] || "").trim();
      if (!currentDraft) {
        return;
      }

      const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");

      sendInFlight.current.add(session);
      setSendBusy((prev) => ({ ...prev, [session]: true }));
      setDrafts((prev) => ({ ...prev, [session]: "" }));

      try {
        if (mode === "ai") {
          const data = await apiRequest<CodexMessageResponse>(activeServer.baseUrl, activeServer.token, "/codex/message", {
            method: "POST",
            body: JSON.stringify({ session, message: currentDraft }),
          });

          if (data.tail) {
            setTails((prev) => ({ ...prev, [session]: data.tail || "" }));
          }
        } else {
          const data = await apiRequest<ShellRunResponse>(activeServer.baseUrl, activeServer.token, "/shell/run", {
            method: "POST",
            body: JSON.stringify({ session, command: currentDraft, wait_ms: 400, tail_lines: 380 }),
          });

          if (data.output) {
            setTails((prev) => ({ ...prev, [session]: data.output || "" }));
          }
        }
      } catch (error) {
        setDrafts((prev) => ({ ...prev, [session]: currentDraft }));
        throw error;
      } finally {
        sendInFlight.current.delete(session);
        setSendBusy((prev) => ({ ...prev, [session]: false }));
      }
    },
    [activeServer, connected, drafts, sendModes]
  );

  const handleStop = useCallback(
    async (session: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      await apiRequest(activeServer.baseUrl, activeServer.token, "/tmux/ctrl", {
        method: "POST",
        body: JSON.stringify({ session, key: "C-c" }),
      });
    },
    [activeServer, connected]
  );

  const handleOpenOnMac = useCallback(
    async (session: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      await apiRequest(activeServer.baseUrl, activeServer.token, "/mac/attach", {
        method: "POST",
        body: JSON.stringify({ session }),
      });
    },
    [activeServer, connected]
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

        const selected = parsedServers.find((server) => server.id === resolvedActive) ?? parsedServers[0] ?? null;
        if (selected) {
          setStartCwd(selected.defaultCwd || DEFAULT_CWD);
        }

        setStatus({ text: "Profiles loaded", error: false });
      } catch (error) {
        if (mounted) {
          setError(error);
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
  }, [setError]);

  useEffect(() => {
    openSessionsRef.current = openSessions;
  }, [openSessions]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  useEffect(() => {
    if (!activeServer) {
      return;
    }

    setStartCwd(activeServer.defaultCwd || DEFAULT_CWD);
    resetTerminalState();
    closeAllStreams();

    if (!loadingSettings && connected) {
      void runWithStatus(`Syncing ${activeServer.name}`, async () => {
        await refreshSessions();
      });
    }
  }, [activeServerId, closeAllStreams, connected, loadingSettings, refreshSessions, resetTerminalState, runWithStatus, activeServer]);

  useEffect(() => {
    if (!connected) {
      closeAllStreams();
      return;
    }

    Object.keys(streamRefs.current).forEach((session) => {
      if (!openSessions.includes(session)) {
        closeStream(session);
      }
    });

    openSessions.forEach((session) => {
      connectStream(session);
    });
  }, [closeAllStreams, closeStream, connectStream, connected, openSessions]);

  useEffect(() => {
    return () => {
      closeAllStreams();
    };
  }, [closeAllStreams]);

  useEffect(() => {
    if (!connected || openSessions.length === 0) {
      return;
    }

    const id = setInterval(() => {
      openSessions.forEach((session) => {
        if (!streamLive[session]) {
          void fetchTail(session, false);
        }
      });
    }, 1800);

    return () => clearInterval(id);
  }, [connected, fetchTail, openSessions, streamLive]);

  useEffect(() => {
    if (!connected || openSessions.length === 0) {
      return;
    }

    openSessions.forEach((session) => {
      void fetchTail(session, false);
    });
  }, [connected, fetchTail, openSessions]);

  const activeServerName = activeServer?.name || "No Server";
  const focusedOutput = focusedSession ? tails[focusedSession] ?? "" : "";
  const focusedDraft = focusedSession ? drafts[focusedSession] ?? "" : "";
  const focusedIsSending = focusedSession ? Boolean(sendBusy[focusedSession]) : false;
  const focusedMode = focusedSession
    ? sendModes[focusedSession] || (isLikelyAiSession(focusedSession) ? "ai" : "shell")
    : "ai";

  const renderServerManager = () => (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>Server Profiles</Text>
      {servers.length === 0 ? <Text style={styles.emptyText}>No servers yet.</Text> : null}

      <View style={styles.serverListWrap}>
        {servers.map((server) => {
          const isActive = server.id === activeServerId;
          return (
            <View key={server.id} style={[styles.serverCard, isActive ? styles.serverCardActive : null]}>
              <View style={styles.serverCardHeader}>
                <Text style={styles.serverName}>{server.name}</Text>
                <Text style={styles.serverUrl}>{server.baseUrl}</Text>
              </View>
              <View style={styles.actionsWrap}>
                <Pressable style={styles.actionButton} onPress={() => void useServer(server.id)}>
                  <Text style={styles.actionButtonText}>{isActive ? "Active" : "Use"}</Text>
                </Pressable>
                <Pressable style={styles.actionButton} onPress={() => beginEditServer(server)}>
                  <Text style={styles.actionButtonText}>Edit</Text>
                </Pressable>
                <Pressable
                  style={styles.actionDangerButton}
                  onPress={() => {
                    void runWithStatus(`Deleting ${server.name}`, async () => {
                      await deleteServer(server.id);
                    });
                  }}
                >
                  <Text style={styles.actionDangerText}>Delete</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.formDivider} />
      <Text style={styles.panelLabel}>{editingServerId ? "Edit Server" : "Add Server"}</Text>
      <TextInput
        style={styles.input}
        value={serverNameInput}
        autoCapitalize="words"
        autoCorrect={false}
        placeholder="Server name"
        placeholderTextColor="#7f7aa8"
        onChangeText={setServerNameInput}
      />
      <TextInput
        style={styles.input}
        value={serverUrlInput}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Server URL"
        placeholderTextColor="#7f7aa8"
        onChangeText={setServerUrlInput}
      />
      <TextInput
        style={styles.input}
        value={serverTokenInput}
        secureTextEntry={tokenMasked}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Bearer token"
        placeholderTextColor="#7f7aa8"
        onChangeText={setServerTokenInput}
      />
      <TextInput
        style={styles.input}
        value={serverCwdInput}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Default working directory"
        placeholderTextColor="#7f7aa8"
        onChangeText={setServerCwdInput}
      />

      <View style={styles.rowInlineSpace}>
        <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={() => setTokenMasked((prev) => !prev)}>
          <Text style={styles.buttonGhostText}>{tokenMasked ? "Show Token" : "Hide Token"}</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonGhost, styles.flexButton]}
          onPress={beginCreateServer}
        >
          <Text style={styles.buttonGhostText}>Clear Form</Text>
        </Pressable>
      </View>

      <View style={styles.rowInlineSpace}>
        <Pressable
          style={[styles.buttonPrimary, styles.flexButton]}
          onPress={() => {
            void runWithStatus(editingServerId ? "Updating server" : "Saving server", async () => {
              await saveServer();
            });
          }}
        >
          <Text style={styles.buttonPrimaryText}>{editingServerId ? "Update Server" : "Save Server"}</Text>
        </Pressable>
        <Pressable
          style={[styles.buttonGhost, styles.flexButton]}
          onPress={() => setRoute("terminals")}
        >
          <Text style={styles.buttonGhostText}>Back to Terminal</Text>
        </Pressable>
      </View>
    </View>
  );

  const renderTerminalPanels = () => (
    <>
      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Active Server</Text>
        <Text style={styles.serverTitle}>{activeServer?.name || "No server selected"}</Text>
        <Text style={styles.serverSubtitle}>{activeServer?.baseUrl || "Go to Servers tab to add one"}</Text>

        <View style={styles.rowInlineSpace}>
          <Pressable
            style={[styles.buttonPrimary, styles.flexButton]}
            onPress={() => {
              void runWithStatus("Refreshing sessions", async () => {
                await refreshSessions();
              });
            }}
            disabled={!connected}
          >
            <Text style={styles.buttonPrimaryText}>Refresh Sessions</Text>
          </Pressable>
          <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={() => setRoute("servers")}>
            <Text style={styles.buttonGhostText}>Manage Servers</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Start New Session</Text>
        <View style={styles.modeRow}>
          <Pressable
            style={[styles.modeButton, startKind === "ai" ? styles.modeButtonOn : null]}
            onPress={() => setStartKind("ai")}
          >
            <Text style={[styles.modeButtonText, startKind === "ai" ? styles.modeButtonTextOn : null]}>AI</Text>
          </Pressable>
          <Pressable
            style={[styles.modeButton, startKind === "shell" ? styles.modeButtonOn : null]}
            onPress={() => setStartKind("shell")}
          >
            <Text style={[styles.modeButtonText, startKind === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
          </Pressable>
        </View>

        <TextInput
          style={styles.input}
          value={startCwd}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Working directory"
          placeholderTextColor="#7f7aa8"
          onChangeText={setStartCwd}
        />
        <TextInput
          style={[styles.input, styles.multilineInput]}
          value={startPrompt}
          multiline
          placeholder={startKind === "ai" ? "Optional first message" : "Optional first command"}
          placeholderTextColor="#7f7aa8"
          onChangeText={setStartPrompt}
        />

        {startKind === "ai" ? (
          <View style={styles.rowInlineSpace}>
            <Text style={styles.switchLabel}>Open session on Mac Terminal</Text>
            <Switch
              trackColor={{ false: "#33596c", true: "#0ea8c8" }}
              thumbColor={startOpenOnMac ? "#d4fdff" : "#d3dee5"}
              value={startOpenOnMac}
              onValueChange={setStartOpenOnMac}
            />
          </View>
        ) : null}

        <Pressable
          style={styles.buttonPrimary}
          onPress={() => {
            void runWithStatus("Starting session", async () => {
              await handleStartSession();
            });
          }}
          disabled={!connected}
        >
          <Text style={styles.buttonPrimaryText}>Start {startKind === "ai" ? "AI" : "Shell"} Session</Text>
        </Pressable>
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Available Sessions</Text>
        {allSessions.length === 0 ? (
          <Text style={styles.emptyText}>No sessions found yet.</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {allSessions.map((session) => {
              const active = openSessions.includes(session);
              return (
                <Pressable
                  key={session}
                  style={[styles.chip, active ? styles.chipActive : null]}
                  onPress={() => toggleSessionVisible(session)}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                    {active ? `Open - ${session}` : session}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <View style={styles.panel}>
        <Text style={styles.panelLabel}>Open Terminals</Text>
        {openSessions.length === 0 ? (
          <Text style={styles.emptyText}>Tap a session above to open it.</Text>
        ) : (
          openSessions.map((session) => {
            const output = tails[session] ?? "";
            const draft = drafts[session] ?? "";
            const isSending = Boolean(sendBusy[session]);
            const isLive = Boolean(streamLive[session]);
            const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");

            return (
              <View key={session} style={styles.terminalCard}>
                <View style={styles.terminalHeader}>
                  <View style={styles.terminalNameRow}>
                    <Text style={styles.terminalName}>{session}</Text>
                    <View style={styles.pillGroup}>
                      <Text style={[styles.modePill, mode === "ai" ? styles.modePillAi : styles.modePillShell]}>
                        {mode.toUpperCase()}
                      </Text>
                      <Text style={[styles.livePill, isLive ? styles.livePillOn : styles.livePillOff]}>
                        {isLive ? "LIVE" : "SYNC"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.modeRow}>
                    <Pressable
                      style={[styles.modeButton, mode === "ai" ? styles.modeButtonOn : null]}
                      onPress={() => setSessionMode(session, "ai")}
                    >
                      <Text style={[styles.modeButtonText, mode === "ai" ? styles.modeButtonTextOn : null]}>AI</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.modeButton, mode === "shell" ? styles.modeButtonOn : null]}
                      onPress={() => setSessionMode(session, "shell")}
                    >
                      <Text style={[styles.modeButtonText, mode === "shell" ? styles.modeButtonTextOn : null]}>Shell</Text>
                    </Pressable>
                  </View>

                  <View style={styles.actionsWrap}>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => {
                        void runWithStatus(`Opening ${session} on Mac`, async () => {
                          await handleOpenOnMac(session);
                        });
                      }}
                    >
                      <Text style={styles.actionButtonText}>Open on Mac</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => {
                        void runWithStatus(`Syncing ${session}`, async () => {
                          await fetchTail(session, true);
                        });
                      }}
                    >
                      <Text style={styles.actionButtonText}>Sync</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionButton}
                      onPress={() => setFocusedSession(session)}
                    >
                      <Text style={styles.actionButtonText}>Fullscreen</Text>
                    </Pressable>
                    <Pressable
                      style={styles.actionDangerButton}
                      onPress={() => {
                        void runWithStatus(`Stopping ${session}`, async () => {
                          await handleStop(session);
                        });
                      }}
                    >
                      <Text style={styles.actionDangerText}>Stop</Text>
                    </Pressable>
                    <Pressable style={styles.actionButton} onPress={() => removeOpenSession(session)}>
                      <Text style={styles.actionButtonText}>Hide</Text>
                    </Pressable>
                  </View>
                </View>

                <ScrollView
                  ref={(ref) => {
                    terminalRefs.current[session] = ref;
                  }}
                  style={styles.terminalView}
                  onContentSizeChange={() => terminalRefs.current[session]?.scrollToEnd({ animated: true })}
                >
                  <Text style={styles.terminalText}>{output || "Waiting for output..."}</Text>
                </ScrollView>

                <TextInput
                  style={[styles.input, styles.multilineInput]}
                  value={draft}
                  multiline
                  editable={!isSending}
                  placeholder={mode === "ai" ? "Message AI..." : "Run shell command..."}
                  placeholderTextColor="#7f7aa8"
                  onChangeText={(value) =>
                    setDrafts((prev) => ({
                      ...prev,
                      [session]: value,
                    }))
                  }
                />

                <View style={styles.rowInlineSpace}>
                  <Pressable
                    style={[styles.buttonPrimary, styles.flexButton, isSending ? styles.buttonDisabled : null]}
                    disabled={isSending}
                    onPress={() => {
                      void runWithStatus(`Sending to ${session}`, async () => {
                        await handleSend(session);
                      });
                    }}
                  >
                    <Text style={styles.buttonPrimaryText}>{isSending ? "Sending..." : "Send"}</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.buttonGhost, styles.flexButton]}
                    onPress={() => setDrafts((prev) => ({ ...prev, [session]: "" }))}
                  >
                    <Text style={styles.buttonGhostText}>Clear</Text>
                  </Pressable>
                </View>
              </View>
            );
          })
        )}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.bgBlobTop} />
      <View style={styles.bgBlobBottom} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={12}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <View style={styles.panelHeader}>
            <Image source={BRAND_LOGO} style={styles.brandLogo} resizeMode="cover" />
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>NovaRemote</Text>
              <Text style={styles.subtitle}>Universal AI + Terminal Remote Control</Text>
            </View>
            <View style={styles.headerRowWrap}>
              <Text style={styles.serverBadge}>{activeServerName}</Text>
              <View style={[styles.statusPill, status.error ? styles.statusPillError : null]}>
                <Text style={styles.statusText}>{status.text}</Text>
              </View>
            </View>
          </View>

          <View style={styles.tabRow}>
            <Pressable
              style={[styles.tabButton, route === "terminals" ? styles.tabButtonOn : null]}
              onPress={() => setRoute("terminals")}
            >
              <Text style={[styles.tabButtonText, route === "terminals" ? styles.tabButtonTextOn : null]}>
                Terminals
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tabButton, route === "servers" ? styles.tabButtonOn : null]}
              onPress={() => setRoute("servers")}
            >
              <Text style={[styles.tabButtonText, route === "servers" ? styles.tabButtonTextOn : null]}>
                Servers
              </Text>
            </Pressable>
          </View>

          {route === "servers" ? renderServerManager() : renderTerminalPanels()}
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal
        animationType="slide"
        transparent={false}
        visible={Boolean(focusedSession)}
        onRequestClose={() => setFocusedSession(null)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{focusedSession || "Terminal"}</Text>
            <View style={styles.rowInlineSpace}>
              {focusedSession ? (
                <Pressable
                  style={styles.actionButton}
                  onPress={() => setSessionMode(focusedSession, focusedMode === "ai" ? "shell" : "ai")}
                >
                  <Text style={styles.actionButtonText}>{focusedMode === "ai" ? "Switch to Shell" : "Switch to AI"}</Text>
                </Pressable>
              ) : null}
              <Pressable style={styles.actionButton} onPress={() => setFocusedSession(null)}>
                <Text style={styles.actionButtonText}>Close</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView
            style={styles.modalTerminalView}
            ref={(ref) => {
              if (focusedSession) {
                terminalRefs.current[focusedSession] = ref;
              }
            }}
            onContentSizeChange={() => {
              if (focusedSession) {
                terminalRefs.current[focusedSession]?.scrollToEnd({ animated: true });
              }
            }}
          >
            <Text style={styles.terminalText}>{focusedOutput || "Waiting for output..."}</Text>
          </ScrollView>

          {focusedSession ? (
            <>
              <TextInput
                style={[styles.input, styles.modalInput]}
                value={focusedDraft}
                multiline
                editable={!focusedIsSending}
                placeholder={focusedMode === "ai" ? "Message AI..." : "Run shell command..."}
                placeholderTextColor="#7f7aa8"
                onChangeText={(value) => setDrafts((prev) => ({ ...prev, [focusedSession]: value }))}
              />

              <View style={styles.rowInlineSpace}>
                <Pressable
                  style={[styles.buttonPrimary, styles.flexButton, focusedIsSending ? styles.buttonDisabled : null]}
                  disabled={focusedIsSending}
                  onPress={() => {
                    void runWithStatus(`Sending to ${focusedSession}`, async () => {
                      await handleSend(focusedSession);
                    });
                  }}
                >
                  <Text style={styles.buttonPrimaryText}>{focusedIsSending ? "Sending..." : "Send"}</Text>
                </Pressable>
                <Pressable
                  style={[styles.actionDangerButton, styles.flexButton]}
                  onPress={() => {
                    void runWithStatus(`Stopping ${focusedSession}`, async () => {
                      await handleStop(focusedSession);
                    });
                  }}
                >
                  <Text style={styles.actionDangerText}>Ctrl-C</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050111",
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: "#050111",
    padding: 12,
    gap: 10,
  },
  flex: {
    flex: 1,
  },
  bgBlobTop: {
    position: "absolute",
    top: -150,
    left: -90,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "#ff2ea6",
    opacity: 0.22,
  },
  bgBlobBottom: {
    position: "absolute",
    bottom: -180,
    right: -120,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "#26c7ff",
    opacity: 0.2,
  },
  container: {
    paddingHorizontal: 14,
    paddingBottom: 34,
    paddingTop: 8,
    gap: 12,
  },
  panelHeader: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#332a64",
    backgroundColor: "rgba(11, 6, 28, 0.92)",
    padding: 12,
    gap: 12,
    shadowColor: "#ff3aa8",
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  brandLogo: {
    width: "100%",
    height: 170,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#3b2f71",
  },
  headerTextBlock: {
    gap: 4,
  },
  title: {
    color: "#f6edff",
    fontSize: 30,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  subtitle: {
    marginTop: 3,
    color: "#89d0ff",
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  headerRowWrap: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexWrap: "wrap",
  },
  serverBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#5f4f96",
    backgroundColor: "rgba(45, 35, 84, 0.7)",
    color: "#e8dcff",
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: "700",
  },
  statusPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#24d8ff",
    backgroundColor: "rgba(36, 216, 255, 0.12)",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillError: {
    borderColor: "#ff4f9f",
    backgroundColor: "rgba(255, 79, 159, 0.15)",
  },
  statusText: {
    color: "#deffff",
    fontSize: 12,
    fontWeight: "700",
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4a3d84",
    backgroundColor: "rgba(21, 14, 44, 0.94)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
  },
  tabButtonOn: {
    borderColor: "#ff8ad2",
    backgroundColor: "rgba(255, 46, 166, 0.22)",
  },
  tabButtonText: {
    color: "#a9d7ff",
    fontSize: 13,
    fontWeight: "700",
  },
  tabButtonTextOn: {
    color: "#ffe7f8",
  },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#30265f",
    backgroundColor: "rgba(10, 7, 26, 0.9)",
    padding: 12,
    gap: 10,
  },
  panelLabel: {
    color: "#9ad4ff",
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.9,
    marginBottom: 2,
    fontWeight: "700",
  },
  serverTitle: {
    color: "#ffd5f1",
    fontSize: 15,
    fontWeight: "800",
  },
  serverSubtitle: {
    color: "#a7cfff",
    fontSize: 12,
  },
  serverListWrap: {
    gap: 8,
  },
  serverCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#44377a",
    backgroundColor: "rgba(18, 12, 40, 0.95)",
    padding: 10,
    gap: 8,
  },
  serverCardActive: {
    borderColor: "#2fd4ff",
    backgroundColor: "rgba(12, 25, 48, 0.88)",
  },
  serverCardHeader: {
    gap: 2,
  },
  serverName: {
    color: "#f4dfff",
    fontSize: 13,
    fontWeight: "800",
  },
  serverUrl: {
    color: "#93c8f7",
    fontSize: 11,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#3a2d71",
    backgroundColor: "rgba(14, 10, 34, 0.92)",
    color: "#f3ebff",
    paddingHorizontal: 11,
    paddingVertical: 10,
    fontSize: 15,
  },
  multilineInput: {
    minHeight: 86,
    textAlignVertical: "top",
  },
  modalInput: {
    minHeight: 110,
  },
  rowInlineSpace: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: {
    color: "#a6cfff",
    fontSize: 13,
    fontWeight: "600",
  },
  buttonPrimary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#ff8ad2",
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: "#ff2ea6",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPrimaryText: {
    color: "#fff6fc",
    fontWeight: "800",
    fontSize: 14,
  },
  buttonGhost: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4a3d84",
    paddingVertical: 11,
    paddingHorizontal: 12,
    backgroundColor: "rgba(21, 14, 44, 0.94)",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonGhostText: {
    color: "#a9d7ff",
    fontWeight: "700",
    fontSize: 13,
  },
  flexButton: {
    flex: 1,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
  formDivider: {
    height: 1,
    backgroundColor: "#3c316d",
    marginVertical: 4,
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#4a3d84",
    backgroundColor: "rgba(21, 14, 44, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modeButtonOn: {
    borderColor: "#27d9ff",
    backgroundColor: "rgba(39, 217, 255, 0.16)",
  },
  modeButtonText: {
    color: "#a9d7ff",
    fontSize: 12,
    fontWeight: "700",
  },
  modeButtonTextOn: {
    color: "#defbff",
  },
  chipRow: {
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#47377e",
    backgroundColor: "rgba(24, 16, 49, 0.95)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    borderColor: "#ff56b2",
    backgroundColor: "rgba(255, 86, 178, 0.18)",
  },
  chipText: {
    color: "#aad6ff",
    fontSize: 12,
    fontWeight: "700",
  },
  chipTextActive: {
    color: "#ffe0f5",
  },
  terminalCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#342868",
    backgroundColor: "rgba(8, 6, 22, 0.95)",
    padding: 10,
    gap: 8,
    marginBottom: 8,
  },
  terminalHeader: {
    gap: 8,
  },
  terminalNameRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  terminalName: {
    color: "#ffd5f1",
    fontSize: 13,
    fontWeight: "800",
    flex: 1,
  },
  pillGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  modePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    overflow: "hidden",
  },
  modePillAi: {
    color: "#fff0f9",
    borderColor: "#ff6abf",
    backgroundColor: "rgba(255, 106, 191, 0.2)",
  },
  modePillShell: {
    color: "#defbff",
    borderColor: "#27d9ff",
    backgroundColor: "rgba(39, 217, 255, 0.16)",
  },
  livePill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    overflow: "hidden",
  },
  livePillOn: {
    color: "#d5fffb",
    borderColor: "#27d9ff",
    backgroundColor: "rgba(39, 217, 255, 0.16)",
  },
  livePillOff: {
    color: "#ffdff4",
    borderColor: "#b66da0",
    backgroundColor: "rgba(182, 109, 160, 0.16)",
  },
  actionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  actionButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#4b3f86",
    backgroundColor: "rgba(21, 14, 45, 0.95)",
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  actionButtonText: {
    color: "#9fd4ff",
    fontSize: 11,
    fontWeight: "700",
  },
  actionDangerButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ff5fae",
    backgroundColor: "rgba(255, 95, 174, 0.18)",
    paddingHorizontal: 9,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  actionDangerText: {
    color: "#ffd4ee",
    fontSize: 11,
    fontWeight: "800",
  },
  terminalView: {
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2fd4ff",
    backgroundColor: "#02010a",
    minHeight: 230,
    maxHeight: 360,
    padding: 9,
  },
  modalTerminalView: {
    flex: 1,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: "#2fd4ff",
    backgroundColor: "#02010a",
    padding: 10,
  },
  terminalText: {
    color: "#efe8ff",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  modalHeader: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#35296b",
    backgroundColor: "rgba(12, 8, 30, 0.96)",
    padding: 10,
    gap: 8,
  },
  modalTitle: {
    color: "#f3dfff",
    fontSize: 15,
    fontWeight: "800",
  },
  emptyText: {
    color: "#8cb6db",
    fontSize: 13,
  },
});
