import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  Share,
  ScrollView,
  Text,
  View,
} from "react-native";

import { apiRequest, normalizeBaseUrl } from "./api/client";
import { FullscreenTerminal } from "./components/FullscreenTerminal";
import { LockScreen } from "./components/LockScreen";
import { DangerConfirmModal } from "./components/DangerConfirmModal";
import { OnboardingModal } from "./components/OnboardingModal";
import { PaywallModal } from "./components/PaywallModal";
import { ShareServerModal } from "./components/ShareServerModal";
import { StatusPill } from "./components/StatusPill";
import { TabBar } from "./components/TabBar";
import { TutorialModal } from "./components/TutorialModal";
import { AppProvider, TerminalsViewModel } from "./context/AppContext";
import {
  BRAND_LOGO,
  DEFAULT_CWD,
  DEFAULT_FLEET_WAIT_MS,
  DEFAULT_TERMINAL_BACKEND,
  FREE_SERVER_LIMIT,
  FREE_SESSION_LIMIT,
  POLL_INTERVAL_MS,
  STORAGE_WATCH_RULES_PREFIX,
  isLikelyAiSession,
} from "./constants";
import { useBiometricLock } from "./hooks/useBiometricLock";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { useConnectionHealth } from "./hooks/useConnectionHealth";
import { useNotifications } from "./hooks/useNotifications";
import { useOnboarding } from "./hooks/useOnboarding";
import { useRevenueCat } from "./hooks/useRevenueCat";
import { useSafetyPolicy } from "./hooks/useSafetyPolicy";
import { useServers } from "./hooks/useServers";
import { useSessionTags } from "./hooks/useSessionTags";
import { useServerCapabilities } from "./hooks/useServerCapabilities";
import { useSnippets } from "./hooks/useSnippets";
import { useTerminalSessions } from "./hooks/useTerminalSessions";
import { useTerminalTheme } from "./hooks/useTerminalTheme";
import { useTutorial } from "./hooks/useTutorial";
import { useWebSocket } from "./hooks/useWebSocket";
import { useFilesBrowser } from "./hooks/useFilesBrowser";
import { useLlmProfiles } from "./hooks/useLlmProfiles";
import { useLlmClient } from "./hooks/useLlmClient";
import { FilesScreen } from "./screens/FilesScreen";
import { LlmsScreen } from "./screens/LlmsScreen";
import { ServersScreen } from "./screens/ServersScreen";
import { SnippetsScreen } from "./screens/SnippetsScreen";
import { TerminalsScreen } from "./screens/TerminalsScreen";
import { styles } from "./theme/styles";
import { buildTerminalAppearance } from "./theme/terminalTheme";
import { AiEnginePreference, FleetRunResult, RouteTab, ServerProfile, Status, TerminalSendMode, TmuxTailResponse, WatchRule } from "./types";

function parseCommaTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function countMatches(output: string, searchTerm: string): number {
  const term = searchTerm.trim();
  if (!term) {
    return 0;
  }

  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (output.match(regex) || []).length;
}

function normalizeMatchIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return ((index % total) + total) % total;
}

function toServerShareLink(server: ServerProfile): string {
  return Linking.createURL("add-server", {
    queryParams: {
      name: server.name,
      url: server.baseUrl,
      cwd: server.defaultCwd,
      backend: server.terminalBackend || DEFAULT_TERMINAL_BACKEND,
    },
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function makeFleetSessionName(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `fleet-${stamp}-${suffix}`;
}

async function endpointAvailable(baseUrl: string, token: string, path: string, init: RequestInit): Promise<boolean> {
  try {
    const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers || {}),
      },
    });
    return response.status !== 404;
  } catch {
    return false;
  }
}

async function detectTerminalApiBasePath(server: ServerProfile): Promise<"/tmux" | "/terminal"> {
  const supportsTerminalApi = await endpointAvailable(server.baseUrl, server.token, "/terminal/sessions", { method: "GET" });
  return supportsTerminalApi ? "/terminal" : "/tmux";
}

function isDangerousShellCommand(command: string): boolean {
  const normalized = command.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normalized) {
    return false;
  }

  const stripped = normalized.replace(/\bsudo\s+/g, "");
  const patterns = [
    /\brm\s+-[^\n;|&]*[rf][^\n;|&]*\b/,
    /\bmkfs(\.| )/,
    /\bdd\s+if=.*\bof=\/dev\//,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bpoweroff\b/,
    /:\(\)\s*\{\s*:\|:\s*&\s*\};:/,
    /\bchmod\s+-r\s+0\b/,
    /\bchmod\s+000\b/,
    /\bchown\s+-r\s+root\b/,
    /\b(?:fdisk|parted|diskutil)\b.*\b(erase|mklabel|partition|format)\b/,
    /\bmv\s+\/\s+\/dev\/null\b/,
    /\btruncate\s+-s\s+0\s+\/etc\//,
    />\s*\/dev\/(sd[a-z]\d*|disk\d+|nvme\d+n\d+(p\d+)?)/,
    /\|\s*(sudo\s+)?rm\b/,
    /&&\s*(sudo\s+)?rm\s+-/,
  ];

  if (patterns.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  if (/\brm\b/.test(stripped) && (/\|\s*.*\brm\b/.test(stripped) || /;\s*.*\brm\b/.test(stripped))) {
    return true;
  }

  return false;
}

function parseSuggestionOutput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch {
    // Fall back to line parsing.
  }

  return trimmed
    .split("\n")
    .map((line) => line.replace(/^[\s\-*\d\.\)]*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

export default function AppShell() {
  const [route, setRoute] = useState<RouteTab>("terminals");
  const [status, setStatus] = useState<Status>({ text: "Booting", error: false });
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [paywallVisible, setPaywallVisible] = useState<boolean>(false);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [searchIndex, setSearchIndex] = useState<Record<string, number>>({});
  const [shareConfig, setShareConfig] = useState<{ title: string; link: string } | null>(null);
  const [fleetCommand, setFleetCommand] = useState<string>("");
  const [fleetCwd, setFleetCwd] = useState<string>("");
  const [fleetTargets, setFleetTargets] = useState<string[]>([]);
  const [fleetBusy, setFleetBusy] = useState<boolean>(false);
  const [fleetResults, setFleetResults] = useState<FleetRunResult[]>([]);
  const [fleetWaitMs, setFleetWaitMs] = useState<string>(String(DEFAULT_FLEET_WAIT_MS));
  const [startAiEngine, setStartAiEngine] = useState<AiEnginePreference>("auto");
  const [sessionAiEngine, setSessionAiEngine] = useState<Record<string, AiEnginePreference>>({});
  const [suggestionsBySession, setSuggestionsBySession] = useState<Record<string, string[]>>({});
  const [suggestionBusyBySession, setSuggestionBusyBySession] = useState<Record<string, boolean>>({});
  const [watchRules, setWatchRules] = useState<Record<string, WatchRule>>({});
  const [dangerPrompt, setDangerPrompt] = useState<{ visible: boolean; command: string; context: string }>({
    visible: false,
    command: "",
    context: "",
  });
  const [llmTestBusy, setLlmTestBusy] = useState<boolean>(false);
  const [llmTestOutput, setLlmTestOutput] = useState<string>("");
  const [llmTransferStatus, setLlmTransferStatus] = useState<string>("");
  const dangerResolverRef = useRef<((approved: boolean) => void) | null>(null);

  const setReady = useCallback((text: string = "Ready") => {
    setStatus({ text, error: false });
  }, []);

  const setError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ text: message, error: true });
  }, []);

  const { loading: onboardingLoading, completed: onboardingCompleted, completeOnboarding } = useOnboarding();
  const { loading: lockLoading, requireBiometric, unlocked, setRequireBiometric, unlock, lock } = useBiometricLock();
  const { loading: tutorialLoading, done: tutorialDone, finish: finishTutorial } = useTutorial(onboardingCompleted && unlocked);
  const { loading: safetyLoading, requireDangerConfirm, setRequireDangerConfirm } = useSafetyPolicy();
  const { permissionStatus, requestPermission, notify } = useNotifications();
  const { available: rcAvailable, isPro, priceLabel, purchasePro, restore } = useRevenueCat();
  const { snippets, upsertSnippet, deleteSnippet } = useSnippets();
  const { terminalTheme, setPreset: setTerminalPreset, setFontFamily: setTerminalFontFamily, setFontSize: setTerminalFontSize, setBackgroundOpacity: setTerminalBackgroundOpacity } = useTerminalTheme();
  const {
    profiles: llmProfiles,
    activeProfile,
    activeProfileId,
    saveProfile,
    deleteProfile,
    setActive,
    exportEncrypted,
    importEncrypted,
  } = useLlmProfiles();
  const { sendPrompt } = useLlmClient();

  const {
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
  } = useServers({ onError: setError, enabled: unlocked });

  const connected = useMemo(() => {
    if (!activeServer) {
      return false;
    }
    return Boolean(normalizeBaseUrl(activeServer.baseUrl) && activeServer.token.trim());
  }, [activeServer]);

  const { capabilities, terminalApiBasePath, supportedFeatures } = useServerCapabilities({ activeServer, connected });

  const {
    allSessions,
    localAiSessions,
    openSessions,
    tails,
    drafts,
    sendBusy,
    sendModes,
    startCwd,
    startPrompt,
    startOpenOnMac,
    startKind,
    focusedSession,
    setTails,
    setDrafts,
    setStartCwd,
    setStartPrompt,
    setStartOpenOnMac,
    setStartKind,
    setFocusedSession,
    resetTerminalState,
    refreshSessions,
    toggleSessionVisible,
    removeOpenSession,
    setSessionMode,
    createLocalAiSession,
    handleStartSession,
    handleSend,
    sendCommand,
    handleStop,
    handleOpenOnMac,
  } = useTerminalSessions({
    activeServer,
    connected,
    terminalApiBasePath,
    supportsShellRun: capabilities.shellRun,
  });

  const remoteOpenSessions = useMemo(
    () => openSessions.filter((session) => !localAiSessions.includes(session)),
    [localAiSessions, openSessions]
  );

  const { commandHistory, historyCount, addCommand, recallPrev, recallNext } = useCommandHistory(activeServerId);
  const { sessionTags, allTags, setTagsForSession, removeMissingSessions } = useSessionTags(activeServerId);
  const {
    currentPath,
    setCurrentPath,
    includeHidden,
    setIncludeHidden,
    entries: fileEntries,
    selectedFilePath,
    selectedContent,
    tailLines,
    setTailLines,
    listDirectory,
    readFile,
    tailFile,
    openEntry,
    goUp,
  } = useFilesBrowser({ activeServer, connected });

  const { streamLive, connectionMeta, fetchTail, connectStream, closeStream, closeAllStreams, closeStreamsNotIn } = useWebSocket({
    activeServer,
    connected,
    terminalApiBasePath,
    openSessions: remoteOpenSessions,
    setTails,
    onError: setError,
    onSessionClosed: (session) => {
      removeOpenSession(session);
      if (isPro) {
        void notify("Session closed", `${session} ended on the server.`);
      }
    },
    onStreamError: (session, message) => {
      if (isPro) {
        void notify("Session error", `${session}: ${message}`);
      }
    },
  });

  const health = useConnectionHealth({
    activeServer,
    connected,
    streamLive,
    openSessions: remoteOpenSessions,
  });

  const filteredSnippets = useMemo(() => {
    return snippets.filter((snippet) => {
      if (!snippet.serverId) {
        return true;
      }
      return activeServerId ? snippet.serverId === activeServerId : false;
    });
  }, [activeServerId, snippets]);

  useEffect(() => {
    if (servers.length === 0) {
      setFleetTargets([]);
      return;
    }

    setFleetTargets((prev) => {
      if (prev.length === 0 && activeServerId) {
        return [activeServerId];
      }
      const available = new Set(servers.map((server) => server.id));
      const filtered = prev.filter((id) => available.has(id));
      if (filtered.length > 0) {
        return filtered;
      }
      return activeServerId ? [activeServerId] : [servers[0].id];
    });
  }, [activeServerId, servers]);

  const isLocalSession = useCallback((session: string) => localAiSessions.includes(session), [localAiSessions]);

  const resolveAiEngine = useCallback(
    (session: string): AiEnginePreference => {
      if (isLocalSession(session)) {
        return "external";
      }
      return sessionAiEngine[session] || "auto";
    },
    [isLocalSession, sessionAiEngine]
  );

  const shouldRouteToExternalAi = useCallback(
    (session: string): boolean => {
      const engine = resolveAiEngine(session);
      if (engine === "external") {
        if (!activeProfile) {
          throw new Error("No active external LLM profile selected.");
        }
        return true;
      }
      if (engine === "server") {
        if (!capabilities.codex) {
          throw new Error("Server AI is not available for this session.");
        }
        return false;
      }
      return !capabilities.codex;
    },
    [activeProfile, capabilities.codex, resolveAiEngine]
  );

  const runFleetCommand = useCallback(async () => {
    const command = fleetCommand.trim();
    if (!command) {
      throw new Error("Fleet command is required.");
    }

    const selectedServers = servers.filter((server) => fleetTargets.includes(server.id));
    if (selectedServers.length === 0) {
      throw new Error("Select at least one target server.");
    }

    const waitMs = Math.max(400, Math.min(Number.parseInt(fleetWaitMs, 10) || DEFAULT_FLEET_WAIT_MS, 120000));

    setFleetBusy(true);
    try {
      const settled = await Promise.all(
        selectedServers.map(async (server): Promise<FleetRunResult> => {
          const cwd = fleetCwd.trim() || server.defaultCwd || DEFAULT_CWD;
          const session = makeFleetSessionName();
          try {
            const terminalBasePath = await detectTerminalApiBasePath(server);

            await apiRequest(server.baseUrl, server.token, `${terminalBasePath}/session`, {
              method: "POST",
              body: JSON.stringify({ session, cwd }),
            });

            let output = "";
            try {
              const data = await apiRequest<{ output?: string }>(server.baseUrl, server.token, "/shell/run", {
                method: "POST",
                body: JSON.stringify({ session, command, wait_ms: waitMs, tail_lines: 280 }),
              });
              output = data.output || "";
            } catch (shellError) {
              const shellMessage = shellError instanceof Error ? shellError.message : String(shellError);
              if (!shellMessage.startsWith("404")) {
                throw shellError;
              }

              await apiRequest(server.baseUrl, server.token, `${terminalBasePath}/send`, {
                method: "POST",
                body: JSON.stringify({ session, text: command, enter: true }),
              });

              const tail = await apiRequest<TmuxTailResponse>(
                server.baseUrl,
                server.token,
                `${terminalBasePath}/tail?session=${encodeURIComponent(session)}&lines=280`
              );
              output = tail.output || "";
            }

            return {
              serverId: server.id,
              serverName: server.name,
              session,
              ok: true,
              output,
            };
          } catch (error) {
            return {
              serverId: server.id,
              serverName: server.name,
              session: null,
              ok: false,
              output: "",
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      setFleetResults(settled);
    } finally {
      setFleetBusy(false);
    }
  }, [fleetCommand, fleetCwd, fleetTargets, fleetWaitMs, servers]);

  const sendViaExternalLlm = useCallback(
    async (session: string, prompt: string) => {
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) {
        return "";
      }

      if (!activeProfile) {
        throw new Error("No active LLM profile selected. Configure one in the LLMs tab.");
      }

      setDrafts((prev) => ({ ...prev, [session]: "" }));
      const reply = await sendPrompt(activeProfile, cleanPrompt);
      const nextBlock = `\\n\\n[LLM Prompt]\\n${cleanPrompt}\\n\\n[LLM Reply]\\n${reply}\\n`;
      setTails((prev) => ({ ...prev, [session]: `${prev[session] || ""}${nextBlock}` }));
      return cleanPrompt;
    },
    [activeProfile, sendPrompt, setDrafts, setTails]
  );

  const requestShellSuggestions = useCallback(
    async (session: string) => {
      if (!activeProfile) {
        throw new Error("Configure an external LLM profile to use shell suggestions.");
      }

      const tailLines = (tails[session] || "")
        .split("\n")
        .slice(-50)
        .join("\n");
      const recentCommands = (commandHistory[session] || []).slice(-5).join("\n");
      const draft = (drafts[session] || "").trim();

      const prompt = [
        "You are assisting with shell command suggestions.",
        "Return strictly JSON: an array of 3 short shell commands with no explanation.",
        "Prioritize safe diagnostic commands first.",
        "",
        `Session: ${session}`,
        draft ? `Current draft: ${draft}` : "Current draft: (empty)",
        "Recent commands:",
        recentCommands || "(none)",
        "Recent terminal output:",
        tailLines || "(none)",
      ].join("\n");

      setSuggestionBusyBySession((prev) => ({ ...prev, [session]: true }));
      try {
        const raw = await sendPrompt(activeProfile, prompt);
        const parsed = parseSuggestionOutput(raw);
        setSuggestionsBySession((prev) => ({ ...prev, [session]: parsed }));
      } finally {
        setSuggestionBusyBySession((prev) => ({ ...prev, [session]: false }));
      }
    },
    [activeProfile, commandHistory, drafts, sendPrompt, tails]
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

  const requirePro = useCallback(() => {
    if (isPro) {
      return false;
    }
    setPaywallVisible(true);
    return true;
  }, [isPro]);

  const requestDangerApproval = useCallback(async (command: string, context: string) => {
    if (!requireDangerConfirm || !isDangerousShellCommand(command)) {
      return true;
    }

    return await new Promise<boolean>((resolve) => {
      dangerResolverRef.current = resolve;
      setDangerPrompt({
        visible: true,
        command,
        context,
      });
    });
  }, [requireDangerConfirm]);

  useEffect(() => {
    if (!isPro) {
      return;
    }

    const matchesBySession: Record<string, string> = {};
    for (const session of Object.keys(watchRules)) {
      const rule = watchRules[session];
      if (!rule?.enabled || !rule.pattern.trim()) {
        continue;
      }

      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, "i");
      } catch {
        continue;
      }

      const lines = (tails[session] || "").split("\n").slice(-240);
      const matchedLine = [...lines].reverse().find((line) => regex.test(line.trim()));
      if (matchedLine && matchedLine.trim() && matchedLine.trim() !== (rule.lastMatch || "")) {
        matchesBySession[session] = matchedLine.trim();
      }
    }

    const pending = Object.entries(matchesBySession);
    if (pending.length === 0) {
      return;
    }

    setWatchRules((prev) => {
      const next = { ...prev };
      pending.forEach(([session, match]) => {
        const existing = next[session] || { enabled: false, pattern: "", lastMatch: null };
        next[session] = { ...existing, lastMatch: match };
      });
      return next;
    });

    pending.forEach(([session, match]) => {
      void notify("Watch alert", `${session}: ${match.slice(0, 120)}`);
    });
  }, [isPro, notify, tails, watchRules]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        lock();
      }
    });

    return () => {
      sub.remove();
    };
  }, [lock]);

  useEffect(() => {
    async function handleLink(url: string | null) {
      if (!url) {
        return;
      }

      const parsed = Linking.parse(url);
      if (parsed.path !== "add-server") {
        return;
      }

      const name = typeof parsed.queryParams?.name === "string" ? parsed.queryParams.name : "";
      const baseUrl = typeof parsed.queryParams?.url === "string" ? parsed.queryParams.url : "";
      const cwd = typeof parsed.queryParams?.cwd === "string" ? parsed.queryParams.cwd : "";
      const backend = typeof parsed.queryParams?.backend === "string" ? parsed.queryParams.backend : "";
      importServerConfig({ name, url: baseUrl, cwd, backend });
      setRoute("servers");
      setReady("Imported server config. Add your token and save.");
    }

    void Linking.getInitialURL().then((url) => {
      void handleLink(url);
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      void handleLink(url);
    });

    return () => {
      sub.remove();
    };
  }, [importServerConfig, setReady]);

  useEffect(() => {
    if (!loadingSettings) {
      setReady("Profiles loaded");
    }
  }, [loadingSettings, setReady]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }

    const serverNameForSync = activeServer?.name || "server";
    setStartCwd(activeServer?.defaultCwd || DEFAULT_CWD);
    resetTerminalState();
    closeAllStreams();

    if (!loadingSettings && connected) {
      void runWithStatus(`Syncing ${serverNameForSync}`, async () => {
        await refreshSessions();
      });
    }
  }, [
    activeServerId,
    activeServer?.defaultCwd,
    activeServer?.name,
    closeAllStreams,
    connected,
    loadingSettings,
    refreshSessions,
    resetTerminalState,
    runWithStatus,
    setStartCwd,
  ]);

  useEffect(() => {
    if (!connected) {
      closeAllStreams();
      return;
    }

    closeStreamsNotIn(remoteOpenSessions);
    remoteOpenSessions.forEach((session) => {
      connectStream(session);
    });
  }, [closeAllStreams, closeStreamsNotIn, connectStream, connected, remoteOpenSessions]);

  useEffect(() => {
    return () => {
      closeAllStreams();
    };
  }, [closeAllStreams]);

  useEffect(() => {
    if (!connected || remoteOpenSessions.length === 0) {
      return;
    }

    const id = setInterval(() => {
      remoteOpenSessions.forEach((session) => {
        if (!streamLive[session]) {
          void fetchTail(session, false);
        }
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [connected, fetchTail, remoteOpenSessions, streamLive]);

  useEffect(() => {
    if (!connected || remoteOpenSessions.length === 0) {
      return;
    }

    remoteOpenSessions.forEach((session) => {
      void fetchTail(session, false);
    });
  }, [connected, fetchTail, remoteOpenSessions]);

  useEffect(() => {
    void removeMissingSessions(allSessions);
  }, [allSessions, removeMissingSessions]);

  useEffect(() => {
    setSessionAiEngine((prev) => {
      const next: Record<string, AiEnginePreference> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
          return;
        }
        next[session] = localAiSessions.includes(session) ? "external" : "auto";
      });
      return next;
    });
  }, [allSessions, localAiSessions]);

  useEffect(() => {
    setSuggestionsBySession((prev) => {
      const next: Record<string, string[]> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setSuggestionBusyBySession((prev) => {
      const next: Record<string, boolean> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setWatchRules((prev) => {
      const next: Record<string, WatchRule> = {};
      allSessions.forEach((session) => {
        next[session] = prev[session] || { enabled: false, pattern: "", lastMatch: null };
      });
      return next;
    });
  }, [allSessions]);

  useEffect(() => {
    let mounted = true;
    async function loadWatchRules() {
      if (!activeServerId) {
        if (mounted) {
          setWatchRules({});
        }
        return;
      }

      const raw = await SecureStore.getItemAsync(`${STORAGE_WATCH_RULES_PREFIX}.${activeServerId}`);
      if (!mounted) {
        return;
      }

      if (!raw) {
        setWatchRules({});
        return;
      }

      try {
        const parsed = JSON.parse(raw) as Record<string, WatchRule>;
        setWatchRules(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        setWatchRules({});
      }
    }

    void loadWatchRules();
    return () => {
      mounted = false;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    void SecureStore.setItemAsync(`${STORAGE_WATCH_RULES_PREFIX}.${activeServerId}`, JSON.stringify(watchRules));
  }, [activeServerId, watchRules]);

  useEffect(() => {
    if (route !== "files" || !connected || !capabilities.files) {
      return;
    }
    void runWithStatus("Loading files", async () => {
      await listDirectory();
    });
  }, [activeServerId, capabilities.files, connected, includeHidden, listDirectory, route, runWithStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSessions();
      setReady();
    } catch (error) {
      setError(error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshSessions, setError, setReady]);

  const activeServerName = activeServer?.name || "No Server";
  const focusedOutput = focusedSession ? tails[focusedSession] ?? "" : "";
  const focusedDraft = focusedSession ? drafts[focusedSession] ?? "" : "";
  const focusedIsSending = focusedSession ? Boolean(sendBusy[focusedSession]) : false;
  const focusedMode = focusedSession
    ? sendModes[focusedSession] || (isLikelyAiSession(focusedSession) ? "ai" : "shell")
    : "ai";

  const focusedSearchTerm = focusedSession ? searchTerms[focusedSession] ?? "" : "";
  const focusedMatchCount = focusedSession ? countMatches(focusedOutput, focusedSearchTerm) : 0;
  const focusedCursor = focusedSession ? searchIndex[focusedSession] ?? 0 : 0;
  const focusedMatchIndex = normalizeMatchIndex(focusedCursor, focusedMatchCount);
  const focusedSearchLabel = focusedMatchCount === 0 ? "0 matches" : `${focusedMatchIndex + 1}/${focusedMatchCount}`;
  const terminalAppearance = useMemo(() => buildTerminalAppearance(terminalTheme), [terminalTheme]);
  const terminalsViewModel: TerminalsViewModel = {
    activeServer,
    connected,
    servers,
    allSessions,
    openSessions,
    tails,
    drafts,
    sendBusy,
    streamLive,
    connectionMeta,
    sendModes,
    sessionAiEngine,
    startCwd,
    startPrompt,
    startOpenOnMac,
    startKind,
    startAiEngine,
    health,
    capabilities,
    supportedFeatures,
    hasExternalLlm: Boolean(activeProfile),
    localAiSessions,
    historyCount,
    sessionTags,
    allTags,
    tagFilter,
    isPro,
    fleetCommand,
    fleetCwd,
    fleetTargets,
    fleetBusy,
    fleetWaitMs,
    fleetResults,
    suggestionsBySession,
    suggestionBusyBySession,
    watchRules,
    terminalTheme,
    onShowPaywall: () => setPaywallVisible(true),
    onSetTagFilter: setTagFilter,
    onSetStartCwd: setStartCwd,
    onSetStartPrompt: setStartPrompt,
    onSetStartOpenOnMac: setStartOpenOnMac,
    onSetStartKind: setStartKind,
    onSetStartAiEngine: setStartAiEngine,
    onRefreshSessions: () => {
      void runWithStatus("Refreshing sessions", async () => {
        await refreshSessions();
      });
    },
    onOpenServers: () => setRoute("servers"),
    onStartSession: () => {
      void runWithStatus("Starting session", async () => {
        if (!isPro && openSessions.length >= FREE_SESSION_LIMIT) {
          setPaywallVisible(true);
          return;
        }

        if (startKind === "ai") {
          if (startAiEngine === "server" && !capabilities.codex) {
            throw new Error("Server AI engine is not available on the active server.");
          }
          const shouldStartExternal = startAiEngine === "external" || (startAiEngine === "auto" && !capabilities.codex);
          if (shouldStartExternal) {
            if (!activeProfile) {
              throw new Error("No active external LLM profile selected.");
            }
            const localSession = createLocalAiSession(startPrompt.trim());
            setSessionAiEngine((prev) => ({ ...prev, [localSession]: "external" }));
            if (startPrompt.trim()) {
              await sendViaExternalLlm(localSession, startPrompt);
              setStartPrompt("");
            }
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
          }
        }

        if (startKind === "shell" && !capabilities.terminal) {
          throw new Error("Active server does not support terminal shell sessions.");
        }

        if (startKind === "shell" && startPrompt.trim()) {
          const approved = await requestDangerApproval(startPrompt, "Initial shell command");
          if (!approved) {
            return;
          }
        }

        const session = await handleStartSession();
        if (startKind === "ai") {
          setSessionAiEngine((prev) => ({
            ...prev,
            [session]: startAiEngine === "server" ? "server" : "auto",
          }));
        }
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      });
    },
    onToggleSessionVisible: (session) => {
      if (!isPro && !openSessions.includes(session) && openSessions.length >= FREE_SESSION_LIMIT) {
        setPaywallVisible(true);
        return;
      }
      void Haptics.selectionAsync();
      toggleSessionVisible(session);
    },
    onSetSessionMode: (session, mode) => {
      if (mode === "ai" && !capabilities.codex && !activeProfile) {
        setStatus({ text: "No server AI or external LLM is configured.", error: true });
        return;
      }
      if (mode === "shell" && isLocalSession(session)) {
        setStatus({ text: "Local LLM sessions only support AI mode.", error: true });
        return;
      }
      if (mode === "shell" && !capabilities.terminal) {
        setStatus({ text: "Active server does not support terminal shell mode.", error: true });
        return;
      }
      setSessionMode(session, mode);
    },
    onSetSessionAiEngine: (session, engine) => {
      if (engine === "server" && !capabilities.codex) {
        setStatus({ text: "Server AI is unavailable for this server.", error: true });
        return;
      }
      if (engine === "external" && !activeProfile) {
        setStatus({ text: "No external LLM profile is configured.", error: true });
        return;
      }
      setSessionAiEngine((prev) => ({ ...prev, [session]: engine }));
    },
    onOpenOnMac: (session) => {
      void runWithStatus(`Opening ${session} on Mac`, async () => {
        if (isLocalSession(session)) {
          throw new Error("Local LLM sessions are not attached to a server terminal.");
        }
        if (!capabilities.macAttach) {
          throw new Error("Active server does not support mac attach.");
        }
        await handleOpenOnMac(session);
      });
    },
    onSyncSession: (session) => {
      void runWithStatus(`Syncing ${session}`, async () => {
        if (isLocalSession(session)) {
          throw new Error("Local LLM sessions are already in sync.");
        }
        await fetchTail(session, true);
      });
    },
    onExportSession: (session) => {
      void runWithStatus(`Exporting ${session}`, async () => {
        const payload = {
          exported_at: new Date().toISOString(),
          server: activeServer?.name || "",
          session,
          mode: sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell"),
          commands: commandHistory[session] || [],
          output: tails[session] || "",
        };

        await Share.share({
          title: `NovaRemote ${session} export`,
          message: JSON.stringify(payload, null, 2),
        });
      });
    },
    onFocusSession: setFocusedSession,
    onStopSession: (session) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      void runWithStatus(`Stopping ${session}`, async () => {
        if (isLocalSession(session)) {
          throw new Error("Local LLM sessions do not support Ctrl-C.");
        }
        await handleStop(session);
      });
    },
    onHideSession: (session) => {
      removeOpenSession(session);
      closeStream(session);
    },
    onHistoryPrev: (session) => {
      const prev = recallPrev(session);
      if (prev !== null) {
        setDrafts((existing) => ({ ...existing, [session]: prev }));
      }
    },
    onHistoryNext: (session) => {
      const next = recallNext(session);
      if (next !== null) {
        setDrafts((existing) => ({ ...existing, [session]: next }));
      }
    },
    onSetTags: (session, raw) => {
      void setTagsForSession(session, parseCommaTags(raw));
    },
    onSetDraft: (session, value) => {
      setDrafts((prev) => ({
        ...prev,
        [session]: value,
      }));
    },
    onSend: (session) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void runWithStatus(`Sending to ${session}`, async () => {
        const draft = (drafts[session] || "").trim();
        const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
        if (mode === "ai" && shouldRouteToExternalAi(session)) {
          const sent = await sendViaExternalLlm(session, draft);
          if (sent) {
            await addCommand(session, sent);
          }
          return;
        }
        if (mode === "shell") {
          const approved = await requestDangerApproval(draft, `Send to ${session}`);
          if (!approved) {
            return;
          }
        }

        const sent = await handleSend(session);
        if (sent) {
          await addCommand(session, sent);
          if (isPro) {
            await notify("Command sent", `${session}: ${sent.slice(0, 80)}`);
          }
        }
      });
    },
    onClearDraft: (session) => {
      setDrafts((prev) => ({ ...prev, [session]: "" }));
    },
    onSetFleetCommand: setFleetCommand,
    onSetFleetCwd: setFleetCwd,
    onToggleFleetTarget: (serverId) => {
      setFleetTargets((prev) => (prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]));
    },
    onSetFleetWaitMs: setFleetWaitMs,
    onRequestSuggestions: (session) => {
      void runWithStatus(`Generating suggestions for ${session}`, async () => {
        await requestShellSuggestions(session);
      });
    },
    onUseSuggestion: (session, value) => {
      setDrafts((prev) => ({ ...prev, [session]: value }));
    },
    onToggleWatch: (session, enabled) => {
      setWatchRules((prev) => {
        const existing = prev[session] || { enabled: false, pattern: "", lastMatch: null };
        return {
          ...prev,
          [session]: {
            ...existing,
            enabled,
          },
        };
      });
    },
    onSetWatchPattern: (session, pattern) => {
      setWatchRules((prev) => {
        const existing = prev[session] || { enabled: true, pattern: "", lastMatch: null };
        return {
          ...prev,
          [session]: {
            ...existing,
            pattern,
            lastMatch: null,
          },
        };
      });
    },
    onSetTerminalPreset: setTerminalPreset,
    onSetTerminalFontFamily: setTerminalFontFamily,
    onSetTerminalFontSize: setTerminalFontSize,
    onSetTerminalBackgroundOpacity: setTerminalBackgroundOpacity,
    onRunFleet: () => {
      void runWithStatus("Running fleet command", async () => {
        const approved = await requestDangerApproval(fleetCommand, "Fleet execute");
        if (!approved) {
          return;
        }
        await runFleetCommand();
      });
    },
  };

  if (lockLoading || onboardingLoading || tutorialLoading || safetyLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (!unlocked) {
    return (
      <LockScreen
        onUnlock={() => {
          void runWithStatus("Unlocking", async () => {
            await unlock();
          });
        }}
      />
    );
  }

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
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            route === "terminals" ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#27d9ff" /> : undefined
          }
        >
          <View style={styles.panelHeader}>
            <Image source={BRAND_LOGO} style={styles.brandLogo} resizeMode="cover" />
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>NovaRemote</Text>
              <Text style={styles.subtitle}>Universal AI + Terminal Remote Control</Text>
            </View>
            <View style={styles.headerRowWrap}>
              <Text style={styles.serverBadge}>{activeServerName}</Text>
              <StatusPill status={status} />
            </View>
          </View>

          <TabBar
            route={route}
            onChange={(next) => {
              void Haptics.selectionAsync();
              if (next === "snippets" && !isPro) {
                setPaywallVisible(true);
                return;
              }
              if (next === "files" && !capabilities.files) {
                setStatus({ text: "Active server does not support file APIs.", error: true });
                return;
              }
              setRoute(next);
            }}
          />

          {route === "servers" ? (
            <ServersScreen
              servers={servers}
              activeServerId={activeServerId}
              serverNameInput={serverNameInput}
              serverUrlInput={serverUrlInput}
              serverTokenInput={serverTokenInput}
              serverCwdInput={serverCwdInput}
              serverBackendInput={serverBackendInput || DEFAULT_TERMINAL_BACKEND}
              editingServerId={editingServerId}
              tokenMasked={tokenMasked}
              requireBiometric={requireBiometric}
              requireDangerConfirm={requireDangerConfirm}
              onUseServer={(serverId) => {
                void runWithStatus("Switching server", async () => {
                  await useServer(serverId);
                  setRoute("terminals");
                });
              }}
              onBeginEditServer={(server) => {
                beginEditServer(server);
                setRoute("servers");
              }}
              onDeleteServer={(serverId) => {
                const label = servers.find((entry) => entry.id === serverId)?.name || "server";
                void runWithStatus(`Deleting ${label}`, async () => {
                  await deleteServer(serverId);
                });
              }}
              onShareServer={(server) => {
                setShareConfig({ title: server.name, link: toServerShareLink(server) });
              }}
              onSetServerName={setServerNameInput}
              onSetServerUrl={setServerUrlInput}
              onSetServerToken={setServerTokenInput}
              onSetServerCwd={setServerCwdInput}
              onSetServerBackend={setServerBackendInput}
              onSetRequireBiometric={(value) => {
                void runWithStatus("Updating lock setting", async () => {
                  await setRequireBiometric(value);
                });
              }}
              onSetRequireDangerConfirm={(value) => {
                void runWithStatus("Updating safety setting", async () => {
                  await setRequireDangerConfirm(value);
                });
              }}
              onToggleTokenMask={() => setTokenMasked((prev) => !prev)}
              onClearForm={beginCreateServer}
              onSaveServer={() => {
                void runWithStatus(editingServerId ? "Updating server" : "Saving server", async () => {
                  if (!editingServerId && !isPro && servers.length >= FREE_SERVER_LIMIT) {
                    setPaywallVisible(true);
                    return;
                  }
                  await saveServer();
                  setRoute("terminals");
                });
              }}
              onBackToTerminals={() => setRoute("terminals")}
            />
          ) : null}

          {route === "terminals" ? (
            <AppProvider value={{ terminals: terminalsViewModel }}>
              <TerminalsScreen />
            </AppProvider>
          ) : null}

          {route === "snippets" ? (
            <SnippetsScreen
              snippets={filteredSnippets}
              activeServerId={activeServerId}
              openSessions={openSessions}
              isPro={isPro}
              onShowPaywall={() => setPaywallVisible(true)}
              onSaveSnippet={(input) => {
                void runWithStatus(input.id ? "Updating snippet" : "Saving snippet", async () => {
                  if (requirePro()) {
                    return;
                  }
                  await upsertSnippet(input);
                });
              }}
              onDeleteSnippet={(id) => {
                void runWithStatus("Deleting snippet", async () => {
                  await deleteSnippet(id);
                });
              }}
              onInsertSnippet={(session, command) => {
                setDrafts((prev) => ({ ...prev, [session]: command }));
                setRoute("terminals");
              }}
              onRunSnippet={(session, command, mode) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void runWithStatus(`Running snippet in ${session}`, async () => {
                  if (isLocalSession(session) && mode === "shell") {
                    throw new Error("Shell snippets are not available for local LLM sessions.");
                  }
                  if (mode === "ai" && shouldRouteToExternalAi(session)) {
                    const sent = await sendViaExternalLlm(session, command);
                    if (sent) {
                      await addCommand(session, sent);
                    }
                    return;
                  }
                  if (mode === "shell") {
                    const approved = await requestDangerApproval(command, `Snippet in ${session}`);
                    if (!approved) {
                      return;
                    }
                  }
                  await sendCommand(session, command, mode, false);
                  await addCommand(session, command);
                  if (isPro) {
                    await notify("Snippet sent", `${session}: ${command.slice(0, 80)}`);
                  }
                });
              }}
            />
          ) : null}

          {route === "files" ? (
            capabilities.files ? (
              <FilesScreen
                connected={connected}
                currentPath={currentPath}
                includeHidden={includeHidden}
                entries={fileEntries}
                selectedFilePath={selectedFilePath}
                selectedContent={selectedContent}
                tailLines={tailLines}
                openSessions={openSessions}
                onSetCurrentPath={setCurrentPath}
                onSetIncludeHidden={setIncludeHidden}
                onSetTailLines={setTailLines}
                onRefresh={() => {
                  void runWithStatus("Listing files", async () => {
                    await listDirectory();
                  });
                }}
                onGoUp={() => {
                  void runWithStatus("Navigating up", async () => {
                    await goUp();
                  });
                }}
                onOpenEntry={(entry) => {
                  void runWithStatus(entry.is_dir ? `Opening ${entry.name}` : `Reading ${entry.name}`, async () => {
                    await openEntry(entry);
                  });
                }}
                onReadSelected={() => {
                  if (!selectedFilePath) {
                    return;
                  }
                  void runWithStatus("Reading file", async () => {
                    await readFile(selectedFilePath);
                  });
                }}
                onTailSelected={() => {
                  if (!selectedFilePath) {
                    return;
                  }
                  void runWithStatus("Tailing file", async () => {
                    await tailFile(selectedFilePath);
                  });
                }}
                onInsertPath={(session, path) => {
                  setRoute("terminals");
                  setDrafts((prev) => ({ ...prev, [session]: path }));
                }}
                onSendPathCommand={(session, path) => {
                  void runWithStatus(`Running cat in ${session}`, async () => {
                    if (isLocalSession(session)) {
                      throw new Error("Local LLM sessions cannot execute file shell commands.");
                    }
                    const command = `cat ${shellQuote(path)}`;
                    const approved = await requestDangerApproval(command, `File command in ${session}`);
                    if (!approved) {
                      return;
                    }
                    await sendCommand(session, command, "shell", false);
                    await addCommand(session, command);
                  });
                }}
              />
            ) : (
              <View style={styles.panel}>
                <Text style={styles.panelLabel}>Files Unavailable</Text>
                <Text style={styles.serverSubtitle}>This server does not expose `/files/*` endpoints.</Text>
              </View>
            )
          ) : null}

          {route === "llms" ? (
            <LlmsScreen
              profiles={llmProfiles}
              activeProfileId={activeProfileId}
              testBusy={llmTestBusy}
              testOutput={llmTestOutput}
              transferStatus={llmTransferStatus}
              onSetActive={(id) => {
                void runWithStatus("Switching LLM provider", async () => {
                  await setActive(id);
                });
              }}
              onSaveProfile={(input) => {
                void runWithStatus(input.id ? "Updating LLM profile" : "Saving LLM profile", async () => {
                  await saveProfile(input);
                });
              }}
              onDeleteProfile={(id) => {
                void runWithStatus("Deleting LLM profile", async () => {
                  await deleteProfile(id);
                });
              }}
              onTestPrompt={(profile, prompt) => {
                void runWithStatus(`Testing ${profile.name}`, async () => {
                  setLlmTestBusy(true);
                  try {
                    const output = await sendPrompt(profile, prompt);
                    setLlmTestOutput(output);
                  } finally {
                    setLlmTestBusy(false);
                  }
                });
              }}
              onExportEncrypted={(passphrase) => {
                try {
                  const payload = exportEncrypted(passphrase);
                  setLlmTransferStatus(`Export generated at ${new Date().toLocaleTimeString()}`);
                  return payload;
                } catch (error) {
                  setLlmTransferStatus(error instanceof Error ? error.message : String(error));
                  return "";
                }
              }}
              onImportEncrypted={(payload, passphrase) => {
                void runWithStatus("Importing encrypted LLM profiles", async () => {
                  const summary = await importEncrypted(payload, passphrase);
                  setLlmTransferStatus(`Imported ${summary.imported} profile(s). Total configured: ${summary.total}.`);
                });
              }}
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <FullscreenTerminal
        session={focusedSession}
        output={focusedOutput}
        draft={focusedDraft}
        mode={focusedMode}
        isSending={focusedIsSending}
        searchTerm={focusedSearchTerm}
        searchMatchesLabel={focusedSearchLabel}
        activeMatchIndex={focusedMatchIndex}
        terminalViewStyle={terminalAppearance.modalTerminalViewStyle}
        terminalTextStyle={terminalAppearance.terminalTextStyle}
        onClose={() => setFocusedSession(null)}
        onToggleMode={() => {
          if (!focusedSession) {
            return;
          }
          void Haptics.selectionAsync();
          const nextMode: TerminalSendMode = focusedMode === "ai" ? "shell" : "ai";
          if (nextMode === "ai" && !capabilities.codex && !activeProfile) {
            setStatus({ text: "No server AI or external LLM is configured.", error: true });
            return;
          }
          if (nextMode === "shell" && isLocalSession(focusedSession)) {
            setStatus({ text: "Local LLM sessions only support AI mode.", error: true });
            return;
          }
          if (nextMode === "shell" && !capabilities.terminal) {
            setStatus({ text: "Active server does not support terminal shell mode.", error: true });
            return;
          }
          setSessionMode(focusedSession, nextMode);
        }}
        onSearchChange={(value) => {
          if (!focusedSession) {
            return;
          }
          setSearchTerms((prev) => ({ ...prev, [focusedSession]: value }));
          setSearchIndex((prev) => ({ ...prev, [focusedSession]: 0 }));
        }}
        onSearchPrev={() => {
          if (!focusedSession || focusedMatchCount === 0) {
            return;
          }
          setSearchIndex((prev) => ({
            ...prev,
            [focusedSession]: (prev[focusedSession] ?? 0) - 1,
          }));
        }}
        onSearchNext={() => {
          if (!focusedSession || focusedMatchCount === 0) {
            return;
          }
          setSearchIndex((prev) => ({
            ...prev,
            [focusedSession]: (prev[focusedSession] ?? 0) + 1,
          }));
        }}
        onHistoryPrev={() => {
          if (!focusedSession) {
            return;
          }
          const prev = recallPrev(focusedSession);
          if (prev !== null) {
            setDrafts((existing) => ({ ...existing, [focusedSession]: prev }));
          }
        }}
        onHistoryNext={() => {
          if (!focusedSession) {
            return;
          }
          const next = recallNext(focusedSession);
          if (next !== null) {
            setDrafts((existing) => ({ ...existing, [focusedSession]: next }));
          }
        }}
        onDraftChange={(value) => {
          if (!focusedSession) {
            return;
          }
          setDrafts((prev) => ({ ...prev, [focusedSession]: value }));
        }}
        onSend={() => {
          if (!focusedSession) {
            return;
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          void runWithStatus(`Sending to ${focusedSession}`, async () => {
            if (focusedMode === "ai" && shouldRouteToExternalAi(focusedSession)) {
              const sent = await sendViaExternalLlm(focusedSession, focusedDraft);
              if (sent) {
                await addCommand(focusedSession, sent);
              }
              return;
            }
            if (focusedMode === "shell") {
              const approved = await requestDangerApproval(focusedDraft, `Send to ${focusedSession}`);
              if (!approved) {
                return;
              }
            }
            const sent = await handleSend(focusedSession);
            if (sent) {
              await addCommand(focusedSession, sent);
            }
          });
        }}
        onStop={() => {
          if (!focusedSession) {
            return;
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          void runWithStatus(`Stopping ${focusedSession}`, async () => {
            if (isLocalSession(focusedSession)) {
              throw new Error("Local LLM sessions do not support Ctrl-C.");
            }
            await handleStop(focusedSession);
          });
        }}
      />

      <PaywallModal
        visible={paywallVisible}
        priceLabel={priceLabel}
        onClose={() => setPaywallVisible(false)}
        onUpgrade={() => {
          void runWithStatus("Purchasing Pro", async () => {
            if (!rcAvailable) {
              throw new Error("RevenueCat keys are not configured yet.");
            }
            const pro = await purchasePro();
            if (pro) {
              setPaywallVisible(false);
            }
          });
        }}
        onRestore={() => {
          void runWithStatus("Restoring purchases", async () => {
            if (!rcAvailable) {
              throw new Error("RevenueCat keys are not configured yet.");
            }
            const pro = await restore();
            if (pro) {
              setPaywallVisible(false);
            }
          });
        }}
      />

      <OnboardingModal
        visible={!onboardingCompleted}
        notificationsGranted={permissionStatus === "granted"}
        onRequestNotifications={() => {
          void requestPermission();
        }}
        onTestConnection={async (server) => {
          const response = await fetch(`${normalizeBaseUrl(server.url)}/health`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${server.token}`,
            },
          });

          if (!response.ok) {
            throw new Error(`Connection failed: ${response.status}`);
          }

          setReady("Server connection looks good");
        }}
        onComplete={(server, biometric) => {
          void runWithStatus("Completing onboarding", async () => {
            await addServerDirect({
              name: server.name,
              baseUrl: server.url,
              token: server.token,
              defaultCwd: server.cwd,
              terminalBackend: DEFAULT_TERMINAL_BACKEND,
            });
            await setRequireBiometric(biometric);
            await completeOnboarding();
            setRoute("terminals");
          });
        }}
      />

      <ShareServerModal
        visible={Boolean(shareConfig)}
        title={shareConfig?.title || "Server"}
        value={shareConfig?.link || ""}
        onClose={() => setShareConfig(null)}
      />

      <DangerConfirmModal
        visible={dangerPrompt.visible}
        command={dangerPrompt.command}
        context={dangerPrompt.context}
        onCancel={() => {
          setDangerPrompt({ visible: false, command: "", context: "" });
          const resolver = dangerResolverRef.current;
          dangerResolverRef.current = null;
          resolver?.(false);
        }}
        onConfirm={() => {
          setDangerPrompt({ visible: false, command: "", context: "" });
          const resolver = dangerResolverRef.current;
          dangerResolverRef.current = null;
          resolver?.(true);
        }}
      />

      <TutorialModal
        visible={onboardingCompleted && !tutorialDone}
        onDone={() => {
          void runWithStatus("Tutorial complete", async () => {
            await finishTutorial();
          });
        }}
      />
    </SafeAreaView>
  );
}
