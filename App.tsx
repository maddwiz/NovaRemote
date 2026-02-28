import { StatusBar } from "expo-status-bar";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
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

type TmuxTailResponse = {
  session: string;
  output?: string;
};

type TmuxStreamMessage = {
  type: "delta" | "snapshot" | "session_closed" | "error";
  session: string;
  data: string;
};

type Status = {
  text: string;
  error: boolean;
};

const STORAGE_BASE_URL = "novaremote.base_url";
const STORAGE_TOKEN = "novaremote.token";

const DEFAULT_BASE_URL = "http://desmonds-macbook-pro.tail9961a2.ts.net:8787";
const DEFAULT_CWD = "/Users/desmondpottle/Documents/New project";
const BRAND_LOGO = require("./assets/novaai-logo-user.png");

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function withTokenInUrl(baseUrl: string, token: string): string {
  const safeBase = normalizeBaseUrl(baseUrl);
  if (!safeBase || !token.trim()) {
    return safeBase;
  }
  const separator = safeBase.includes("?") ? "&" : "?";
  return `${safeBase}${separator}token=${encodeURIComponent(token.trim())}`;
}

function websocketUrl(baseUrl: string, token: string, session: string): string {
  const safeBase = normalizeBaseUrl(baseUrl);
  const wsBase = safeBase.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
  return `${wsBase}/tmux/stream?session=${encodeURIComponent(session)}&token=${encodeURIComponent(token.trim())}`;
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
      // Ignore json parse issues for non-json failures.
    }
    throw new Error(detail);
  }
  return (await response.json()) as T;
}

function sortByCreatedAt(sessions: SessionMeta[]): SessionMeta[] {
  return sessions
    .slice()
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

export default function App() {
  const [baseUrl, setBaseUrl] = useState<string>(DEFAULT_BASE_URL);
  const [token, setToken] = useState<string>("");
  const [tokenMasked, setTokenMasked] = useState<boolean>(true);
  const [loadingSettings, setLoadingSettings] = useState<boolean>(true);

  const [status, setStatus] = useState<Status>({ text: "Booting", error: false });

  const [allSessions, setAllSessions] = useState<string[]>([]);
  const [openSessions, setOpenSessions] = useState<string[]>([]);
  const [tails, setTails] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendBusy, setSendBusy] = useState<Record<string, boolean>>({});
  const [streamLive, setStreamLive] = useState<Record<string, boolean>>({});

  const [startCwd, setStartCwd] = useState<string>(DEFAULT_CWD);
  const [startPrompt, setStartPrompt] = useState<string>("");
  const [startOpenOnMac, setStartOpenOnMac] = useState<boolean>(true);

  const pollInFlight = useRef<Set<string>>(new Set());
  const sendInFlight = useRef<Set<string>>(new Set());
  const terminalRefs = useRef<Record<string, ScrollView | null>>({});
  const streamRefs = useRef<Record<string, WebSocket | null>>({});
  const streamRetryRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const openSessionsRef = useRef<string[]>([]);
  const connectedRef = useRef<boolean>(false);

  const connected = useMemo(
    () => Boolean(normalizeBaseUrl(baseUrl) && token.trim()),
    [baseUrl, token]
  );

  const setReady = useCallback((text: string = "Ready") => {
    setStatus({ text, error: false });
  }, []);

  const setError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ text: message, error: true });
  }, []);

  useEffect(() => {
    openSessionsRef.current = openSessions;
  }, [openSessions]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  const fetchTail = useCallback(
    async (session: string, showErrors: boolean) => {
      if (!connected || pollInFlight.current.has(session)) {
        return;
      }
      pollInFlight.current.add(session);
      try {
        const data = await apiRequest<TmuxTailResponse>(
          baseUrl,
          token,
          `/tmux/tail?session=${encodeURIComponent(session)}&lines=380`
        );
        const output = data.output ?? "";
        setTails((prev) => {
          if (prev[session] === output) {
            return prev;
          }
          return { ...prev, [session]: output };
        });
      } catch (error) {
        if (showErrors) {
          setError(error);
        }
      } finally {
        pollInFlight.current.delete(session);
      }
    },
    [baseUrl, connected, setError, token]
  );

  const refreshSessions = useCallback(async () => {
    if (!connected) {
      throw new Error("Enter server URL and token first.");
    }

    const data = await apiRequest<{ sessions: SessionMeta[] }>(baseUrl, token, "/codex/sessions");
    const names = sortByCreatedAt(data.sessions || []).map((entry) => entry.name);

    setAllSessions(names);
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
  }, [baseUrl, connected, token]);

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
        // Ignore close errors.
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

  const connectStream = useCallback(
    (session: string) => {
      const existing = streamRefs.current[session];
      if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
        return;
      }

      const retry = streamRetryRefs.current[session];
      if (retry) {
        clearTimeout(retry);
        streamRetryRefs.current[session] = null;
      }

      const ws = new WebSocket(websocketUrl(baseUrl, token, session));
      streamRefs.current[session] = ws;

      ws.onopen = () => {
        setStreamLive((prev) => ({ ...prev, [session]: true }));
      };

      ws.onmessage = (event) => {
        let msg: TmuxStreamMessage | null = null;
        try {
          msg = JSON.parse(String(event.data)) as TmuxStreamMessage;
        } catch {
          return;
        }
        if (!msg || msg.session !== session) {
          return;
        }

        if (msg.type === "snapshot") {
          const output = msg.data ?? "";
          setTails((prev) => (prev[session] === output ? prev : { ...prev, [session]: output }));
          return;
        }

        if (msg.type === "delta") {
          const delta = msg.data ?? "";
          setTails((prev) => {
            const next = `${prev[session] ?? ""}${delta}`;
            if (prev[session] === next) {
              return prev;
            }
            return { ...prev, [session]: next };
          });
          return;
        }

        if (msg.type === "session_closed") {
          closeStream(session);
          return;
        }

        // Ignore noisy per-tick stream errors in UI; fallback polling still works.
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
        // Let onclose drive retries.
      };
    },
    [baseUrl, closeStream, token]
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

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      try {
        const [savedBaseUrl, savedToken] = await Promise.all([
          SecureStore.getItemAsync(STORAGE_BASE_URL),
          SecureStore.getItemAsync(STORAGE_TOKEN),
        ]);

        if (!mounted) {
          return;
        }

        if (savedBaseUrl) {
          setBaseUrl(savedBaseUrl);
        }
        if (savedToken) {
          setToken(savedToken);
          setStatus({ text: "Credentials loaded", error: false });
        } else {
          setStatus({ text: "Enter server URL + token", error: false });
        }
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
    if (!connected || loadingSettings) {
      return;
    }

    void runWithStatus("Syncing sessions", async () => {
      await refreshSessions();
    });
  }, [connected, loadingSettings, refreshSessions, runWithStatus]);

  useEffect(() => {
    if (!connected) {
      Object.keys(streamRefs.current).forEach(closeStream);
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
  }, [closeStream, connectStream, connected, openSessions]);

  useEffect(() => {
    return () => {
      Object.keys(streamRefs.current).forEach(closeStream);
    };
  }, [closeStream]);

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

  const saveCredentials = useCallback(async () => {
    const cleanedBaseUrl = normalizeBaseUrl(baseUrl);
    const cleanedToken = token.trim();

    if (!cleanedBaseUrl || !cleanedToken) {
      throw new Error("Server URL and token are required.");
    }

    await Promise.all([
      SecureStore.setItemAsync(STORAGE_BASE_URL, cleanedBaseUrl),
      SecureStore.setItemAsync(STORAGE_TOKEN, cleanedToken),
    ]);

    setBaseUrl(cleanedBaseUrl);
    setToken(cleanedToken);
  }, [baseUrl, token]);

  const copyTokenUrl = useCallback(() => {
    const url = withTokenInUrl(baseUrl, token);
    setStatus({
      text: url ? `Bookmark this: ${url}` : "Set server URL + token first.",
      error: !url,
    });
  }, [baseUrl, token]);

  const handleStartSession = useCallback(async () => {
    if (!connected) {
      throw new Error("Connect first.");
    }

    const payload = {
      cwd: startCwd.trim() || null,
      initial_prompt: startPrompt.trim() || null,
      open_on_mac: startOpenOnMac,
    };

    const data = await apiRequest<CodexStartResponse>(baseUrl, token, "/codex/start", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const session = data.session;
    setAllSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
    setOpenSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
    if (data.tail) {
      setTails((prev) => ({ ...prev, [session]: data.tail || "" }));
    }

    if (startPrompt.trim()) {
      setStartPrompt("");
    }

    if (startOpenOnMac && data.open_on_mac && !data.open_on_mac.opened) {
      throw new Error(data.open_on_mac.error || "Session started, but Mac open failed.");
    }
  }, [baseUrl, connected, startCwd, startOpenOnMac, startPrompt, token]);

  const handleSend = useCallback(
    async (session: string) => {
      if (!connected) {
        throw new Error("Connect first.");
      }
      if (sendInFlight.current.has(session)) {
        return;
      }

      const currentDraft = (drafts[session] || "").trim();
      if (!currentDraft) {
        return;
      }

      sendInFlight.current.add(session);
      setSendBusy((prev) => ({ ...prev, [session]: true }));
      setDrafts((prev) => ({ ...prev, [session]: "" }));

      try {
        const data = await apiRequest<CodexMessageResponse>(baseUrl, token, "/codex/message", {
          method: "POST",
          body: JSON.stringify({ session, message: currentDraft }),
        });

        if (data.tail) {
          setTails((prev) => ({ ...prev, [session]: data.tail || "" }));
        }
      } catch (error) {
        setDrafts((prev) => ({ ...prev, [session]: currentDraft }));
        throw error;
      } finally {
        sendInFlight.current.delete(session);
        setSendBusy((prev) => ({ ...prev, [session]: false }));
      }
    },
    [baseUrl, connected, drafts, token]
  );

  const handleStop = useCallback(
    async (session: string) => {
      if (!connected) {
        throw new Error("Connect first.");
      }
      await apiRequest(baseUrl, token, "/codex/stop", {
        method: "POST",
        body: JSON.stringify({ session, kill_session: false }),
      });
    },
    [baseUrl, connected, token]
  );

  const handleOpenOnMac = useCallback(
    async (session: string) => {
      if (!connected) {
        throw new Error("Connect first.");
      }
      await apiRequest(baseUrl, token, "/mac/attach", {
        method: "POST",
        body: JSON.stringify({ session }),
      });
    },
    [baseUrl, connected, token]
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
  }, []);

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
              <Text style={styles.subtitle}>Universal AI Terminal Remote Control</Text>
            </View>
            <View style={[styles.statusPill, status.error ? styles.statusPillError : null]}>
              <Text style={styles.statusText}>{status.text}</Text>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Connection</Text>
            <TextInput
              style={styles.input}
              value={baseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Server URL"
              placeholderTextColor="#7f7aa8"
              onChangeText={setBaseUrl}
            />
            <TextInput
              style={styles.input}
              value={token}
              secureTextEntry={tokenMasked}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Bearer token"
              placeholderTextColor="#7f7aa8"
              onChangeText={setToken}
            />
            <View style={styles.rowInlineSpace}>
              <Pressable
                style={[styles.buttonGhost, styles.flexButton]}
                onPress={() => setTokenMasked((prev) => !prev)}
              >
                <Text style={styles.buttonGhostText}>{tokenMasked ? "Show Token" : "Hide Token"}</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonGhost, styles.flexButton]}
                onPress={copyTokenUrl}
              >
                <Text style={styles.buttonGhostText}>Token URL</Text>
              </Pressable>
            </View>
            <View style={styles.rowInlineSpace}>
              <Pressable
                style={[styles.buttonPrimary, styles.flexButton]}
                onPress={() => {
                  void runWithStatus("Saving credentials", async () => {
                    await saveCredentials();
                    await refreshSessions();
                  });
                }}
                disabled={loadingSettings}
              >
                <Text style={styles.buttonPrimaryText}>Save + Connect</Text>
              </Pressable>
              <Pressable
                style={[styles.buttonGhost, styles.flexButton]}
                onPress={() => {
                  void runWithStatus("Refreshing sessions", async () => {
                    await refreshSessions();
                  });
                }}
                disabled={!connected}
              >
                <Text style={styles.buttonGhostText}>Refresh</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Start New Session</Text>
            <TextInput
              style={styles.input}
              value={startCwd}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Project path"
              placeholderTextColor="#7f7aa8"
              onChangeText={setStartCwd}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={startPrompt}
              multiline
              placeholder="Optional first message"
              placeholderTextColor="#7f7aa8"
              onChangeText={setStartPrompt}
            />
            <View style={styles.rowInlineSpace}>
              <Text style={styles.switchLabel}>Open session on Mac Terminal</Text>
              <Switch
                trackColor={{ false: "#33596c", true: "#0ea8c8" }}
                thumbColor={startOpenOnMac ? "#d4fdff" : "#d3dee5"}
                value={startOpenOnMac}
                onValueChange={setStartOpenOnMac}
              />
            </View>
            <Pressable
              style={styles.buttonPrimary}
              onPress={() => {
                void runWithStatus("Starting Codex session", async () => {
                  await handleStartSession();
                });
              }}
              disabled={!connected}
            >
              <Text style={styles.buttonPrimaryText}>Start NovaRemote Session</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelLabel}>Available Sessions</Text>
            {allSessions.length === 0 ? (
              <Text style={styles.emptyText}>No Codex sessions detected yet.</Text>
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

                return (
                  <View key={session} style={styles.terminalCard}>
                    <View style={styles.terminalHeader}>
                      <View style={styles.terminalNameRow}>
                        <Text style={styles.terminalName}>{session}</Text>
                        <Text style={[styles.livePill, isLive ? styles.livePillOn : styles.livePillOff]}>
                          {isLive ? "LIVE" : "SYNC"}
                        </Text>
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
                      placeholder="Message Codex in this terminal"
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
                        onPress={() =>
                          setDrafts((prev) => ({
                            ...prev,
                            [session]: "",
                          }))
                        }
                      >
                        <Text style={styles.buttonGhostText}>Clear</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#050111",
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
  terminalText: {
    color: "#efe8ff",
    fontSize: 13,
    lineHeight: 18,
    fontFamily: Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }),
  },
  emptyText: {
    color: "#8cb6db",
    fontSize: 13,
  },
});
