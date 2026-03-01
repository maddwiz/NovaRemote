import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
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
import { SessionPlaybackModal } from "./components/SessionPlaybackModal";
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
  isLikelyAiSession,
} from "./constants";
import { useAiAssist } from "./hooks/useAiAssist";
import { useBiometricLock } from "./hooks/useBiometricLock";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { commandQueueStatus, useCommandQueue } from "./hooks/useCommandQueue";
import { useCollaboration } from "./hooks/useCollaboration";
import { useConnectionHealth } from "./hooks/useConnectionHealth";
import { useProcessManager } from "./hooks/useProcessManager";
import { useSessionRecordings } from "./hooks/useSessionRecordings";
import { useNotifications } from "./hooks/useNotifications";
import { useOnboarding } from "./hooks/useOnboarding";
import { useRevenueCat } from "./hooks/useRevenueCat";
import { useSafetyPolicy } from "./hooks/useSafetyPolicy";
import { useServers } from "./hooks/useServers";
import { useSessionTags } from "./hooks/useSessionTags";
import { useSessionAliases } from "./hooks/useSessionAliases";
import { useServerCapabilities } from "./hooks/useServerCapabilities";
import { useSnippets } from "./hooks/useSnippets";
import { useTerminalSessions } from "./hooks/useTerminalSessions";
import { useTerminalTheme } from "./hooks/useTerminalTheme";
import { useTutorial } from "./hooks/useTutorial";
import { useWatchAlerts } from "./hooks/useWatchAlerts";
import { useWebSocket } from "./hooks/useWebSocket";
import { useFilesBrowser } from "./hooks/useFilesBrowser";
import { usePinnedSessions } from "./hooks/usePinnedSessions";
import { useLlmProfiles } from "./hooks/useLlmProfiles";
import { useLlmClient } from "./hooks/useLlmClient";
import { useGlassesMode } from "./hooks/useGlassesMode";
import { useShellRunWait } from "./hooks/useShellRunWait";
import { useVoiceCapture } from "./hooks/useVoiceCapture";
import { useAnalytics } from "./hooks/useAnalytics";
import { useReferrals } from "./hooks/useReferrals";
import { useSharedProfiles } from "./hooks/useSharedProfiles";
import { FilesScreen } from "./screens/FilesScreen";
import { LlmsScreen } from "./screens/LlmsScreen";
import { ServersScreen } from "./screens/ServersScreen";
import { SnippetsScreen } from "./screens/SnippetsScreen";
import { GlassesModeScreen } from "./screens/GlassesModeScreen";
import { TerminalsScreen } from "./screens/TerminalsScreen";
import { styles } from "./theme/styles";
import { buildTerminalAppearance } from "./theme/terminalTheme";
import {
  AiEnginePreference,
  FleetRunResult,
  ProcessSignal,
  RecordingChunk,
  RouteTab,
  ServerProfile,
  SessionRecording,
  Status,
  SharedServerTemplate,
  SysStats,
  TerminalBackendKind,
  TerminalSendMode,
  TmuxTailResponse,
} from "./types";

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
  const queryParams: Record<string, string> = {
    name: server.name,
    url: server.baseUrl,
    cwd: server.defaultCwd,
    backend: server.terminalBackend || DEFAULT_TERMINAL_BACKEND,
  };
  if (server.sshHost) {
    queryParams.ssh_host = server.sshHost;
  }
  if (server.sshUser) {
    queryParams.ssh_user = server.sshUser;
  }
  if (server.sshPort) {
    queryParams.ssh_port = String(server.sshPort);
  }
  if (server.portainerUrl) {
    queryParams.portainer_url = server.portainerUrl;
  }
  if (server.proxmoxUrl) {
    queryParams.proxmox_url = server.proxmoxUrl;
  }
  if (server.grafanaUrl) {
    queryParams.grafana_url = server.grafanaUrl;
  }
  return Linking.createURL("add-server", {
    queryParams,
  });
}

function toSshFallbackUrl(server: ServerProfile): string {
  const host = server.sshHost?.trim() || "";
  if (!host) {
    throw new Error("SSH host is not configured for this server.");
  }
  const userPrefix = server.sshUser?.trim() ? `${encodeURIComponent(server.sshUser.trim())}@` : "";
  const hasPortInHost = /:\d+$/.test(host) && !host.includes("]");
  const portSuffix = server.sshPort && !hasPortInHost ? `:${server.sshPort}` : "";
  return `ssh://${userPrefix}${host}${portSuffix}`;
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

function buildPlaybackOutput(chunks: RecordingChunk[], atMs: number): string {
  return chunks
    .filter((chunk) => chunk.atMs <= atMs)
    .map((chunk) => chunk.text)
    .join("");
}

function recordingDurationMs(recording: SessionRecording | null): number {
  if (!recording || recording.chunks.length === 0) {
    return 0;
  }
  return recording.chunks[recording.chunks.length - 1]?.atMs || 0;
}

function inferSessionAlias(session: string, output: string, commands: string[]): string {
  const lowerSession = session.toLowerCase();
  const lowerOutput = output.toLowerCase();
  const commandBlob = commands.join("\n").toLowerCase();
  const haystack = `${lowerSession}\n${lowerOutput}\n${commandBlob}`;

  if (lowerSession.startsWith("llm-") || lowerSession.includes("codex") || haystack.includes("assistant")) {
    return "AI Assistant";
  }
  if (/npm run dev|pnpm dev|yarn dev|vite|next dev|webpack-dev-server/.test(haystack)) {
    return "Dev Server";
  }
  if (/pytest|jest|vitest|go test|cargo test/.test(haystack)) {
    return "Test Runner";
  }
  if (/docker compose|kubectl|helm|k8s/.test(haystack)) {
    return "Infra Ops";
  }
  if (/deploy|terraform|ansible/.test(haystack)) {
    return "Deploy";
  }
  if (/python .*train|epoch|loss:/.test(haystack)) {
    return "Training";
  }
  if (/git status|git log|git diff|merge conflict|rebase/.test(haystack)) {
    return "Git";
  }
  if (/tail -f|journalctl|error|warn|stack trace/.test(haystack)) {
    return "Logs";
  }
  return "";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripWakePrefix(value: string): string {
  return value.replace(/^[\s,.:;!?'"-]+/, "").trim();
}

function extractWakePhraseCommand(transcript: string, wakePhrase: string): string {
  const phrase = wakePhrase.trim();
  if (!phrase) {
    return transcript.trim();
  }
  const matcher = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
  const match = matcher.exec(transcript);
  if (!match) {
    return "";
  }
  const start = match.index + match[0].length;
  const after = stripWakePrefix(transcript.slice(start));
  if (after) {
    return after;
  }
  return transcript.slice(0, match.index).trim();
}

function shouldRetryVoiceLoopError(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (
    /read-only|permission is required|microphone permission|permission denied|no active external llm|server ai engine is not available|local llm sessions|unsupported|invalid encrypted|http 401|http 403|http 415|cannot authenticate|no transcription endpoint/i.test(
      normalized
    )
  ) {
    return false;
  }
  if (
    /no transcript|wake phrase|connect to a server|http \d+|network|timeout|capture failed|voice capture has not started|retry/i.test(
      normalized
    )
  ) {
    return true;
  }
  return true;
}

function adaptCommandForBackend(command: string, backend: TerminalBackendKind | undefined): string {
  const parts = command.split(/(\|\||&&|;|\|)/);
  if (parts.length > 1) {
    return parts
      .map((part, index) => {
        if (index % 2 === 1) {
          return part;
        }
        return adaptCommandForBackend(part, backend);
      })
      .join("");
  }

  const trimmed = command.trim();
  if (!trimmed) {
    return command;
  }

  const isPowerShell = backend === "powershell";
  const isCmd = backend === "cmd";
  const windows = isPowerShell || isCmd;
  const unixLike = !windows;
  const [first] = trimmed.split(/\s+/);
  const lower = first.toLowerCase();

  if (windows) {
    if (lower === "ls") {
      return trimmed.replace(/^ls\b/i, isPowerShell ? "Get-ChildItem" : "dir");
    }
    if (lower === "pwd") {
      return trimmed.replace(/^pwd\b/i, isPowerShell ? "Get-Location" : "cd");
    }
    if (lower === "cat") {
      return trimmed.replace(/^cat\b/i, isPowerShell ? "Get-Content" : "type");
    }
    if (lower === "cp") {
      return trimmed.replace(/^cp\b/i, isPowerShell ? "Copy-Item" : "copy");
    }
    if (lower === "mv") {
      return trimmed.replace(/^mv\b/i, isPowerShell ? "Move-Item" : "move");
    }
    if (lower === "rm") {
      if (isPowerShell) {
        if (/\s+-r[f]?\b|\s+-f\b/i.test(trimmed)) {
          return trimmed.replace(/^rm\b.*/i, "Remove-Item -Recurse -Force");
        }
        return trimmed.replace(/^rm\b/i, "Remove-Item");
      }
      if (/\s+-r[f]?\b|\s+-f\b/i.test(trimmed)) {
        return trimmed.replace(/^rm\b.*/i, "rmdir /s /q");
      }
      return trimmed.replace(/^rm\b/i, "del /f");
    }
    if (lower === "grep") {
      return trimmed.replace(/^grep\b/i, isPowerShell ? "Select-String" : "findstr");
    }
    if (lower === "export") {
      const assignment = trimmed.match(/^export\s+([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/);
      if (isPowerShell) {
        if (assignment) {
          return `$env:${assignment[1]}=${assignment[2]}`;
        }
        return trimmed.replace(/^export\s+/i, "$env:");
      }
      return trimmed.replace(/^export\s+/i, "set ");
    }
    if (lower === "tail" && /\s+-f\b/i.test(trimmed)) {
      return trimmed.replace(/^tail\b.*-f\s+(.+)$/i, isPowerShell ? "Get-Content -Tail 100 -Wait $1" : "type $1");
    }
    if (lower === "ps") {
      return trimmed.replace(/^ps\b/i, isPowerShell ? "Get-Process" : "tasklist");
    }
    return command;
  }

  if (unixLike) {
    if (lower === "dir") {
      return trimmed.replace(/^dir\b/i, "ls");
    }
    if (lower === "type") {
      return trimmed.replace(/^type\b/i, "cat");
    }
    if (lower === "copy") {
      return trimmed.replace(/^copy\b/i, "cp");
    }
    if (lower === "move") {
      return trimmed.replace(/^move\b/i, "mv");
    }
    if (lower === "del") {
      return trimmed.replace(/^del\b/i, "rm -f");
    }
    if (lower === "findstr") {
      return trimmed.replace(/^findstr\b/i, "grep");
    }
    if (lower === "get-childitem") {
      return trimmed.replace(/^get-childitem\b/i, "ls");
    }
    if (lower === "get-location") {
      return trimmed.replace(/^get-location\b/i, "pwd");
    }
    if (lower === "set-location") {
      return trimmed.replace(/^set-location\b/i, "cd");
    }
    if (lower === "get-content") {
      return trimmed.replace(/^get-content\b/i, "cat");
    }
    if (lower === "copy-item") {
      return trimmed.replace(/^copy-item\b/i, "cp");
    }
    if (lower === "move-item") {
      return trimmed.replace(/^move-item\b/i, "mv");
    }
    if (lower === "remove-item") {
      return trimmed.replace(/^remove-item\b/i, "rm");
    }
    if (lower === "select-string") {
      return trimmed.replace(/^select-string\b/i, "grep");
    }
    if (lower === "tasklist") {
      return trimmed.replace(/^tasklist\b/i, "ps aux");
    }
    if (lower === "taskkill") {
      return trimmed.replace(/^taskkill\b/i, "kill");
    }
    if (lower === "set") {
      return trimmed.replace(/^set\s+/i, "export ");
    }
    if (/^\$env:[a-zA-Z_][a-zA-Z0-9_]*=/.test(trimmed)) {
      return trimmed.replace(/^\$env:([a-zA-Z_][a-zA-Z0-9_]*)=/, "export $1=");
    }
  }

  return command;
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
  const [sysStats, setSysStats] = useState<SysStats | null>(null);
  const [playbackSession, setPlaybackSession] = useState<string | null>(null);
  const [playbackTimeMs, setPlaybackTimeMs] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [playbackPlaying, setPlaybackPlaying] = useState<boolean>(false);
  const [dangerPrompt, setDangerPrompt] = useState<{ visible: boolean; command: string; context: string }>({
    visible: false,
    command: "",
    context: "",
  });
  const [llmTestBusy, setLlmTestBusy] = useState<boolean>(false);
  const [llmTestOutput, setLlmTestOutput] = useState<string>("");
  const [llmTestSummary, setLlmTestSummary] = useState<string>("");
  const [llmTransferStatus, setLlmTransferStatus] = useState<string>("");
  const [snippetSyncStatus, setSnippetSyncStatus] = useState<string>("");
  const [referralCodeInput, setReferralCodeInput] = useState<string>("");
  const [growthStatus, setGrowthStatus] = useState<string>("");
  const [sharedTemplatesPayload, setSharedTemplatesPayload] = useState<string>("");
  const [sharedTemplatesStatus, setSharedTemplatesStatus] = useState<string>("");
  const dangerResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const autoOpenedPinsServerRef = useRef<string | null>(null);
  const aliasGuessRef = useRef<Record<string, string>>({});
  const voiceLoopRetryCountRef = useRef<Record<string, number>>({});
  const voiceLoopRestartTimerRef = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const appOpenTrackedRef = useRef<boolean>(false);

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
  const { snippets, upsertSnippet, deleteSnippet, exportSnippets, importSnippets } = useSnippets();
  const { terminalTheme, setPreset: setTerminalPreset, setFontFamily: setTerminalFontFamily, setFontSize: setTerminalFontSize, setBackgroundOpacity: setTerminalBackgroundOpacity } = useTerminalTheme();
  const {
    profiles: llmProfiles,
    activeProfile,
    activeProfileId,
    loading: llmProfilesLoading,
    saveProfile,
    deleteProfile,
    setActive,
    exportEncrypted,
    importEncrypted,
  } = useLlmProfiles();
  const { sendPrompt, sendPromptDetailed } = useLlmClient();

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
    serverSshHostInput,
    serverSshUserInput,
    serverSshPortInput,
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
  } = useServers({ onError: setError, enabled: unlocked });

  const connected = useMemo(() => {
    if (!activeServer) {
      return false;
    }
    return Boolean(normalizeBaseUrl(activeServer.baseUrl) && activeServer.token.trim());
  }, [activeServer]);

  const { analyticsEnabled, analyticsAnonId, setAnalyticsEnabled, track } = useAnalytics({
    activeServer,
    connected,
  });
  const { myReferralCode, claimedReferralCode, buildReferralLink, claimReferralCode, extractReferralCodeFromUrl } = useReferrals();
  const { sharedTemplates, exportTemplatesFromServers, importTemplates, deleteTemplate } = useSharedProfiles();

  const {
    capabilities,
    terminalApiBasePath,
    supportedFeatures,
    loading: capabilitiesLoading,
    refresh: refreshCapabilities,
  } = useServerCapabilities({ activeServer, connected });
  const { shellRunWaitMs, parsedShellRunWaitMs, setShellRunWaitMsInput } = useShellRunWait(activeServerId);
  const {
    settings: glassesMode,
    setEnabled: setGlassesEnabled,
    setBrand: setGlassesBrand,
    setTextScale: setGlassesTextScale,
    setVoiceAutoSend: setGlassesVoiceAutoSend,
    setVoiceLoop: setGlassesVoiceLoop,
    setWakePhraseEnabled: setGlassesWakePhraseEnabled,
    setWakePhrase: setGlassesWakePhrase,
    setMinimalMode: setGlassesMinimalMode,
    setVadEnabled: setGlassesVadEnabled,
    setVadSilenceMs: setGlassesVadSilenceMs,
    setVadSensitivityDb: setGlassesVadSensitivityDb,
    setLoopCaptureMs: setGlassesLoopCaptureMs,
    setHeadsetPttEnabled: setGlassesHeadsetPttEnabled,
  } = useGlassesMode();
  const {
    recording: voiceRecording,
    busy: voiceBusy,
    lastTranscript: voiceTranscript,
    lastError: voiceError,
    meteringDb: voiceMeteringDb,
    permissionStatus: voicePermissionStatus,
    requestCapturePermission: requestVoicePermission,
    startCapture: startVoiceCapture,
    stopCapture: stopVoiceCapture,
    stopAndTranscribe: stopVoiceCaptureAndTranscribe,
    setLastTranscript: setVoiceTranscript,
  } = useVoiceCapture({ activeServer, connected });

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
    shellRunWaitMs: parsedShellRunWaitMs,
  });

  const remoteOpenSessions = useMemo(
    () => openSessions.filter((session) => !localAiSessions.includes(session)),
    [localAiSessions, openSessions]
  );

  const { commandHistory, historyCount, addCommand, recallPrev, recallNext } = useCommandHistory(activeServerId);
  const { sessionAliases, setAliasForSession, removeMissingAliases } = useSessionAliases(activeServerId);
  const { sessionTags, allTags, setTagsForSession, removeMissingSessions } = useSessionTags(activeServerId);
  const { pinnedSessions, togglePinnedSession, removeMissingPins } = usePinnedSessions(activeServerId);
  const {
    currentPath,
    setCurrentPath,
    includeHidden,
    setIncludeHidden,
    entries: fileEntries,
    selectedFilePath,
    selectedContent,
    setSelectedFilePath,
    setSelectedContent,
    tailLines,
    setTailLines,
    busy: filesBusy,
    busyLabel: filesBusyLabel,
    listDirectory,
    readFile,
    tailFile,
    writeFile,
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

  const openSshFallback = useCallback(
    async (server?: ServerProfile | null) => {
      const target = server || activeServer;
      if (!target) {
        throw new Error("No server selected.");
      }
      const sshUrl = toSshFallbackUrl(target);
      let canOpen = false;
      try {
        canOpen = await Linking.canOpenURL(sshUrl);
      } catch {
        canOpen = false;
      }
      if (!canOpen) {
        try {
          await Linking.openURL(sshUrl);
          return;
        } catch {
          throw new Error("No SSH-capable app is installed for ssh:// links.");
        }
      }
      await Linking.openURL(sshUrl);
    },
    [activeServer]
  );

  const shouldPollRemoteSession = useCallback(
    (session: string) => {
      if (streamLive[session]) {
        return false;
      }
      const state = connectionMeta[session]?.state;
      return state !== "connecting" && state !== "reconnecting";
    },
    [connectionMeta, streamLive]
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

  const {
    suggestionsBySession,
    suggestionBusyBySession,
    errorHintsBySession,
    triageBusyBySession,
    triageExplanationBySession,
    triageFixesBySession,
    requestShellSuggestions,
    explainSessionError,
    suggestSessionErrorFixes,
  } = useAiAssist({
    activeProfile,
    sendPrompt,
    allSessions,
    tails,
    commandHistory,
    drafts,
  });

  const { watchRules, watchAlertHistoryBySession, setWatchEnabled, setWatchPattern, clearWatchAlerts } = useWatchAlerts({
    activeServerId,
    allSessions,
    tails,
    isPro,
    notify,
  });

  const { recordings, toggleRecording, deleteRecording } = useSessionRecordings({
    allSessions,
    tails,
    onToggle: () => {
      void Haptics.selectionAsync();
    },
  });

  const { processes, processesBusy, refreshProcesses } = useProcessManager({
    activeServer,
    connected,
    enabled: capabilities.processes,
  });

  const { sessionPresence, sessionReadOnly, refreshSessionPresence, setSessionReadOnlyValue } = useCollaboration({
    activeServer,
    activeServerId,
    connected,
    enabled: capabilities.collaboration,
    terminalApiBasePath,
    remoteOpenSessions,
    focusedSession,
    allSessions,
    isLocalSession,
  });

  const { commandQueue, queueSessionCommand, flushSessionQueue, removeQueuedCommand } = useCommandQueue({
    activeServerId,
    allSessions,
    connected,
    sessionReadOnly,
    isLocalSession,
    shouldRouteToExternalAi,
    sendViaExternalLlm,
    sendCommand,
    addCommand,
    clearDraftForSession: (session) => {
      setDrafts((prev) => ({ ...prev, [session]: "" }));
    },
    onQueued: (message) => {
      setReady(message);
    },
  });

  const sendTextToSession = useCallback(
    async (session: string, text: string, mode: TerminalSendMode) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      if (sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only to send commands.`);
      }

      if (mode === "ai" && shouldRouteToExternalAi(session)) {
        const sent = await sendViaExternalLlm(session, trimmed);
        if (sent) {
          await addCommand(session, sent);
        }
        return;
      }

      if (!connected && !isLocalSession(session)) {
        queueSessionCommand(session, trimmed, mode);
        return;
      }

      await sendCommand(session, trimmed, mode, false);
      await addCommand(session, trimmed);
    },
    [addCommand, connected, isLocalSession, queueSessionCommand, sendCommand, sendViaExternalLlm, sessionReadOnly, shouldRouteToExternalAi]
  );

  const clearVoiceLoopRestart = useCallback((session: string) => {
    const pending = voiceLoopRestartTimerRef.current[session];
    if (!pending) {
      return;
    }
    clearTimeout(pending);
    voiceLoopRestartTimerRef.current[session] = null;
  }, []);

  const scheduleVoiceLoopRestart = useCallback(
    (session: string, delayMs: number) => {
      clearVoiceLoopRestart(session);
      voiceLoopRestartTimerRef.current[session] = setTimeout(() => {
        voiceLoopRestartTimerRef.current[session] = null;
        void startVoiceCapture().catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          setStatus({ text: `Voice loop restart failed: ${message}`, error: true });
        });
      }, Math.max(120, Math.min(delayMs, 15000)));
    },
    [clearVoiceLoopRestart, startVoiceCapture]
  );

  const stopVoiceCaptureIntoSession = useCallback(
    async (session: string): Promise<boolean> => {
      try {
        const rawTranscript = (
          await stopVoiceCaptureAndTranscribe({
            wakePhrase: glassesMode.wakePhrase,
            requireWakePhrase: glassesMode.wakePhraseEnabled,
            vadEnabled: glassesMode.vadEnabled,
            vadSilenceMs: glassesMode.vadSilenceMs,
          })
        ).trim();
        if (!rawTranscript) {
          throw new Error("No transcript detected. Try speaking closer to the microphone.");
        }
        const commandTranscript = glassesMode.wakePhraseEnabled
          ? extractWakePhraseCommand(rawTranscript, glassesMode.wakePhrase)
          : rawTranscript;
        if (!commandTranscript) {
          throw new Error(`Wake phrase "${glassesMode.wakePhrase}" was not detected.`);
        }

        if (commandTranscript !== rawTranscript) {
          setVoiceTranscript(commandTranscript);
        }

        setDrafts((prev) => ({ ...prev, [session]: commandTranscript }));
        if (!glassesMode.voiceAutoSend) {
          voiceLoopRetryCountRef.current[session] = 0;
          if (glassesMode.voiceLoop) {
            scheduleVoiceLoopRestart(session, 180);
          }
          return true;
        }
        setSessionMode(session, "ai");
        await sendTextToSession(session, commandTranscript, "ai");
        voiceLoopRetryCountRef.current[session] = 0;
        if (glassesMode.voiceLoop) {
          scheduleVoiceLoopRestart(session, 180);
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (glassesMode.voiceLoop) {
          if (!shouldRetryVoiceLoopError(message)) {
            clearVoiceLoopRestart(session);
            voiceLoopRetryCountRef.current[session] = 0;
            setStatus({ text: `Voice loop stopped: ${message}`, error: true });
            return false;
          }
          const nextRetry = (voiceLoopRetryCountRef.current[session] || 0) + 1;
          voiceLoopRetryCountRef.current[session] = nextRetry;
          const delayMs = Math.min(Math.round(900 * Math.pow(1.45, nextRetry - 1)), 10000);
          setStatus({ text: `Voice loop retry in ${Math.round(delayMs / 100) / 10}s: ${message}`, error: true });
          scheduleVoiceLoopRestart(session, delayMs);
          return false;
        }
        throw error;
      }
    },
    [
      glassesMode.voiceAutoSend,
      glassesMode.voiceLoop,
      glassesMode.wakePhrase,
      glassesMode.wakePhraseEnabled,
      glassesMode.vadEnabled,
      glassesMode.vadSilenceMs,
      clearVoiceLoopRestart,
      scheduleVoiceLoopRestart,
      sendTextToSession,
      setDrafts,
      setSessionMode,
      setStatus,
      setVoiceTranscript,
      stopVoiceCaptureAndTranscribe,
    ]
  );

  const sendVoiceTranscriptToSession = useCallback(
    async (session: string) => {
      const transcript = voiceTranscript.trim();
      if (!transcript) {
        throw new Error("No voice transcript is available yet.");
      }
      setSessionMode(session, "ai");
      await sendTextToSession(session, transcript, "ai");
    },
    [sendTextToSession, setSessionMode, voiceTranscript]
  );

  const openPlayback = useCallback(
    (session: string) => {
      const recording = recordings[session];
      if (!recording || recording.chunks.length === 0) {
        return;
      }
      setPlaybackSession(session);
      setPlaybackTimeMs(0);
      setPlaybackPlaying(false);
    },
    [recordings]
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

  const deleteRecordingWithPlaybackCleanup = useCallback(
    (session: string) => {
      deleteRecording(session);
      if (playbackSession === session) {
        setPlaybackSession(null);
        setPlaybackTimeMs(0);
        setPlaybackPlaying(false);
      }
    },
    [deleteRecording, playbackSession]
  );

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
    if (glassesMode.voiceLoop) {
      return;
    }
    Object.values(voiceLoopRestartTimerRef.current).forEach((timer) => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    voiceLoopRestartTimerRef.current = {};
    voiceLoopRetryCountRef.current = {};
  }, [glassesMode.voiceLoop]);

  useEffect(() => {
    return () => {
      Object.values(voiceLoopRestartTimerRef.current).forEach((timer) => {
        if (timer) {
          clearTimeout(timer);
        }
      });
      voiceLoopRestartTimerRef.current = {};
      voiceLoopRetryCountRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (route === "glasses" && !glassesMode.enabled) {
      setRoute("terminals");
    }
  }, [glassesMode.enabled, route]);

  useEffect(() => {
    if (route === "glasses") {
      return;
    }
    Object.values(voiceLoopRestartTimerRef.current).forEach((timer) => {
      if (timer) {
        clearTimeout(timer);
      }
    });
    voiceLoopRestartTimerRef.current = {};
    voiceLoopRetryCountRef.current = {};
    if (!voiceRecording) {
      return;
    }
    void stopVoiceCapture();
  }, [route, stopVoiceCapture, voiceRecording]);

  useEffect(() => {
    async function handleLink(url: string | null) {
      if (!url) {
        return;
      }

      const incomingReferralCode = extractReferralCodeFromUrl(url);
      if (incomingReferralCode) {
        setReferralCodeInput(incomingReferralCode);
        setRoute("servers");
        setGrowthStatus(`Referral code detected: ${incomingReferralCode}. Claim it in the Growth panel.`);
        track("referral_link_opened", { has_claimed: Boolean(claimedReferralCode) });
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
      const sshHost =
        typeof parsed.queryParams?.ssh_host === "string"
          ? parsed.queryParams.ssh_host
          : typeof parsed.queryParams?.sshHost === "string"
            ? parsed.queryParams.sshHost
            : "";
      const sshUser =
        typeof parsed.queryParams?.ssh_user === "string"
          ? parsed.queryParams.ssh_user
          : typeof parsed.queryParams?.sshUser === "string"
            ? parsed.queryParams.sshUser
            : "";
      const sshPort =
        typeof parsed.queryParams?.ssh_port === "string"
          ? parsed.queryParams.ssh_port
          : typeof parsed.queryParams?.sshPort === "string"
            ? parsed.queryParams.sshPort
            : "";
      const portainerUrl =
        typeof parsed.queryParams?.portainer_url === "string"
          ? parsed.queryParams.portainer_url
          : typeof parsed.queryParams?.portainerUrl === "string"
            ? parsed.queryParams.portainerUrl
            : "";
      const proxmoxUrl =
        typeof parsed.queryParams?.proxmox_url === "string"
          ? parsed.queryParams.proxmox_url
          : typeof parsed.queryParams?.proxmoxUrl === "string"
            ? parsed.queryParams.proxmoxUrl
            : "";
      const grafanaUrl =
        typeof parsed.queryParams?.grafana_url === "string"
          ? parsed.queryParams.grafana_url
          : typeof parsed.queryParams?.grafanaUrl === "string"
            ? parsed.queryParams.grafanaUrl
            : "";
      importServerConfig({ name, url: baseUrl, cwd, backend, sshHost, sshUser, sshPort, portainerUrl, proxmoxUrl, grafanaUrl });
      setRoute("servers");
      setReady("Imported server config. Add your token and save.");
      track("server_config_imported", { via: "deep_link" });
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
  }, [claimedReferralCode, extractReferralCodeFromUrl, importServerConfig, setReady, track]);

  useEffect(() => {
    if (!loadingSettings) {
      setReady("Profiles loaded");
    }
  }, [loadingSettings, setReady]);

  useEffect(() => {
    if (!unlocked || appOpenTrackedRef.current) {
      return;
    }
    appOpenTrackedRef.current = true;
    track("app_open", {
      analytics_enabled: analyticsEnabled,
      anon_id_present: Boolean(analyticsAnonId),
    });
  }, [analyticsAnonId, analyticsEnabled, track, unlocked]);

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
    if (!connected) {
      return;
    }
    const pendingSessions = Object.keys(commandQueue).filter((session) =>
      (commandQueue[session] || []).some((item) => commandQueueStatus(item) === "pending") && !sessionReadOnly[session]
    );
    if (pendingSessions.length === 0) {
      return;
    }
    pendingSessions.forEach((session) => {
      void runWithStatus(`Flushing queued commands for ${session}`, async () => {
        await flushSessionQueue(session, { includeFailed: false });
      });
    });
  }, [commandQueue, connected, flushSessionQueue, runWithStatus, sessionReadOnly]);

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
        if (shouldPollRemoteSession(session)) {
          void fetchTail(session, false);
        }
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [connected, fetchTail, remoteOpenSessions, shouldPollRemoteSession]);

  useEffect(() => {
    if (!connected || remoteOpenSessions.length === 0) {
      return;
    }

    const id = setTimeout(() => {
      remoteOpenSessions.forEach((session) => {
        if (shouldPollRemoteSession(session)) {
          void fetchTail(session, false);
        }
      });
    }, 1200);

    return () => clearTimeout(id);
  }, [connected, fetchTail, remoteOpenSessions, shouldPollRemoteSession]);

  useEffect(() => {
    void removeMissingSessions(allSessions);
  }, [allSessions, removeMissingSessions]);

  useEffect(() => {
    void removeMissingAliases(allSessions);
  }, [allSessions, removeMissingAliases]);

  useEffect(() => {
    void removeMissingPins(allSessions);
  }, [allSessions, removeMissingPins]);

  useEffect(() => {
    if (!activeServerId) {
      autoOpenedPinsServerRef.current = null;
      return;
    }

    if (!connected || autoOpenedPinsServerRef.current === activeServerId) {
      return;
    }

    const missingPinned = pinnedSessions.filter((session) => allSessions.includes(session) && !openSessions.includes(session));
    if (missingPinned.length === 0) {
      autoOpenedPinsServerRef.current = activeServerId;
      return;
    }

    const freeSlots = isPro ? Number.POSITIVE_INFINITY : Math.max(0, FREE_SESSION_LIMIT - openSessions.length);
    if (freeSlots <= 0) {
      autoOpenedPinsServerRef.current = activeServerId;
      return;
    }

    missingPinned.slice(0, freeSlots).forEach((session) => {
      toggleSessionVisible(session);
    });
    autoOpenedPinsServerRef.current = activeServerId;
  }, [activeServerId, allSessions, connected, isPro, openSessions, pinnedSessions, toggleSessionVisible]);

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
    const unnamed = allSessions.filter((session) => !(sessionAliases[session] || "").trim());
    if (unnamed.length === 0) {
      return;
    }
    const pending: Array<{ session: string; guess: string; fingerprint: string }> = [];
    unnamed.forEach((session) => {
      const guess = inferSessionAlias(session, tails[session] || "", commandHistory[session] || []);
      if (!guess) {
        return;
      }
      const fingerprint = `${guess}::${(commandHistory[session] || []).length}::${(tails[session] || "").slice(-240)}`;
      if (aliasGuessRef.current[session] === fingerprint) {
        return;
      }
      aliasGuessRef.current[session] = fingerprint;
      pending.push({ session, guess, fingerprint });
    });
    pending.forEach(({ session, guess }) => {
      void setAliasForSession(session, guess);
    });
  }, [allSessions, commandHistory, sessionAliases, setAliasForSession, tails]);

  useEffect(() => {
    if (!connected || !activeServer || !capabilities.sysStats) {
      setSysStats(null);
      return;
    }
    let mounted = true;
    const loadStats = async () => {
      try {
        const stats = await apiRequest<SysStats>(activeServer.baseUrl, activeServer.token, "/sys/stats");
        if (mounted) {
          setSysStats(stats);
        }
      } catch {
        if (mounted) {
          setSysStats(null);
        }
      }
    };
    void loadStats();
    const id = setInterval(() => {
      void loadStats();
    }, 15000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [activeServer, capabilities.sysStats, connected]);

  const activePlaybackRecording = playbackSession ? recordings[playbackSession] || null : null;
  const playbackDuration = recordingDurationMs(activePlaybackRecording);
  const playbackOutput = useMemo(
    () => buildPlaybackOutput(activePlaybackRecording?.chunks || [], playbackTimeMs),
    [activePlaybackRecording?.chunks, playbackTimeMs]
  );
  const playbackLabel = `${(playbackTimeMs / 1000).toFixed(1)}s / ${(playbackDuration / 1000).toFixed(1)}s · ${
    activePlaybackRecording?.chunks.length || 0
  } chunks`;

  useEffect(() => {
    if (!playbackSession) {
      return;
    }
    if (!activePlaybackRecording) {
      setPlaybackSession(null);
      setPlaybackTimeMs(0);
      setPlaybackPlaying(false);
      return;
    }
    if (playbackTimeMs > playbackDuration) {
      setPlaybackTimeMs(playbackDuration);
    }
  }, [activePlaybackRecording, playbackDuration, playbackSession, playbackTimeMs]);

  useEffect(() => {
    if (!playbackPlaying || !activePlaybackRecording) {
      return;
    }
    const tickMs = 80;
    const id = setInterval(() => {
      setPlaybackTimeMs((prev) => {
        const next = prev + Math.round(tickMs * playbackSpeed);
        if (next >= playbackDuration) {
          setPlaybackPlaying(false);
          return playbackDuration;
        }
        return next;
      });
    }, tickMs);
    return () => {
      clearInterval(id);
    };
  }, [activePlaybackRecording, playbackDuration, playbackPlaying, playbackSpeed]);

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
    capabilitiesLoading,
    health,
    capabilities,
    supportedFeatures,
    sysStats,
    hasExternalLlm: Boolean(activeProfile),
    localAiSessions,
    commandHistory,
    historyCount,
    sessionAliases,
    sessionTags,
    allTags,
    tagFilter,
    pinnedSessions,
    isPro,
    fleetCommand,
    fleetCwd,
    fleetTargets,
    fleetBusy,
    fleetWaitMs,
    shellRunWaitMs,
    fleetResults,
    processes,
    processesBusy,
    sessionPresence,
    sessionReadOnly,
    suggestionsBySession,
    suggestionBusyBySession,
    errorHintsBySession,
    triageBusyBySession,
    triageExplanationBySession,
    triageFixesBySession,
    watchRules,
    watchAlertHistoryBySession,
    terminalTheme,
    commandQueue,
    recordings,
    glassesMode,
    voiceRecording,
    voiceBusy,
    voiceTranscript,
    voiceError,
    voiceMeteringDb,
    onShowPaywall: () => setPaywallVisible(true),
    onSetTagFilter: setTagFilter,
    onSetStartCwd: setStartCwd,
    onSetStartPrompt: setStartPrompt,
    onSetStartOpenOnMac: setStartOpenOnMac,
    onSetStartKind: setStartKind,
    onSetStartAiEngine: setStartAiEngine,
    onRefreshCapabilities: () => {
      void runWithStatus("Rechecking server features", async () => {
        await refreshCapabilities(true);
      });
    },
    onRefreshSessions: () => {
      void runWithStatus("Refreshing sessions", async () => {
        await refreshSessions();
      });
    },
    onOpenServers: () => setRoute("servers"),
    onOpenSshFallback: () => {
      void runWithStatus("Opening SSH fallback", async () => {
        await openSshFallback(activeServer);
      });
    },
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
            track("session_started", { kind: "ai", engine: "external", local: true });
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
        track("session_started", {
          kind: startKind,
          engine: startKind === "ai" ? startAiEngine : "shell",
          local: false,
        });
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
          alias: sessionAliases[session] || "",
          mode: sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell"),
          commands: commandHistory[session] || [],
          output: tails[session] || "",
          recording: recordings[session]
            ? {
                active: recordings[session].active,
                started_at_ms: recordings[session].startedAt,
                stopped_at_ms: recordings[session].stoppedAt,
                chunks: recordings[session].chunks,
              }
            : null,
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
        if (sessionReadOnly[session]) {
          throw new Error(`${session} is read-only. Disable read-only before sending Ctrl-C.`);
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
    onSetSessionAlias: (session, alias) => {
      void setAliasForSession(session, alias);
    },
    onAutoNameSession: (session) => {
      const guess = inferSessionAlias(session, tails[session] || "", commandHistory[session] || []);
      if (!guess) {
        setStatus({ text: `No obvious alias detected for ${session}.`, error: false });
        return;
      }
      void setAliasForSession(session, guess);
      setStatus({ text: `${session} renamed to ${guess}.`, error: false });
    },
    onSetDraft: (session, value) => {
      setDrafts((prev) => ({
        ...prev,
        [session]: value,
      }));
    },
    onAdaptDraftForBackend: (session) => {
      const source = drafts[session] || "";
      const adapted = adaptCommandForBackend(source, activeServer?.terminalBackend);
      if (adapted === source) {
        setStatus({ text: "No backend adaptation needed.", error: false });
        return;
      }
      setDrafts((prev) => ({ ...prev, [session]: adapted }));
      setStatus({ text: `Adapted command for ${activeServer?.terminalBackend || "auto"} backend.`, error: false });
    },
    onSend: (session) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void runWithStatus(`Sending to ${session}`, async () => {
        const draft = (drafts[session] || "").trim();
        const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
        if (sessionReadOnly[session]) {
          throw new Error(`${session} is read-only. Disable read-only to send commands.`);
        }
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

        if (!connected && !isLocalSession(session)) {
          queueSessionCommand(session, draft, mode);
          return;
        }

        const sent = await handleSend(session);
        if (sent) {
          await addCommand(session, sent);
          track("command_sent", { mode, session_kind: isLocalSession(session) ? "local" : "remote" });
        }
      });
    },
    onClearDraft: (session) => {
      setDrafts((prev) => ({ ...prev, [session]: "" }));
    },
    onTogglePinSession: (session) => {
      void togglePinnedSession(session);
    },
    onSetFleetCommand: setFleetCommand,
    onSetFleetCwd: setFleetCwd,
    onToggleFleetTarget: (serverId) => {
      setFleetTargets((prev) => (prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]));
    },
    onSetFleetWaitMs: setFleetWaitMs,
    onSetShellRunWaitMs: setShellRunWaitMsInput,
    onRefreshProcesses: () => {
      void runWithStatus("Refreshing processes", async () => {
        await refreshProcesses();
      });
    },
    onKillProcess: (pid, signal: ProcessSignal = "TERM") => {
      void runWithStatus(`Sending ${signal} to PID ${pid}`, async () => {
        if (!activeServer || !connected || !capabilities.processes) {
          throw new Error("Process manager is unavailable on the active server.");
        }
        await apiRequest(activeServer.baseUrl, activeServer.token, "/proc/kill", {
          method: "POST",
          body: JSON.stringify({ pid, signal }),
        });
        await refreshProcesses();
      });
    },
    onKillProcesses: (pids, signal) => {
      void runWithStatus(`Sending ${signal} to ${pids.length} process(es)`, async () => {
        if (!activeServer || !connected || !capabilities.processes) {
          throw new Error("Process manager is unavailable on the active server.");
        }
        const uniquePids = Array.from(new Set(pids.filter((pid) => Number.isFinite(pid) && pid > 0)));
        if (uniquePids.length === 0) {
          return;
        }
        await Promise.all(
          uniquePids.map((pid) =>
            apiRequest(activeServer.baseUrl, activeServer.token, "/proc/kill", {
              method: "POST",
              body: JSON.stringify({ pid, signal }),
            })
          )
        );
        await refreshProcesses();
      });
    },
    onRefreshSessionPresence: (session) => {
      void runWithStatus(`Refreshing presence for ${session}`, async () => {
        await refreshSessionPresence(session, true);
      });
    },
    onSetSessionReadOnly: (session, value) => {
      setSessionReadOnlyValue(session, value);
    },
    onRequestSuggestions: (session) => {
      void runWithStatus(`Generating suggestions for ${session}`, async () => {
        await requestShellSuggestions(session);
      });
    },
    onUseSuggestion: (session, value) => {
      setDrafts((prev) => ({ ...prev, [session]: value }));
    },
    onExplainError: (session) => {
      void runWithStatus(`Explaining ${session} error`, async () => {
        await explainSessionError(session);
      });
    },
    onSuggestErrorFixes: (session) => {
      void runWithStatus(`Generating ${session} fixes`, async () => {
        await suggestSessionErrorFixes(session);
      });
    },
    onToggleWatch: (session, enabled) => {
      setWatchEnabled(session, enabled);
    },
    onSetWatchPattern: (session, pattern) => {
      setWatchPattern(session, pattern);
    },
    onClearWatchAlerts: (session) => {
      clearWatchAlerts(session);
    },
    onSetTerminalPreset: setTerminalPreset,
    onSetTerminalFontFamily: setTerminalFontFamily,
    onSetTerminalFontSize: setTerminalFontSize,
    onSetTerminalBackgroundOpacity: setTerminalBackgroundOpacity,
    onFlushQueue: (session) => {
      void runWithStatus(`Flushing queued commands for ${session}`, async () => {
        await flushSessionQueue(session, { includeFailed: true });
      });
    },
    onRemoveQueuedCommand: (session, index) => {
      removeQueuedCommand(session, index);
    },
    onToggleRecording: toggleRecording,
    onOpenPlayback: openPlayback,
    onDeleteRecording: deleteRecordingWithPlaybackCleanup,
    onSetGlassesEnabled: setGlassesEnabled,
    onSetGlassesBrand: setGlassesBrand,
    onSetGlassesTextScale: setGlassesTextScale,
    onSetGlassesVoiceAutoSend: setGlassesVoiceAutoSend,
    onSetGlassesVoiceLoop: setGlassesVoiceLoop,
    onSetGlassesWakePhraseEnabled: setGlassesWakePhraseEnabled,
    onSetGlassesWakePhrase: setGlassesWakePhrase,
    onSetGlassesMinimalMode: setGlassesMinimalMode,
    onSetGlassesVadEnabled: setGlassesVadEnabled,
    onSetGlassesVadSilenceMs: setGlassesVadSilenceMs,
    onSetGlassesVadSensitivityDb: setGlassesVadSensitivityDb,
    onSetGlassesLoopCaptureMs: setGlassesLoopCaptureMs,
    onSetGlassesHeadsetPttEnabled: setGlassesHeadsetPttEnabled,
    onOpenGlassesMode: () => {
      if (!glassesMode.enabled) {
        setGlassesEnabled(true);
      }
      if (voicePermissionStatus !== "granted") {
        setStatus({
          text: "Glasses voice mode needs microphone access. Please allow microphone permission.",
          error: false,
        });
        void requestVoicePermission();
      }
      setRoute("glasses");
    },
    onCloseGlassesMode: () => {
      setRoute("terminals");
    },
    onVoiceStartCapture: () => {
      void runWithStatus("Starting voice capture", async () => {
        await Haptics.selectionAsync();
        await startVoiceCapture();
      });
    },
    onVoiceStopCapture: (session) => {
      if (glassesMode.voiceLoop) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void stopVoiceCaptureIntoSession(session).then((ok) => {
          if (ok) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        });
        return;
      }
      void runWithStatus(`Transcribing voice for ${session}`, async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await stopVoiceCaptureIntoSession(session);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      });
    },
    onVoiceSendTranscript: (session) => {
      void runWithStatus(`Sending transcript to ${session}`, async () => {
        await sendVoiceTranscriptToSession(session);
      });
    },
    onRunFleet: () => {
      void runWithStatus("Running fleet command", async () => {
        const approved = await requestDangerApproval(fleetCommand, "Fleet execute");
        if (!approved) {
          return;
        }
        await runFleetCommand();
        track("fleet_run", { target_count: fleetTargets.length });
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
          {route !== "glasses" ? (
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
          ) : null}

          {route !== "glasses" ? (
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
          ) : null}

          {route === "servers" ? (
            <ServersScreen
              servers={servers}
              activeServerId={activeServerId}
              serverNameInput={serverNameInput}
              serverUrlInput={serverUrlInput}
              serverTokenInput={serverTokenInput}
              serverCwdInput={serverCwdInput}
              serverBackendInput={serverBackendInput || DEFAULT_TERMINAL_BACKEND}
              serverSshHostInput={serverSshHostInput}
              serverSshUserInput={serverSshUserInput}
              serverSshPortInput={serverSshPortInput}
              serverPortainerUrlInput={serverPortainerUrlInput}
              serverProxmoxUrlInput={serverProxmoxUrlInput}
              serverGrafanaUrlInput={serverGrafanaUrlInput}
              editingServerId={editingServerId}
              tokenMasked={tokenMasked}
              isPro={isPro}
              analyticsEnabled={analyticsEnabled}
              analyticsAnonId={analyticsAnonId}
              myReferralCode={myReferralCode}
              claimedReferralCode={claimedReferralCode}
              referralCodeInput={referralCodeInput}
              growthStatus={growthStatus}
              sharedTemplatesPayload={sharedTemplatesPayload}
              sharedTemplatesStatus={sharedTemplatesStatus}
              sharedTemplates={sharedTemplates}
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
              onOpenServerSsh={(server) => {
                void runWithStatus(`Opening SSH fallback for ${server.name}`, async () => {
                  await openSshFallback(server);
                });
              }}
              onSetServerName={setServerNameInput}
              onSetServerUrl={setServerUrlInput}
              onSetServerToken={setServerTokenInput}
              onSetServerCwd={setServerCwdInput}
              onSetServerBackend={setServerBackendInput}
              onSetServerSshHost={setServerSshHostInput}
              onSetServerSshUser={setServerSshUserInput}
              onSetServerSshPort={setServerSshPortInput}
              onSetServerPortainerUrl={setServerPortainerUrlInput}
              onSetServerProxmoxUrl={setServerProxmoxUrlInput}
              onSetServerGrafanaUrl={setServerGrafanaUrlInput}
              onSetAnalyticsEnabled={(value) => {
                void runWithStatus("Updating analytics setting", async () => {
                  await setAnalyticsEnabled(value);
                  setGrowthStatus(value ? "Anonymous analytics enabled." : "Anonymous analytics disabled.");
                  track("analytics_toggled", { enabled: value });
                });
              }}
              onShareReferral={() => {
                void runWithStatus("Sharing referral link", async () => {
                  const link = buildReferralLink();
                  if (!link) {
                    throw new Error("Referral system is still initializing.");
                  }
                  await Share.share({
                    title: "Join NovaRemote Pro",
                    message: `Use my NovaRemote referral code ${myReferralCode}: ${link}`,
                  });
                  setGrowthStatus("Referral link shared.");
                  track("referral_shared", { has_claimed: Boolean(claimedReferralCode) });
                });
              }}
              onSetReferralCodeInput={setReferralCodeInput}
              onClaimReferralCode={() => {
                void runWithStatus("Claiming referral code", async () => {
                  const claimed = await claimReferralCode(referralCodeInput);
                  setGrowthStatus(`Referral code ${claimed} claimed.`);
                  track("referral_claimed", { code_present: Boolean(claimed) });
                });
              }}
              onSetSharedTemplatesPayload={setSharedTemplatesPayload}
              onExportSharedTemplates={() => {
                if (!isPro) {
                  setPaywallVisible(true);
                  return;
                }
                const payload = exportTemplatesFromServers(servers);
                setSharedTemplatesPayload(payload);
                setSharedTemplatesStatus(
                  `Exported ${servers.length} template(s) from current profiles at ${new Date().toLocaleTimeString()}.`
                );
                track("shared_templates_exported", { template_count: servers.length });
              }}
              onImportSharedTemplates={() => {
                if (!isPro) {
                  setPaywallVisible(true);
                  return;
                }
                void runWithStatus("Importing shared templates", async () => {
                  const summary = await importTemplates(sharedTemplatesPayload);
                  setSharedTemplatesStatus(
                    `Imported ${summary.imported} template(s), skipped ${summary.skipped}. Total templates: ${summary.total}.`
                  );
                  track("shared_templates_imported", { imported: summary.imported, skipped: summary.skipped });
                });
              }}
              onApplySharedTemplate={(template: SharedServerTemplate) => {
                importServerConfig({
                  name: template.name,
                  url: template.baseUrl,
                  cwd: template.defaultCwd,
                  backend: template.terminalBackend,
                  sshHost: template.sshHost,
                  sshUser: template.sshUser,
                  sshPort: template.sshPort,
                  portainerUrl: template.portainerUrl,
                  proxmoxUrl: template.proxmoxUrl,
                  grafanaUrl: template.grafanaUrl,
                });
                setGrowthStatus(`Applied shared template ${template.name}. Add token then save.`);
                track("shared_template_applied", {
                  has_ssh: Boolean(template.sshHost),
                  has_integrations: Boolean(template.portainerUrl || template.proxmoxUrl || template.grafanaUrl),
                });
              }}
              onDeleteSharedTemplate={(templateId) => {
                void runWithStatus("Deleting shared template", async () => {
                  await deleteTemplate(templateId);
                });
              }}
              onShowPaywall={() => setPaywallVisible(true)}
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
                  track("server_saved", { editing: Boolean(editingServerId), server_count: servers.length });
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

          {route === "glasses" ? (
            <AppProvider value={{ terminals: terminalsViewModel }}>
              <GlassesModeScreen />
            </AppProvider>
          ) : null}

          {route === "snippets" ? (
            <SnippetsScreen
              snippets={filteredSnippets}
              activeServerId={activeServerId}
              openSessions={openSessions}
              isPro={isPro}
              syncStatus={snippetSyncStatus}
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
                  if (sessionReadOnly[session]) {
                    throw new Error(`${session} is read-only. Disable read-only to run snippets.`);
                  }
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
                  if (!connected && !isLocalSession(session)) {
                    queueSessionCommand(session, command, mode);
                    return;
                  }
                  await sendCommand(session, command, mode, false);
                  await addCommand(session, command);
                });
              }}
              onExportSnippets={(scopeServerId) => {
                const payload = exportSnippets({
                  serverId: scopeServerId,
                  includeGlobal: true,
                });
                const targetLabel = scopeServerId ? "current server + global" : "all";
                setSnippetSyncStatus(`Export bundle generated (${targetLabel}) at ${new Date().toLocaleTimeString()}.`);
                return payload;
              }}
              onImportSnippets={(payload) => {
                void runWithStatus("Importing snippets", async () => {
                  const summary = await importSnippets(payload);
                  setSnippetSyncStatus(
                    `Imported ${summary.imported} snippet(s), skipped ${summary.skipped}. Total stored: ${summary.total}.`
                  );
                });
              }}
            />
          ) : null}

          {route === "files" ? (
            capabilities.files ? (
              <FilesScreen
                connected={connected}
                busy={filesBusy}
                busyLabel={filesBusyLabel}
                canWrite={capabilities.files}
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
                onSetSelectedFilePath={setSelectedFilePath}
                onSetSelectedContent={setSelectedContent}
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
                onSaveFile={(path, content) => {
                  void runWithStatus("Saving remote file", async () => {
                    await writeFile(path, content);
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
                    if (sessionReadOnly[session]) {
                      throw new Error(`${session} is read-only. Disable read-only to run file commands.`);
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
              loading={llmProfilesLoading}
              testBusy={llmTestBusy}
              testOutput={llmTestOutput}
              testSummary={llmTestSummary}
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
              onTestPrompt={(profile, prompt, options) => {
                void runWithStatus(`Testing ${profile.name}`, async () => {
                  setLlmTestBusy(true);
                  const started = Date.now();
                  try {
                    const result = await sendPromptDetailed(profile, prompt, options);
                    const elapsed = Date.now() - started;
                    const trace = result.toolCalls
                      .map((entry, index) => {
                        const header = `${index + 1}. ${entry.name}(${entry.arguments})`;
                        return `${header}\n${entry.output}`;
                      })
                      .join("\n\n");
                    const output = trace
                      ? `${result.text}\n\n[Tool Calls]\n${trace}`
                      : result.text;
                    const flags = [
                      result.usedVision ? "vision" : "",
                      result.usedTools ? `${result.toolCalls.length} tool call(s)` : "",
                    ]
                      .filter(Boolean)
                      .join(" • ");
                    setLlmTestSummary(
                      `${profile.kind} • ${profile.model} • ${elapsed} ms${flags ? ` • ${flags}` : ""}`
                    );
                    setLlmTestOutput(output);
                  } catch (error) {
                    const elapsed = Date.now() - started;
                    setLlmTestSummary(`${profile.kind} • ${profile.model} • failed after ${elapsed} ms`);
                    setLlmTestOutput(error instanceof Error ? error.message : String(error));
                    throw error;
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
        isReadOnly={focusedSession ? Boolean(sessionReadOnly[focusedSession]) : false}
        collaboratorCount={focusedSession ? (sessionPresence[focusedSession] || []).length : 0}
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
            if (sessionReadOnly[focusedSession]) {
              throw new Error(`${focusedSession} is read-only. Disable read-only to send commands.`);
            }
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
            if (!connected && !isLocalSession(focusedSession)) {
              queueSessionCommand(focusedSession, focusedDraft, focusedMode);
              return;
            }
            const sent = await handleSend(focusedSession);
            if (sent) {
              await addCommand(focusedSession, sent);
              track("command_sent", {
                mode: focusedMode,
                session_kind: isLocalSession(focusedSession) ? "local" : "remote",
              });
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
            if (sessionReadOnly[focusedSession]) {
              throw new Error(`${focusedSession} is read-only. Disable read-only before sending Ctrl-C.`);
            }
            await handleStop(focusedSession);
          });
        }}
      />

      <SessionPlaybackModal
        visible={Boolean(playbackSession && activePlaybackRecording)}
        session={playbackSession}
        output={playbackOutput}
        positionLabel={playbackLabel}
        speed={playbackSpeed}
        isPlaying={playbackPlaying}
        onClose={() => {
          setPlaybackPlaying(false);
          setPlaybackSession(null);
          setPlaybackTimeMs(0);
        }}
        onPlayPause={() => {
          if (!activePlaybackRecording) {
            return;
          }
          if (playbackDuration <= 0) {
            return;
          }
          setPlaybackPlaying((prev) => !prev);
        }}
        onRestart={() => {
          setPlaybackTimeMs(0);
          setPlaybackPlaying(false);
        }}
        onBack={() => {
          setPlaybackTimeMs((prev) => Math.max(0, prev - 2000));
        }}
        onForward={() => {
          setPlaybackTimeMs((prev) => Math.min(playbackDuration, prev + 2000));
        }}
        onSetSpeed={setPlaybackSpeed}
        onExport={() => {
          if (!activePlaybackRecording) {
            return;
          }
          void runWithStatus(`Exporting recording ${activePlaybackRecording.session}`, async () => {
            const header = {
              version: 2,
              width: 80,
              height: 24,
              timestamp: Math.floor(activePlaybackRecording.startedAt / 1000),
              env: {
                TERM: "xterm-256color",
              },
            };
            const eventLines = activePlaybackRecording.chunks.map((chunk) =>
              JSON.stringify([Number((chunk.atMs / 1000).toFixed(3)), "o", chunk.text])
            );
            const cast = [JSON.stringify(header), ...eventLines].join("\n");
            await Share.share({
              title: `${activePlaybackRecording.session}.cast`,
              message: cast,
            });
          });
        }}
      />

      <PaywallModal
        visible={paywallVisible}
        priceLabel={priceLabel}
        onClose={() => setPaywallVisible(false)}
        onUpgrade={() => {
          void runWithStatus("Purchasing Pro", async () => {
            track("purchase_attempt", { flow: "upgrade" });
            if (!rcAvailable) {
              throw new Error("RevenueCat keys are not configured yet.");
            }
            const pro = await purchasePro();
            if (pro) {
              track("purchase_success", { flow: "upgrade" });
              setPaywallVisible(false);
            }
          });
        }}
        onRestore={() => {
          void runWithStatus("Restoring purchases", async () => {
            track("purchase_attempt", { flow: "restore" });
            if (!rcAvailable) {
              throw new Error("RevenueCat keys are not configured yet.");
            }
            const pro = await restore();
            if (pro) {
              track("purchase_success", { flow: "restore" });
              setPaywallVisible(false);
            }
          });
        }}
      />

      <OnboardingModal
        visible={!onboardingCompleted}
        notificationsGranted={permissionStatus === "granted"}
        microphoneGranted={voicePermissionStatus === "granted"}
        onRequestNotifications={() => {
          void requestPermission();
        }}
        onRequestMicrophone={() => {
          setStatus({
            text: "NovaRemote uses microphone access for glasses voice commands.",
            error: false,
          });
          void requestVoicePermission();
        }}
        onTestConnection={async (server) => {
          const healthUrl = `${normalizeBaseUrl(server.url)}/health`;
          let response: Response;
          try {
            response = await fetch(healthUrl, {
              method: "GET",
              headers: {
                Authorization: `Bearer ${server.token}`,
              },
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Cannot reach server. Check URL and network connection. (${message})`);
          }

          if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
              throw new Error("Cannot authenticate with this server. Check your token and try again.");
            }
            if (response.status === 404) {
              throw new Error("Server reachable, but `/health` was not found. Verify companion server routes.");
            }
            throw new Error(`Server returned HTTP ${response.status}. Check URL, token, and network access.`);
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
