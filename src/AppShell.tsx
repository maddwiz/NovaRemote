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
import { SessionPlaybackModal } from "./components/SessionPlaybackModal";
import { ShareServerModal } from "./components/ShareServerModal";
import { StatusPill } from "./components/StatusPill";
import { TabBar } from "./components/TabBar";
import { TutorialModal } from "./components/TutorialModal";
import { AppProvider } from "./context/AppContext";
import { BRAND_LOGO } from "./branding";
import {
  DEFAULT_CWD,
  DEFAULT_FLEET_WAIT_MS,
  DEFAULT_SPECTATE_TTL_SECONDS,
  DEFAULT_TERMINAL_BACKEND,
  FREE_SERVER_LIMIT,
  FREE_SESSION_LIMIT,
  STORAGE_WATCH_RULES_PREFIX,
  isLikelyAiSession,
} from "./constants";
import { useAiAssist } from "./hooks/useAiAssist";
import { useBiometricLock } from "./hooks/useBiometricLock";
import { useAuditLog } from "./hooks/useAuditLog";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { commandQueueStatus, useCommandQueue } from "./hooks/useCommandQueue";
import { useCollaboration } from "./hooks/useCollaboration";
import { useConnectionPool } from "./hooks/useConnectionPool";
import { useServerConnection } from "./hooks/useServerConnection";
import { useNovaAgentRuntime } from "./hooks/useNovaAgentRuntime";
import { useProcessManager } from "./hooks/useProcessManager";
import { useSessionRecordings } from "./hooks/useSessionRecordings";
import { useNotifications } from "./hooks/useNotifications";
import { useOnboarding } from "./hooks/useOnboarding";
import { useRevenueCat } from "./hooks/useRevenueCat";
import { useSafetyPolicy } from "./hooks/useSafetyPolicy";
import { useServers } from "./hooks/useServers";
import { useSessionTags } from "./hooks/useSessionTags";
import { useSessionAliases } from "./hooks/useSessionAliases";
import { useSnippets } from "./hooks/useSnippets";
import { useTerminalTheme } from "./hooks/useTerminalTheme";
import { useTutorial } from "./hooks/useTutorial";
import { useUnreadServers } from "./hooks/useUnreadServers";
import { useWatchAlerts } from "./hooks/useWatchAlerts";
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
import { useTeamAuth } from "./hooks/useTeamAuth";
import { useTerminalsViewModel } from "./hooks/useTerminalsViewModel";
import { useTokenBroker } from "./hooks/useTokenBroker";
import {
  isFleetShellRunUnavailableError,
  resolveFleetTerminalApiBasePath,
  shouldAttemptFleetShellRun,
} from "./fleetTerminalBasePath";
import { findApprovedFleetApproval, findPendingFleetApproval } from "./fleetApproval";
import { FilesScreen } from "./screens/FilesScreen";
import { LlmsScreen } from "./screens/LlmsScreen";
import { ServersScreen } from "./screens/ServersScreen";
import { SnippetsScreen } from "./screens/SnippetsScreen";
import { TeamScreen } from "./screens/TeamScreen";
import { GlassesModeScreen } from "./screens/GlassesModeScreen";
import { TerminalsScreen } from "./screens/TerminalsScreen";
import { VrCommandCenterScreen } from "./screens/VrCommandCenterScreen";
import { styles } from "./theme/styles";
import { buildTerminalAppearance } from "./theme/terminalTheme";
import { evaluateCrossServerWatchAlerts } from "./crossServerWatchAlerts";
import { findAgentIdsByName, hasExactAgentName } from "./agentMatching";
import { findBlockedCommandPattern, resolveSessionTimeoutMs } from "./teamPolicy";
import {
  AiEnginePreference,
  FleetRunResult,
  ProcessSignal,
  RecordingChunk,
  RouteTab,
  ServerProfile,
  SessionRecording,
  Status,
  SpectateLinkResponse,
  SharedServerTemplate,
  SysStats,
  TerminalBackendKind,
  TerminalSendMode,
  TmuxTailResponse,
  WatchRule,
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

function uniqueServerIds(serverIds: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  serverIds.forEach((serverId) => {
    const value = serverId.trim();
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    next.push(value);
  });
  return next;
}

function buildTeamServerSignature(servers: ServerProfile[]): string {
  return JSON.stringify(
    servers
      .filter((server) => server.source === "team")
      .map((server) => ({
        id: server.id,
        name: server.name,
        baseUrl: server.baseUrl,
        defaultCwd: server.defaultCwd,
        permissionLevel: server.permissionLevel || "viewer",
        teamServerId: server.teamServerId || server.id,
      }))
      .sort((a, b) => a.id.localeCompare(b.id))
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
  if (server.vmHost) {
    queryParams.vm_host = server.vmHost;
  }
  if (server.vmType) {
    queryParams.vm_type = server.vmType;
  }
  if (server.vmName) {
    queryParams.vm_name = server.vmName;
  }
  if (server.vmId) {
    queryParams.vm_id = server.vmId;
  }
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

function resolveMaybeAbsoluteUrl(baseUrl: string, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return `${normalizeBaseUrl(baseUrl)}${trimmed}`;
  }
  return `${normalizeBaseUrl(baseUrl)}/${trimmed.replace(/^\/+/, "")}`;
}

function parseSpectateLinkPayload(
  baseUrl: string,
  session: string,
  payload: SpectateLinkResponse
): { url: string; expiresAt: string | null } {
  const direct = [payload.viewer_url, payload.spectate_url, payload.web_url, payload.url]
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .find(Boolean);

  const expiresRaw =
    typeof payload.expires_at === "string"
      ? payload.expires_at.trim()
      : typeof payload.expiresAt === "string"
      ? payload.expiresAt.trim()
      : "";
  const expiresAt = expiresRaw && !Number.isNaN(Date.parse(expiresRaw)) ? new Date(expiresRaw).toISOString() : null;

  if (direct) {
    const resolved = resolveMaybeAbsoluteUrl(baseUrl, direct);
    if (!resolved) {
      throw new Error("Server returned an empty spectator URL.");
    }
    return {
      url: resolved,
      expiresAt,
    };
  }

  const token = typeof payload.viewer_token === "string"
    ? payload.viewer_token.trim()
    : typeof payload.token === "string"
    ? payload.token.trim()
    : "";
  if (!token) {
    throw new Error("Server did not return a spectator URL or token.");
  }

  const customPath = typeof payload.path === "string" ? payload.path.trim() : "";
  const path = customPath ? (customPath.startsWith("/") ? customPath : `/${customPath}`) : "/spectate";
  return {
    url: `${normalizeBaseUrl(baseUrl)}${path}?session=${encodeURIComponent(session)}&token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}

async function createSpectateLink(
  server: ServerProfile,
  terminalApiBasePath: "/tmux" | "/terminal",
  session: string
): Promise<{ url: string; expiresAt: string | null }> {
  const candidates = Array.from(new Set([`${terminalApiBasePath}/spectate`, "/session/spectate", "/spectate/token"]));
  let lastError: unknown = null;

  for (const path of candidates) {
    try {
      const payload = await apiRequest<SpectateLinkResponse>(server.baseUrl, server.token, path, {
        method: "POST",
        body: JSON.stringify({
          session,
          read_only: true,
          ttl_seconds: DEFAULT_SPECTATE_TTL_SECONDS,
        }),
      });
      return parseSpectateLinkPayload(server.baseUrl, session, payload);
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (/^(404|405|501)\b/.test(message)) {
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    throw lastError;
  }
  throw new Error("No compatible spectate endpoint was found on this server.");
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
  const [shareConfig, setShareConfig] = useState<{
    title: string;
    link: string;
    heading?: string;
    description?: string;
    shareButtonLabel?: string;
  } | null>(null);
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
  const crossServerWatchRulesRef = useRef<Record<string, Record<string, WatchRule>>>({});
  const lastActivityAtRef = useRef<number>(Date.now());

  const setReady = useCallback((text: string = "Ready") => {
    setStatus({ text, error: false });
  }, []);

  const setError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ text: message, error: true });
  }, []);

  const markActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);

  const { loading: onboardingLoading, completed: onboardingCompleted, completeOnboarding } = useOnboarding();
  const { loading: lockLoading, requireBiometric, unlocked, setRequireBiometric, unlock, lock } = useBiometricLock();
  const { loading: tutorialLoading, done: tutorialDone, finish: finishTutorial } = useTutorial(onboardingCompleted && unlocked);
  const {
    loading: teamLoading,
    busy: teamBusy,
    identity: teamIdentity,
    teamServers,
    teamMembers,
    teamInvites,
    fleetApprovals,
    teamSettings,
    teamUsage,
    error: teamAuthError,
    cloudDashboardUrl,
    hasPermission: hasTeamPermission,
    loginWithPassword: loginTeamWithPassword,
    loginWithSso: loginTeamWithSso,
    inviteMember: inviteTeamMember,
    revokeInvite: revokeTeamInvite,
    updateTeamSettings,
    updateMemberRole: updateTeamMemberRole,
    updateMemberServers: updateTeamMemberServers,
    requestFleetApproval,
    approveFleetApproval,
    denyFleetApproval,
    logout: logoutTeam,
    refreshTeamContext,
  } = useTeamAuth({
    enabled: unlocked,
    onError: setError,
  });
  const {
    loading: safetyLoading,
    requireDangerConfirm,
    managedByTeam: dangerConfirmManagedByTeam,
    setRequireDangerConfirm,
  } = useSafetyPolicy({ enforcedDangerConfirm: teamSettings.enforceDangerConfirm });
  const { permissionStatus, requestPermission, notify } = useNotifications();
  const {
    available: rcAvailable,
    isPro,
    subscriptionTier,
    proPriceLabel,
    teamPriceLabel,
    enterprisePriceLabel,
    teamSeatCount,
    enterpriseSeatCount,
    purchasePro,
    purchaseTeam,
    purchaseEnterprise,
    restore,
  } = useRevenueCat();
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
    activeServer: selectedServer,
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
  } = useServers({ onError: setError, enabled: unlocked });
  const localTeamServerSignature = useMemo(() => buildTeamServerSignature(servers), [servers]);
  const cloudTeamServerSignature = useMemo(() => buildTeamServerSignature(teamServers), [teamServers]);

  useEffect(() => {
    if (!unlocked) {
      return;
    }
    if (localTeamServerSignature === cloudTeamServerSignature) {
      return;
    }
    void replaceTeamServers(teamServers).catch((error) => {
      setError(error);
    });
  }, [cloudTeamServerSignature, localTeamServerSignature, replaceTeamServers, setError, teamServers, unlocked]);

  const { brokeredServers } = useTokenBroker({
    identity: teamIdentity,
    servers,
    enabled: unlocked,
    onError: setError,
  });
  const {
    record: recordAuditEvent,
    pendingCount: pendingAuditEvents,
    lastSyncAt: auditLastSyncAt,
    syncNow: syncAuditNow,
    exportSnapshot: exportAuditSnapshot,
  } = useAuditLog({
    identity: teamIdentity,
    enabled: unlocked,
    onError: setError,
  });

  const { shellRunWaitMs, parsedShellRunWaitMs, setShellRunWaitMsInput } = useShellRunWait(activeServerId);
  const pool = useConnectionPool({
    servers: brokeredServers,
    enabled: unlocked,
    initialFocusedServerId: activeServerId,
    shellRunWaitMs: parsedShellRunWaitMs,
    onError: setError,
  });
  const {
    connections: poolConnections,
    lifecyclePaused: poolLifecyclePaused,
    focusedServerId: poolFocusedServerId,
    focusedConnection: poolFocusedConnection,
    setFocusedServerId: setPoolFocusedServerId,
    reconnectServer: reconnectPoolServer,
    reconnectServers: reconnectPoolServers,
    refreshSessions: refreshPoolSessions,
    refreshAll: refreshPoolAll,
    createSession: createPoolSession,
    createLocalAiSession: createPoolLocalAiSession,
    sendCommand: sendPoolCommand,
    sendControlChar: sendPoolControlChar,
    stopSession: stopPoolSession,
    openOnMac: openPoolOnMac,
    toggleSessionVisible: togglePoolSessionVisible,
    removeOpenSession: removePoolOpenSession,
    setDrafts: setPoolDrafts,
    setTails: setPoolTails,
    setSessionMode: setPoolSessionMode,
    fetchTail: fetchPoolTail,
    closeStream: closePoolStream,
    connectAll: connectPoolAll,
    disconnectAll: disconnectPoolAll,
    allConnectedServers,
    totalActiveStreams,
  } = pool;

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    if (poolFocusedServerId === activeServerId) {
      return;
    }
    setPoolFocusedServerId(activeServerId);
  }, [activeServerId, poolFocusedServerId, setPoolFocusedServerId]);

  const focusedServerId = poolFocusedServerId ?? activeServerId ?? null;
  const focusedConnection = useServerConnection(pool, focusedServerId) ?? poolFocusedConnection;
  const activeServer = focusedConnection?.server ?? selectedServer ?? null;
  const connected = focusedConnection?.connected ?? Boolean(activeServer && normalizeBaseUrl(activeServer.baseUrl) && activeServer.token.trim());
  const defaultCapabilities = useMemo(
    () => ({
      terminal: false,
      tmux: false,
      codex: false,
      files: false,
      shellRun: false,
      macAttach: false,
      stream: false,
      sysStats: false,
      processes: false,
      collaboration: false,
      spectate: false,
    }),
    []
  );
  const defaultHealth = useMemo(
    () => ({
      lastPingAt: null,
      latencyMs: null,
      activeStreams: 0,
      openSessions: 0,
    }),
    []
  );
  const capabilities = focusedConnection?.capabilities ?? defaultCapabilities;
  const terminalApiBasePath = focusedConnection?.terminalApiBasePath ?? "/tmux";
  const capabilitiesLoading = focusedConnection?.capabilitiesLoading ?? false;
  const allSessions = focusedConnection?.allSessions ?? [];
  const localAiSessions = focusedConnection?.localAiSessions ?? [];
  const openSessions = focusedConnection?.openSessions ?? [];
  const tails = focusedConnection?.tails ?? {};
  const drafts = focusedConnection?.drafts ?? {};
  const sendBusy = focusedConnection?.sendBusy ?? {};
  const sendModes = focusedConnection?.sendModes ?? {};
  const streamLive = focusedConnection?.streamLive ?? {};
  const connectionMeta = focusedConnection?.connectionMeta ?? {};
  const health = focusedConnection?.health ?? defaultHealth;
  const supportedFeatures = useMemo(() => {
    const features: string[] = [];
    if (activeServer?.terminalBackend) {
      features.push(`backend:${activeServer.terminalBackend}`);
    }
    if (capabilities.terminal) {
      features.push(`terminal:${terminalApiBasePath === "/terminal" ? "terminal" : "tmux"}`);
    }
    if (capabilities.codex) {
      features.push("codex");
    }
    if (capabilities.files) {
      features.push("files");
    }
    if (capabilities.shellRun) {
      features.push("shell-run");
    }
    if (capabilities.macAttach) {
      features.push("mac-attach");
    }
    if (capabilities.stream) {
      features.push("stream");
    }
    if (capabilities.sysStats) {
      features.push("sys-stats");
    }
    if (capabilities.processes) {
      features.push("proc");
    }
    if (capabilities.collaboration) {
      features.push("collab");
    }
    if (capabilities.spectate) {
      features.push("spectate");
    }
    return features.join(", ");
  }, [activeServer?.terminalBackend, capabilities, terminalApiBasePath]);
  const unreadServers = useUnreadServers({
    connections: poolConnections,
    focusedServerId,
  });
  const teamSessionTimeoutMs = useMemo(
    () => resolveSessionTimeoutMs(teamSettings.sessionTimeoutMinutes),
    [teamSettings.sessionTimeoutMinutes]
  );

  const assertCommandAllowed = useCallback(
    (command: string, context: string) => {
      const blockedPattern = findBlockedCommandPattern(command, teamSettings.commandBlocklist);
      if (!blockedPattern) {
        return;
      }
      recordAuditEvent({
        action: "command_dangerous_denied",
        serverId: focusedServerId || "",
        serverName: activeServer?.name || "",
        session: "",
        detail: `${context}: blocked by pattern ${blockedPattern}`.slice(0, 400),
        approved: false,
      });
      throw new Error(`Command blocked by team policy (${blockedPattern}).`);
    },
    [activeServer?.name, focusedServerId, recordAuditEvent, teamSettings.commandBlocklist]
  );

  const assertServerWritable = useCallback(
    (serverId: string, context: string) => {
      const server =
        poolConnections.get(serverId)?.server ||
        brokeredServers.find((entry) => entry.id === serverId) ||
        servers.find((entry) => entry.id === serverId) ||
        null;
      if (!server || server.source !== "team" || server.permissionLevel !== "viewer") {
        return;
      }
      recordAuditEvent({
        action: "command_dangerous_denied",
        serverId,
        serverName: server.name,
        session: "",
        detail: `${context}: denied for viewer role`,
        approved: false,
      });
      throw new Error(`${server.name} is read-only for your viewer role.`);
    },
    [brokeredServers, poolConnections, recordAuditEvent, servers]
  );

  const requestApprovalPrompt = useCallback(async (command: string, context: string) => {
    return await new Promise<boolean>((resolve) => {
      dangerResolverRef.current = resolve;
      setDangerPrompt({
        visible: true,
        command,
        context,
      });
    });
  }, []);

  const requestDangerApproval = useCallback(
    async (
      command: string,
      context: string,
      options: {
        forceConfirm?: boolean;
        skipFocusedServerCheck?: boolean;
      } = {}
    ) => {
      if (!options.skipFocusedServerCheck && focusedServerId) {
        assertServerWritable(focusedServerId, context);
      }
      assertCommandAllowed(command, context);
      const shouldConfirm = options.forceConfirm || (requireDangerConfirm && isDangerousShellCommand(command));
      if (!shouldConfirm) {
        return true;
      }
      return await requestApprovalPrompt(command, context);
    },
    [assertCommandAllowed, assertServerWritable, focusedServerId, requestApprovalPrompt, requireDangerConfirm]
  );

  const focusServer = useCallback(
    (serverId: string) => {
      markActivity();
      setPoolFocusedServerId(serverId);
      void useServer(serverId).catch((error) => {
        setError(error);
      });
    },
    [markActivity, setError, setPoolFocusedServerId, useServer]
  );

  const editServer = useCallback(
    (serverId: string) => {
      const target = servers.find((server) => server.id === serverId);
      if (target) {
        beginEditServer(target);
      } else {
        beginCreateServer();
      }
      setRoute("servers");
    },
    [beginCreateServer, beginEditServer, servers, setRoute]
  );

  const refreshCapabilities = useCallback(
    async (_force: boolean = false) => {
      if (!focusedServerId) {
        return;
      }
      await reconnectPoolServer(focusedServerId, true);
    },
    [focusedServerId, reconnectPoolServer]
  );

  const reconnectServer = useCallback(
    (serverId: string) => {
      void reconnectPoolServer(serverId, true).catch((error) => {
        setError(error);
      });
    },
    [reconnectPoolServer, setError]
  );

  const reconnectServers = useCallback(
    (serverIds: string[]) => {
      void reconnectPoolServers(serverIds, true).catch((error) => {
        setError(error);
      });
    },
    [reconnectPoolServers, setError]
  );

  const reconnectAllServers = useCallback(() => {
    const serverIds = allConnectedServers.map((server) => server.id);
    if (serverIds.length === 0) {
      return;
    }
    void reconnectPoolServers(serverIds, true).catch((error) => {
      setError(error);
    });
  }, [allConnectedServers, reconnectPoolServers, setError]);

  const refreshAllServers = useCallback(async () => {
    await refreshPoolAll();
  }, [refreshPoolAll]);

  const connectAllServers = useCallback(() => {
    connectPoolAll();
  }, [connectPoolAll]);

  const disconnectAllServers = useCallback(() => {
    disconnectPoolAll();
  }, [disconnectPoolAll]);

  const [startCwd, setStartCwd] = useState<string>(DEFAULT_CWD);
  const [startPrompt, setStartPrompt] = useState<string>("");
  const [startOpenOnMac, setStartOpenOnMac] = useState<boolean>(true);
  const [startKind, setStartKind] = useState<TerminalSendMode>("ai");
  const [focusedSession, setFocusedSession] = useState<string | null>(null);

  useEffect(() => {
    if (!activeServer) {
      return;
    }
    setStartCwd(activeServer.defaultCwd || DEFAULT_CWD);
  }, [activeServer?.defaultCwd, focusedServerId]);

  const setTails = useCallback(
    (updater: React.SetStateAction<Record<string, string>>) => {
      if (!focusedServerId) {
        return;
      }
      setPoolTails(focusedServerId, updater);
    },
    [focusedServerId, setPoolTails]
  );

  const setDrafts = useCallback(
    (updater: React.SetStateAction<Record<string, string>>) => {
      if (!focusedServerId) {
        return;
      }
      setPoolDrafts(focusedServerId, updater);
    },
    [focusedServerId, setPoolDrafts]
  );

  const refreshSessions = useCallback(async () => {
    if (!focusedServerId) {
      throw new Error("Select a server first.");
    }
    await refreshPoolSessions(focusedServerId);
  }, [focusedServerId, refreshPoolSessions]);

  const toggleSessionVisible = useCallback(
    (session: string) => {
      if (!focusedServerId) {
        return;
      }
      togglePoolSessionVisible(focusedServerId, session);
    },
    [focusedServerId, togglePoolSessionVisible]
  );

  const removeOpenSession = useCallback(
    (session: string) => {
      if (!focusedServerId) {
        return;
      }
      removePoolOpenSession(focusedServerId, session);
      setFocusedSession((current) => (current === session ? null : current));
    },
    [focusedServerId, removePoolOpenSession]
  );

  const setSessionMode = useCallback(
    (session: string, mode: TerminalSendMode) => {
      if (!focusedServerId) {
        return;
      }
      setPoolSessionMode(focusedServerId, session, mode);
    },
    [focusedServerId, setPoolSessionMode]
  );

  const createLocalAiSession = useCallback(
    (initialPrompt: string = "") => {
      if (!focusedServerId) {
        throw new Error("Connect to a server first.");
      }
      return createPoolLocalAiSession(focusedServerId, initialPrompt);
    },
    [createPoolLocalAiSession, focusedServerId]
  );

  const handleStartSession = useCallback(async () => {
    if (!focusedServerId || !activeServer || !connected) {
      throw new Error("Connect to a server first.");
    }

    markActivity();
    assertServerWritable(focusedServerId, "Create session");
    const trimmedPrompt = startPrompt.trim();
    const session = await createPoolSession(
      focusedServerId,
      startCwd,
      startKind,
      trimmedPrompt,
      startOpenOnMac
    );
    recordAuditEvent({
      action: "session_created",
      serverId: focusedServerId,
      serverName: activeServer.name,
      session,
      detail: `kind=${startKind}`,
    });
    if (trimmedPrompt) {
      setStartPrompt("");
    }
    return session;
  }, [
    activeServer,
    connected,
    createPoolSession,
    focusedServerId,
    assertServerWritable,
    markActivity,
    recordAuditEvent,
    startCwd,
    startKind,
    startOpenOnMac,
    startPrompt,
  ]);

  const createSessionForServer = useCallback(
    async (serverId: string, kind: "ai" | "shell", prompt: string = ""): Promise<string> => {
      const targetConnection = poolConnections.get(serverId);
      if (!targetConnection || !targetConnection.connected) {
        throw new Error("Target server is disconnected.");
      }
      markActivity();
      assertServerWritable(serverId, "Create session");
      return await createPoolSession(
        serverId,
        targetConnection.server.defaultCwd || DEFAULT_CWD,
        kind,
        prompt.trim(),
        false
      );
    },
    [assertServerWritable, createPoolSession, markActivity, poolConnections]
  );

  const sendCommand = useCallback(
    async (session: string, command: string, mode: TerminalSendMode, clearDraft: boolean = false) => {
      if (!focusedServerId) {
        throw new Error("Connect to a server first.");
      }
      markActivity();
      assertServerWritable(focusedServerId, "Send command");
      assertCommandAllowed(command, `Send to ${session}`);
      await sendPoolCommand(focusedServerId, session, command, mode, clearDraft);
      recordAuditEvent({
        action: "command_sent",
        serverId: focusedServerId,
        serverName: activeServer?.name || "",
        session,
        detail: `${mode}:${command.slice(0, 400)}`,
      });
    },
    [
      activeServer?.name,
      assertCommandAllowed,
      assertServerWritable,
      focusedServerId,
      markActivity,
      recordAuditEvent,
      sendPoolCommand,
    ]
  );

  const handleSend = useCallback(
    async (session: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      const currentDraft = (drafts[session] || "").trim();
      if (!currentDraft) {
        return "";
      }

      const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
      await sendCommand(session, currentDraft, mode, true);
      return currentDraft;
    },
    [activeServer, connected, drafts, sendCommand, sendModes]
  );

  const handleStop = useCallback(
    async (session: string) => {
      if (!focusedServerId) {
        throw new Error("Connect to a server first.");
      }
      assertServerWritable(focusedServerId, "Stop session");
      await stopPoolSession(focusedServerId, session);
    },
    [assertServerWritable, focusedServerId, stopPoolSession]
  );

  const sendControlChar = useCallback(
    async (session: string, controlChar: string) => {
      if (!focusedServerId) {
        throw new Error("Connect to a server first.");
      }
      markActivity();
      assertServerWritable(focusedServerId, "Send control");
      await sendPoolControlChar(focusedServerId, session, controlChar);
      recordAuditEvent({
        action: "command_sent",
        serverId: focusedServerId,
        serverName: activeServer?.name || "",
        session,
        detail: `control:${controlChar}`,
      });
    },
    [
      activeServer?.name,
      assertServerWritable,
      focusedServerId,
      markActivity,
      recordAuditEvent,
      sendPoolControlChar,
    ]
  );

  const handleOpenOnMac = useCallback(
    async (session: string) => {
      if (!focusedServerId) {
        throw new Error("Connect to a server first.");
      }
      await openPoolOnMac(focusedServerId, session);
    },
    [focusedServerId, openPoolOnMac]
  );

  const openServerSessionOnMac = useCallback(
    async (serverId: string, session: string) => {
      await openPoolOnMac(serverId, session);
    },
    [openPoolOnMac]
  );

  const fetchTail = useCallback(
    async (session: string, showErrors: boolean) => {
      if (!focusedServerId) {
        return;
      }
      await fetchPoolTail(focusedServerId, session, showErrors);
    },
    [focusedServerId, fetchPoolTail]
  );

  const closeStream = useCallback(
    (session: string) => {
      if (!focusedServerId) {
        return;
      }
      closePoolStream(focusedServerId, session);
    },
    [closePoolStream, focusedServerId]
  );

  const { analyticsEnabled, analyticsAnonId, setAnalyticsEnabled, track } = useAnalytics({
    activeServer,
    connected,
  });
  const { myReferralCode, claimedReferralCode, buildReferralLink, claimReferralCode, extractReferralCodeFromUrl } =
    useReferrals();
  const { sharedTemplates, exportTemplatesFromServers, importTemplates, deleteTemplate } = useSharedProfiles();

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

  const remoteOpenSessions = useMemo(
    () => openSessions.filter((session) => !localAiSessions.includes(session)),
    [localAiSessions, openSessions]
  );

  const scopedServerId = focusedServerId ?? activeServerId;
  const { commandHistory, historyCount, addCommand, recallPrev, recallNext } = useCommandHistory(scopedServerId);
  const { sessionAliases, setAliasForSession, removeMissingAliases } = useSessionAliases(scopedServerId);
  const { sessionTags, allTags, setTagsForSession, removeMissingSessions } = useSessionTags(scopedServerId);
  const { pinnedSessions, togglePinnedSession, removeMissingPins } = usePinnedSessions(scopedServerId);
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

  const filteredSnippets = useMemo(() => {
    return snippets.filter((snippet) => {
      if (!snippet.serverId) {
        return true;
      }
      return focusedServerId ? snippet.serverId === focusedServerId : false;
    });
  }, [focusedServerId, snippets]);

  useEffect(() => {
    if (servers.length === 0) {
      setFleetTargets([]);
      return;
    }

    setFleetTargets((prev) => {
      if (prev.length === 0 && focusedServerId) {
        return [focusedServerId];
      }
      const available = new Set(servers.map((server) => server.id));
      const filtered = prev.filter((id) => available.has(id));
      if (filtered.length > 0) {
        return filtered;
      }
      return focusedServerId ? [focusedServerId] : [servers[0].id];
    });
  }, [focusedServerId, servers]);

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

  const runFleetCommand = useCallback(async () => {
    const command = fleetCommand.trim();
    if (!command) {
      throw new Error("Fleet command is required.");
    }
    markActivity();

    const selectedServers = brokeredServers.filter((server) => fleetTargets.includes(server.id));
    if (selectedServers.length === 0) {
      throw new Error("Select at least one target server.");
    }
    selectedServers.forEach((server) => {
      assertServerWritable(server.id, "Fleet execution");
    });
    const targetLabel = `${selectedServers.length} target${selectedServers.length === 1 ? "" : "s"}`;

    if (teamSettings.requireFleetApproval && teamIdentity?.role !== "admin") {
      const matchingApproval = findApprovedFleetApproval(
        fleetApprovals,
        command,
        selectedServers.map((server) => server.id),
        teamIdentity?.userId
      );
      if (matchingApproval) {
        recordAuditEvent({
          action: "fleet_approval_consumed",
          serverId: "",
          serverName: "fleet",
          detail: `fleet_approval_consumed=${matchingApproval.id}`,
          approved: true,
        });
      } else {
        const pendingApproval = findPendingFleetApproval(
          fleetApprovals,
          command,
          selectedServers.map((server) => server.id),
          teamIdentity?.userId
        );
        if (pendingApproval) {
          throw new Error(`Fleet approval already pending (#${pendingApproval.id}).`);
        }
        const note = `targets=${selectedServers.map((server) => server.name).join(",")} cwd=${fleetCwd.trim() || DEFAULT_CWD}`;
        await requestFleetApproval({
          command,
          targets: selectedServers.map((server) => server.id),
          note,
        });
        recordAuditEvent({
          action: "fleet_approval_requested",
          serverId: "",
          serverName: "fleet",
          detail: `fleet_approval_requested ${targetLabel}`,
          approved: null,
        });
        throw new Error("Fleet approval requested. Run again after admin approval is granted.");
      }
    }

    const approved = await requestDangerApproval(
      command,
      teamSettings.requireFleetApproval ? `Fleet execution approval (${targetLabel})` : "Fleet command",
      {
        forceConfirm: Boolean(teamSettings.requireFleetApproval),
        skipFocusedServerCheck: true,
      }
    );
    if (!approved) {
      throw new Error("Fleet execution cancelled.");
    }

    const waitMs = Math.max(400, Math.min(Number.parseInt(fleetWaitMs, 10) || DEFAULT_FLEET_WAIT_MS, 120000));

    setFleetBusy(true);
    try {
      const settled = await Promise.all(
        selectedServers.map(async (server): Promise<FleetRunResult> => {
          const cwd = fleetCwd.trim() || server.defaultCwd || DEFAULT_CWD;
          const session = makeFleetSessionName();
          try {
            const terminalBasePath = await resolveFleetTerminalApiBasePath({
              server,
              connections: poolConnections,
              detectApiBasePath: detectTerminalApiBasePath,
            });

            await apiRequest(server.baseUrl, server.token, `${terminalBasePath}/session`, {
              method: "POST",
              body: JSON.stringify({ session, cwd }),
            });

            let output = "";
            let shellRunSucceeded = false;
            const tryShellRun = shouldAttemptFleetShellRun({ serverId: server.id, connections: poolConnections });
            if (tryShellRun) {
              try {
                const data = await apiRequest<{ output?: string }>(server.baseUrl, server.token, "/shell/run", {
                  method: "POST",
                  body: JSON.stringify({ session, command, wait_ms: waitMs, tail_lines: 280 }),
                });
                output = data.output || "";
                shellRunSucceeded = true;
              } catch (shellError) {
                if (!isFleetShellRunUnavailableError(shellError)) {
                  throw shellError;
                }
              }
            }

            if (!shellRunSucceeded) {
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
      const okCount = settled.filter((entry) => entry.ok).length;
      recordAuditEvent({
        action: "fleet_executed",
        serverId: "",
        serverName: "fleet",
        detail: `targets=${selectedServers.length} ok=${okCount} command=${command.slice(0, 240)}`,
      });
    } finally {
      setFleetBusy(false);
    }
  }, [
    assertServerWritable,
    brokeredServers,
    fleetCommand,
    fleetCwd,
    fleetTargets,
    fleetWaitMs,
    markActivity,
    poolConnections,
    recordAuditEvent,
    requestDangerApproval,
    requestFleetApproval,
    fleetApprovals,
    teamIdentity?.role,
    teamIdentity?.userId,
    teamSettings.requireFleetApproval,
  ]);

  const sendViaExternalLlmToServer = useCallback(
    async (serverId: string, session: string, prompt: string) => {
      const cleanPrompt = prompt.trim();
      if (!cleanPrompt) {
        return "";
      }

      if (!activeProfile) {
        throw new Error("No active LLM profile selected. Configure one in the LLMs tab.");
      }

      setPoolDrafts(serverId, (prev) => ({ ...prev, [session]: "" }));
      const reply = await sendPrompt(activeProfile, cleanPrompt);
      const nextBlock = `\\n\\n[LLM Prompt]\\n${cleanPrompt}\\n\\n[LLM Reply]\\n${reply}\\n`;
      setPoolTails(serverId, (prev) => ({ ...prev, [session]: `${prev[session] || ""}${nextBlock}` }));
      return cleanPrompt;
    },
    [activeProfile, sendPrompt, setPoolDrafts, setPoolTails]
  );

  const sendViaExternalLlm = useCallback(
    async (session: string, prompt: string) => {
      if (!focusedServerId) {
        throw new Error("Select a server before sending an external AI prompt.");
      }
      return await sendViaExternalLlmToServer(focusedServerId, session, prompt);
    },
    [focusedServerId, sendViaExternalLlmToServer]
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
    activeServerId: scopedServerId,
    activeServerName: activeServer?.name || null,
    allSessions,
    tails,
    isPro,
    notify,
  });

  useEffect(() => {
    let cancelled = false;

    const loadRules = async () => {
      const nextByServer: Record<string, Record<string, WatchRule>> = {};
      const validIds = new Set(servers.map((server) => server.id));

      const entries = await Promise.all(
        servers.map(async (server) => {
          try {
            const raw = await SecureStore.getItemAsync(`${STORAGE_WATCH_RULES_PREFIX}.${server.id}`);
            return [server.id, raw] as const;
          } catch {
            return [server.id, null] as const;
          }
        })
      );

      if (cancelled) {
        return;
      }

      entries.forEach(([serverId, raw]) => {
        if (!raw) {
          nextByServer[serverId] = {};
          return;
        }
        try {
          const parsed = JSON.parse(raw) as Record<string, WatchRule>;
          nextByServer[serverId] = parsed && typeof parsed === "object" ? parsed : {};
        } catch {
          nextByServer[serverId] = {};
        }
      });

      Object.keys(crossServerWatchRulesRef.current).forEach((serverId) => {
        if (!validIds.has(serverId)) {
          delete crossServerWatchRulesRef.current[serverId];
        }
      });
      crossServerWatchRulesRef.current = {
        ...crossServerWatchRulesRef.current,
        ...nextByServer,
      };
    };

    void loadRules();
    return () => {
      cancelled = true;
    };
  }, [servers]);

  useEffect(() => {
    if (!scopedServerId) {
      return;
    }
    crossServerWatchRulesRef.current[scopedServerId] = watchRules;
  }, [scopedServerId, watchRules]);

  useEffect(() => {
    const result = evaluateCrossServerWatchAlerts({
      isPro,
      focusedServerId,
      servers,
      connections: poolConnections,
      rulesByServer: crossServerWatchRulesRef.current,
    });

    if (result.changedServerIds.length === 0) {
      return;
    }

    result.notifications.forEach((item) => {
      void notify(item.title, item.body);
    });

    result.changedServerIds.forEach((serverId) => {
      const nextRules = result.nextRulesByServer[serverId];
      if (!nextRules) {
        return;
      }
      crossServerWatchRulesRef.current[serverId] = nextRules;
      void SecureStore.setItemAsync(`${STORAGE_WATCH_RULES_PREFIX}.${serverId}`, JSON.stringify(nextRules)).catch(
        () => {}
      );
    });
  }, [focusedServerId, isPro, notify, poolConnections, servers]);

  const { recordings, toggleRecording, deleteRecording } = useSessionRecordings({
    allSessions,
    tails,
    onToggle: () => {
      void Haptics.selectionAsync();
    },
  });
  const teamSessionRecordingRequired = teamSettings.requireSessionRecording === true;

  const toggleRecordingWithPolicy = useCallback(
    (session: string) => {
      if (teamSessionRecordingRequired && recordings[session]?.active) {
        setStatus({
          text: "Session recording is managed by team admin and cannot be stopped.",
          error: true,
        });
        return;
      }
      toggleRecording(session);
    },
    [recordings, setStatus, teamSessionRecordingRequired, toggleRecording]
  );

  useEffect(() => {
    if (!teamSessionRecordingRequired) {
      return;
    }
    allSessions.forEach((session) => {
      if (recordings[session]?.active) {
        return;
      }
      toggleRecording(session);
    });
  }, [allSessions, recordings, teamSessionRecordingRequired, toggleRecording]);

  const { processes, processesBusy, refreshProcesses } = useProcessManager({
    activeServer,
    connected,
    enabled: capabilities.processes,
  });

  const { sessionPresence, sessionReadOnly, refreshSessionPresence, setSessionReadOnlyValue } = useCollaboration({
    activeServer,
    activeServerId: scopedServerId,
    connected,
    enabled: capabilities.collaboration,
    terminalApiBasePath,
    remoteOpenSessions,
    focusedSession,
    allSessions,
    isLocalSession,
  });

  const { commandQueue, queueSessionCommand, flushSessionQueue, removeQueuedCommand } = useCommandQueue({
    activeServerId: scopedServerId,
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

  const sendTextToServerSession = useCallback(
    async (serverId: string, session: string, text: string, mode: TerminalSendMode, clearDraft: boolean = false) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }

      const targetConnection = poolConnections.get(serverId);
      if (!targetConnection) {
        throw new Error("Selected server is not available.");
      }

      const focusedTarget = scopedServerId === serverId;
      const localSession = targetConnection.localAiSessions.includes(session);

      if (focusedTarget && sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only to send commands.`);
      }

      const routeToExternal = mode === "ai" && (localSession || !targetConnection.capabilities.codex);
      if (routeToExternal) {
        const sent = await sendViaExternalLlmToServer(serverId, session, trimmed);
        if (sent) {
          if (focusedTarget) {
            await addCommand(session, sent);
          }
        }
        return;
      }

      if (!targetConnection.connected && !localSession) {
        if (focusedTarget) {
          queueSessionCommand(session, trimmed, mode);
          return;
        }
        throw new Error(`${targetConnection.server.name} is disconnected. Reconnect before sending commands.`);
      }

      if (clearDraft) {
        setPoolDrafts(serverId, (prev) => ({ ...prev, [session]: "" }));
      }

      await sendPoolCommand(serverId, session, trimmed, mode, false);
      if (focusedTarget) {
        await addCommand(session, trimmed);
      }
    },
    [addCommand, poolConnections, queueSessionCommand, scopedServerId, sendPoolCommand, sendViaExternalLlmToServer, sessionReadOnly, setPoolDrafts]
  );

  const sendTextToSession = useCallback(
    async (session: string, text: string, mode: TerminalSendMode) => {
      if (!focusedServerId) {
        throw new Error("Select a server before sending commands.");
      }
      await sendTextToServerSession(focusedServerId, session, text, mode, false);
    },
    [focusedServerId, sendTextToServerSession]
  );

  const setServerSessionDraft = useCallback(
    (serverId: string, session: string, value: string) => {
      setPoolDrafts(serverId, (prev) => ({ ...prev, [session]: value }));
    },
    [setPoolDrafts]
  );

  const clearServerSessionDraft = useCallback(
    (serverId: string, session: string) => {
      setPoolDrafts(serverId, (prev) => ({ ...prev, [session]: "" }));
    },
    [setPoolDrafts]
  );

  const sendServerSessionDraft = useCallback(
    async (serverId: string, session: string) => {
      const targetConnection = poolConnections.get(serverId);
      if (!targetConnection) {
        throw new Error("Selected server is not available.");
      }

      const draft = (targetConnection.drafts[session] || "").trim();
      if (!draft) {
        return;
      }

      const mode = targetConnection.sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
      await sendTextToServerSession(serverId, session, draft, mode, true);
    },
    [poolConnections, sendTextToServerSession]
  );

  const sendServerSessionCommand = useCallback(
    async (serverId: string, session: string, command: string, mode?: TerminalSendMode) => {
      const targetConnection = poolConnections.get(serverId);
      if (!targetConnection) {
        throw new Error("Selected server is not available.");
      }

      const trimmed = command.trim();
      if (!trimmed) {
        return;
      }

      const resolvedMode = mode || targetConnection.sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
      await sendTextToServerSession(serverId, session, trimmed, resolvedMode, true);
    },
    [poolConnections, sendTextToServerSession]
  );

  const sendServerSessionControlChar = useCallback(
    async (serverId: string, session: string, char: string) => {
      const targetConnection = poolConnections.get(serverId);
      if (!targetConnection || !targetConnection.connected) {
        throw new Error("Target server is disconnected.");
      }
      if (targetConnection.localAiSessions.includes(session)) {
        throw new Error("Local LLM sessions do not support terminal control characters.");
      }
      if (scopedServerId === serverId && sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only before sending control keys.`);
      }
      await sendPoolControlChar(serverId, session, char);
    },
    [poolConnections, scopedServerId, sendPoolControlChar, sessionReadOnly]
  );

  const agentRuntimeServerId = focusedServerId;
  type AgentServerAction =
    | { kind: "approve" }
    | { kind: "deny" }
    | { kind: "create"; name: string }
    | { kind: "remove"; name: string }
    | { kind: "set_status"; name: string; status: "idle" | "monitoring" | "executing" | "waiting_approval" }
    | { kind: "set_goal"; name: string; goal: string }
    | { kind: "queue_command"; name: string; command: string };
  type PendingAgentServerAction = {
    serverId: string;
    action: AgentServerAction;
    resolve: (agentIds: string[]) => void;
    reject: (error: unknown) => void;
  };
  const pendingAgentServerActionsRef = useRef<PendingAgentServerAction[]>([]);
  const dispatchFocusedServerAgentCommand = useCallback(
    (session: string, command: string) => {
      if (!agentRuntimeServerId) {
        return;
      }
      void sendServerSessionCommand(agentRuntimeServerId, session, command, "shell").catch((error) => {
        setError(error);
      });
    },
    [agentRuntimeServerId, sendServerSessionCommand, setError]
  );
  const {
    agents: focusedServerAgents,
    addRuntimeAgent: addFocusedServerRuntimeAgent,
    removeRuntimeAgent: removeFocusedServerRuntimeAgent,
    setRuntimeAgentStatus: setFocusedServerRuntimeAgentStatus,
    setRuntimeAgentGoal: setFocusedServerRuntimeAgentGoal,
    requestAgentApproval: requestFocusedServerAgentApproval,
    approveReadyApprovals: approveReadyAgentsForFocusedServer,
    denyAllPendingApprovals: denyAllPendingAgentsForFocusedServer,
  } = useNovaAgentRuntime({
    serverId: agentRuntimeServerId,
    onDispatchCommand: dispatchFocusedServerAgentCommand,
  });

  const executeFocusedAgentServerAction = useCallback(
    (action: AgentServerAction): string[] => {
      if (action.kind === "approve") {
        const approved = approveReadyAgentsForFocusedServer();
        return Array.isArray(approved) ? approved : [];
      }
      if (action.kind === "deny") {
        const denied = denyAllPendingAgentsForFocusedServer();
        return Array.isArray(denied) ? denied : [];
      }
      if (action.kind === "create") {
        const name = action.name.trim();
        if (!name) {
          return [];
        }
        if (hasExactAgentName(focusedServerAgents, name)) {
          return [];
        }
        const created = addFocusedServerRuntimeAgent(name);
        return created ? [created.agentId] : [];
      }
      if (action.kind === "remove") {
        const name = action.name.trim();
        if (!name) {
          return [];
        }
        const matchingAgentIds = findAgentIdsByName(focusedServerAgents, name);
        matchingAgentIds.forEach((agentId) => {
          removeFocusedServerRuntimeAgent(agentId);
        });
        return matchingAgentIds;
      }
      if (action.kind === "set_status") {
        const name = action.name.trim();
        if (!name) {
          return [];
        }
        const matchingAgentIds = findAgentIdsByName(focusedServerAgents, name);
        matchingAgentIds.forEach((agentId) => {
          setFocusedServerRuntimeAgentStatus(agentId, action.status);
        });
        return matchingAgentIds;
      }
      if (action.kind === "set_goal") {
        const name = action.name.trim();
        const goal = action.goal.trim();
        if (!name || !goal) {
          return [];
        }
        const matchingAgentIds = findAgentIdsByName(focusedServerAgents, name);
        matchingAgentIds.forEach((agentId) => {
          setFocusedServerRuntimeAgentGoal(agentId, goal);
        });
        return matchingAgentIds;
      }
      const name = action.name.trim();
      const command = action.command.trim();
      if (!name || !command) {
        return [];
      }
      const matchingAgentIds = findAgentIdsByName(focusedServerAgents, name);
      const resolvedAgentIds =
        matchingAgentIds.length > 0
          ? matchingAgentIds
          : (() => {
              const created = addFocusedServerRuntimeAgent(name);
              return created ? [created.agentId] : [];
            })();
      if (resolvedAgentIds.length === 0) {
        return [];
      }
      const agentRuntimeConnection = agentRuntimeServerId ? poolConnections.get(agentRuntimeServerId) : null;
      const sessionCandidates = agentRuntimeConnection
        ? [...agentRuntimeConnection.openSessions, ...agentRuntimeConnection.allSessions]
        : [];
      const remoteSession = sessionCandidates.find((session) => !(agentRuntimeConnection?.localAiSessions || []).includes(session));
      if (!remoteSession) {
        return [];
      }

      const queuedAgentIds: string[] = [];
      resolvedAgentIds.forEach((agentId) => {
        setFocusedServerRuntimeAgentGoal(agentId, command);
        const queued = requestFocusedServerAgentApproval(agentId, {
          command,
          session: remoteSession,
          summary: `Queued by voice route for ${remoteSession}`,
        });
        if (queued) {
          queuedAgentIds.push(agentId);
        }
      });
      return queuedAgentIds;
    },
    [
      agentRuntimeServerId,
      addFocusedServerRuntimeAgent,
      approveReadyAgentsForFocusedServer,
      denyAllPendingAgentsForFocusedServer,
      focusedServerAgents,
      poolConnections,
      requestFocusedServerAgentApproval,
      removeFocusedServerRuntimeAgent,
      setFocusedServerRuntimeAgentStatus,
      setFocusedServerRuntimeAgentGoal,
    ]
  );

  const processPendingAgentServerActions = useCallback(() => {
    while (pendingAgentServerActionsRef.current.length > 0) {
      const current = pendingAgentServerActionsRef.current[0];
      if (!servers.some((server) => server.id === current.serverId)) {
        pendingAgentServerActionsRef.current.shift();
        current.reject(new Error("Target server is no longer available."));
        continue;
      }

      if (!focusedServerId || focusedServerId !== current.serverId) {
        focusServer(current.serverId);
        return;
      }

      pendingAgentServerActionsRef.current.shift();
      try {
        current.resolve(executeFocusedAgentServerAction(current.action));
      } catch (error) {
        current.reject(error);
      }
    }
  }, [executeFocusedAgentServerAction, focusServer, focusedServerId, servers]);

  useEffect(() => {
    processPendingAgentServerActions();
  }, [focusedServerId, processPendingAgentServerActions]);

  useEffect(() => {
    return () => {
      const error = new Error("Agent action was cancelled.");
      while (pendingAgentServerActionsRef.current.length > 0) {
        pendingAgentServerActionsRef.current.shift()?.reject(error);
      }
    };
  }, []);

  const runAgentServerAction = useCallback(
    async (serverId: string, action: AgentServerAction): Promise<string[]> => {
      const targetServerId = serverId.trim();
      if (!targetServerId) {
        return [];
      }
      if (!servers.some((server) => server.id === targetServerId)) {
        throw new Error("Target server is not available.");
      }
      if (focusedServerId === targetServerId) {
        return executeFocusedAgentServerAction(action);
      }

      return await new Promise<string[]>((resolve, reject) => {
        pendingAgentServerActionsRef.current.push({
          serverId: targetServerId,
          action,
          resolve,
          reject,
        });
        processPendingAgentServerActions();
      });
    },
    [executeFocusedAgentServerAction, focusedServerId, processPendingAgentServerActions, servers]
  );

  const approveReadyAgentsForServer = useCallback(
    async (serverId: string): Promise<string[]> => await runAgentServerAction(serverId, { kind: "approve" }),
    [runAgentServerAction]
  );

  const denyAllPendingAgentsForServer = useCallback(
    async (serverId: string): Promise<string[]> => await runAgentServerAction(serverId, { kind: "deny" }),
    [runAgentServerAction]
  );

  const createAgentForServer = useCallback(
    async (serverId: string, name: string): Promise<string[]> => await runAgentServerAction(serverId, { kind: "create", name }),
    [runAgentServerAction]
  );

  const setAgentStatusForServer = useCallback(
    async (
      serverId: string,
      name: string,
      status: "idle" | "monitoring" | "executing" | "waiting_approval"
    ): Promise<string[]> => await runAgentServerAction(serverId, { kind: "set_status", name, status }),
    [runAgentServerAction]
  );

  const setAgentGoalForServer = useCallback(
    async (serverId: string, name: string, goal: string): Promise<string[]> =>
      await runAgentServerAction(serverId, { kind: "set_goal", name, goal }),
    [runAgentServerAction]
  );

  const removeAgentForServer = useCallback(
    async (serverId: string, name: string): Promise<string[]> =>
      await runAgentServerAction(serverId, { kind: "remove", name }),
    [runAgentServerAction]
  );

  const queueAgentCommandForServer = useCallback(
    async (serverId: string, name: string, command: string): Promise<string[]> =>
      await runAgentServerAction(serverId, { kind: "queue_command", name, command }),
    [runAgentServerAction]
  );

  const approveReadyAgentsForServers = useCallback(
    async (serverIds: string[]): Promise<string[]> => {
      const approved: string[] = [];
      for (const serverId of uniqueServerIds(serverIds)) {
        const next = await approveReadyAgentsForServer(serverId);
        approved.push(...next);
      }
      return approved;
    },
    [approveReadyAgentsForServer]
  );

  const denyAllPendingAgentsForServers = useCallback(
    async (serverIds: string[]): Promise<string[]> => {
      const denied: string[] = [];
      for (const serverId of uniqueServerIds(serverIds)) {
        const next = await denyAllPendingAgentsForServer(serverId);
        denied.push(...next);
      }
      return denied;
    },
    [denyAllPendingAgentsForServer]
  );

  const createAgentForServers = useCallback(
    async (serverIds: string[], name: string): Promise<string[]> => {
      const created: string[] = [];
      for (const serverId of uniqueServerIds(serverIds)) {
        const next = await createAgentForServer(serverId, name);
        created.push(...next);
      }
      return created;
    },
    [createAgentForServer]
  );

  const setAgentStatusForServers = useCallback(
    async (
      serverIds: string[],
      name: string,
      status: "idle" | "monitoring" | "executing" | "waiting_approval"
    ): Promise<string[]> => {
      const updated: string[] = [];
      for (const serverId of uniqueServerIds(serverIds)) {
        const next = await setAgentStatusForServer(serverId, name, status);
        updated.push(...next);
      }
      return updated;
    },
    [setAgentStatusForServer]
  );

  const setAgentGoalForServers = useCallback(
    async (serverIds: string[], name: string, goal: string): Promise<string[]> => {
      const updated: string[] = [];
      for (const serverId of uniqueServerIds(serverIds)) {
        const next = await setAgentGoalForServer(serverId, name, goal);
        updated.push(...next);
      }
      return updated;
    },
    [setAgentGoalForServer]
  );

  const removeAgentForServers = useCallback(
    async (serverIds: string[], name: string): Promise<string[]> => {
      const removed: string[] = [];
      for (const serverId of uniqueServerIds(serverIds)) {
        const next = await removeAgentForServer(serverId, name);
        removed.push(...next);
      }
      return removed;
    },
    [removeAgentForServer]
  );

  const queueAgentCommandForServers = useCallback(
    async (serverIds: string[], name: string, command: string): Promise<string[]> => {
      const queued: string[] = [];
      for (const serverId of uniqueServerIds(serverIds)) {
        const next = await queueAgentCommandForServer(serverId, name, command);
        queued.push(...next);
      }
      return queued;
    },
    [queueAgentCommandForServer]
  );

  const sendControlToSession = useCallback(
    async (session: string, char: string) => {
      if (!char) {
        return;
      }
      if (isLocalSession(session)) {
        throw new Error("Local LLM sessions do not support terminal control characters.");
      }
      if (sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only before sending control keys.`);
      }
      if (!connected) {
        throw new Error("Server is disconnected. Reconnect before sending control keys.");
      }
      await sendControlChar(session, char);
    },
    [connected, isLocalSession, sendControlChar, sessionReadOnly]
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
    async (
      session: string,
      serverId?: string,
      options?: { autoSend?: boolean }
    ): Promise<boolean> => {
      const targetServerId = serverId ?? focusedServerId;
      if (!targetServerId) {
        throw new Error("Select a server before using voice capture.");
      }
      const autoSend = options?.autoSend ?? glassesMode.voiceAutoSend;
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

        setPoolDrafts(targetServerId, (prev) => ({ ...prev, [session]: commandTranscript }));
        if (!autoSend) {
          voiceLoopRetryCountRef.current[session] = 0;
          if (glassesMode.voiceLoop) {
            scheduleVoiceLoopRestart(session, 180);
          }
          return true;
        }
        if (targetServerId === focusedServerId) {
          setSessionMode(session, "ai");
        } else {
          setPoolSessionMode(targetServerId, session, "ai");
        }
        await sendTextToServerSession(targetServerId, session, commandTranscript, "ai", false);
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
      focusedServerId,
      scheduleVoiceLoopRestart,
      sendTextToServerSession,
      setPoolDrafts,
      setPoolSessionMode,
      setSessionMode,
      setStatus,
      setVoiceTranscript,
      stopVoiceCaptureAndTranscribe,
    ]
  );

  const sendVoiceTranscriptToSession = useCallback(
    async (session: string, serverId?: string) => {
      const targetServerId = serverId ?? focusedServerId;
      if (!targetServerId) {
        throw new Error("Select a server before sending transcript.");
      }
      const transcript = voiceTranscript.trim();
      if (!transcript) {
        throw new Error("No voice transcript is available yet.");
      }
      if (targetServerId === focusedServerId) {
        setSessionMode(session, "ai");
      } else {
        setPoolSessionMode(targetServerId, session, "ai");
      }
      await sendTextToServerSession(targetServerId, session, transcript, "ai", false);
    },
    [focusedServerId, sendTextToServerSession, setPoolSessionMode, setSessionMode, voiceTranscript]
  );

  const stopVoiceCaptureIntoServerSession = useCallback(
    async (serverId: string, session: string, options?: { autoSend?: boolean }): Promise<boolean> => {
      return await stopVoiceCaptureIntoSession(session, serverId, options);
    },
    [stopVoiceCaptureIntoSession]
  );

  const sendVoiceTranscriptToServerSession = useCallback(
    async (serverId: string, session: string) => {
      await sendVoiceTranscriptToSession(session, serverId);
    },
    [sendVoiceTranscriptToSession]
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
        disconnectPoolAll();
        lock();
        return;
      }
      if (unlocked) {
        connectPoolAll();
      }
    });

    return () => {
      sub.remove();
    };
  }, [connectPoolAll, disconnectPoolAll, lock, unlocked]);

  useEffect(() => {
    if (!unlocked) {
      return;
    }
    markActivity();
  }, [markActivity, unlocked]);

  useEffect(() => {
    if (!unlocked || !teamSessionTimeoutMs) {
      return;
    }
    const interval = setInterval(() => {
      const idleMs = Date.now() - lastActivityAtRef.current;
      if (idleMs < teamSessionTimeoutMs) {
        return;
      }
      disconnectPoolAll();
      lock();
      setStatus({
        text: `Disconnected after ${teamSettings.sessionTimeoutMinutes}m inactivity (team policy).`,
        error: true,
      });
      markActivity();
    }, 15000);

    return () => {
      clearInterval(interval);
    };
  }, [
    disconnectPoolAll,
    lock,
    markActivity,
    teamSessionTimeoutMs,
    teamSettings.sessionTimeoutMinutes,
    unlocked,
  ]);

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
      const vmHost =
        typeof parsed.queryParams?.vm_host === "string"
          ? parsed.queryParams.vm_host
          : typeof parsed.queryParams?.vmHost === "string"
            ? parsed.queryParams.vmHost
            : "";
      const vmType =
        typeof parsed.queryParams?.vm_type === "string"
          ? parsed.queryParams.vm_type
          : typeof parsed.queryParams?.vmType === "string"
            ? parsed.queryParams.vmType
            : "";
      const vmName =
        typeof parsed.queryParams?.vm_name === "string"
          ? parsed.queryParams.vm_name
          : typeof parsed.queryParams?.vmName === "string"
            ? parsed.queryParams.vmName
            : "";
      const vmId =
        typeof parsed.queryParams?.vm_id === "string"
          ? parsed.queryParams.vm_id
          : typeof parsed.queryParams?.vmId === "string"
            ? parsed.queryParams.vmId
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
      importServerConfig({
        name,
        url: baseUrl,
        cwd,
        backend,
        vmHost,
        vmType,
        vmName,
        vmId,
        sshHost,
        sshUser,
        sshPort,
        portainerUrl,
        proxmoxUrl,
        grafanaUrl,
      });
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
    void removeMissingSessions(allSessions);
  }, [allSessions, removeMissingSessions]);

  useEffect(() => {
    void removeMissingAliases(allSessions);
  }, [allSessions, removeMissingAliases]);

  useEffect(() => {
    void removeMissingPins(allSessions);
  }, [allSessions, removeMissingPins]);

  useEffect(() => {
    if (!focusedServerId) {
      autoOpenedPinsServerRef.current = null;
      return;
    }

    if (!connected || autoOpenedPinsServerRef.current === focusedServerId) {
      return;
    }

    const missingPinned = pinnedSessions.filter((session) => allSessions.includes(session) && !openSessions.includes(session));
    if (missingPinned.length === 0) {
      autoOpenedPinsServerRef.current = focusedServerId;
      return;
    }

    const freeSlots = isPro ? Number.POSITIVE_INFINITY : Math.max(0, FREE_SESSION_LIMIT - openSessions.length);
    if (freeSlots <= 0) {
      autoOpenedPinsServerRef.current = focusedServerId;
      return;
    }

    missingPinned.slice(0, freeSlots).forEach((session) => {
      toggleSessionVisible(session);
    });
    autoOpenedPinsServerRef.current = focusedServerId;
  }, [focusedServerId, allSessions, connected, isPro, openSessions, pinnedSessions, toggleSessionVisible]);

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
  }, [focusedServerId, capabilities.files, connected, includeHidden, listDirectory, route, runWithStatus]);

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
  const terminalsViewModel = useTerminalsViewModel({
    activeServer,
    connected,
    focusedServerId,
    connections: poolConnections,
    unreadServers,
    connectedServerCount: allConnectedServers.length,
    totalActiveStreams,
    poolLifecyclePaused,
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
    activeProfile,
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
    setPaywallVisible,
    setTagFilter,
    setStartCwd,
    setStartPrompt,
    setStartOpenOnMac,
    setStartKind,
    setStartAiEngine,
    runWithStatus,
    refreshCapabilities,
    refreshSessions,
    refreshAllServers,
    setRoute,
    focusServer,
    reconnectServer,
    reconnectServers,
    reconnectAllServers,
    connectAllServers,
    disconnectAllServers,
    createSessionForServer,
    createAgentForServer,
    setAgentStatusForServer,
    setAgentGoalForServer,
    createAgentForServers,
    setAgentStatusForServers,
    setAgentGoalForServers,
    removeAgentForServer,
    removeAgentForServers,
    queueAgentCommandForServer,
    queueAgentCommandForServers,
    approveReadyAgentsForFocusedServer,
    denyAllPendingAgentsForFocusedServer,
    approveReadyAgentsForServer,
    denyAllPendingAgentsForServer,
    approveReadyAgentsForServers,
    denyAllPendingAgentsForServers,
    editServer,
    openSshFallback,
    createLocalAiSession,
    setSessionAiEngine,
    sendViaExternalLlm,
    track,
    recordAuditEvent,
    requestDangerApproval,
    handleStartSession,
    toggleSessionVisible,
    setStatus,
    isLocalSession,
    setSessionMode,
    handleOpenOnMac,
    openServerSessionOnMac,
    fetchTail,
    createSpectateLink,
    terminalApiBasePath,
    setShareConfig,
    setFocusedSession,
    handleStop,
    removeOpenSession,
    closeStream,
    recallPrev,
    setDrafts,
    setServerSessionDraft,
    sendServerSessionDraft,
    sendServerSessionCommand,
    clearServerSessionDraft,
    sendServerSessionControlChar,
    recallNext,
    setTagsForSession,
    parseCommaTags,
    setAliasForSession,
    inferSessionAlias,
    adaptCommandForBackend,
    sendControlToSession,
    setError,
    shouldRouteToExternalAi,
    queueSessionCommand,
    handleSend,
    addCommand,
    togglePinnedSession,
    setFleetCommand,
    setFleetCwd,
    setFleetTargets,
    setFleetWaitMs,
    setShellRunWaitMsInput,
    refreshProcesses,
    refreshSessionPresence,
    setSessionReadOnlyValue,
    requestShellSuggestions,
    explainSessionError,
    suggestSessionErrorFixes,
    setWatchEnabled,
    setWatchPattern,
    clearWatchAlerts,
    setTerminalPreset,
    setTerminalFontFamily,
    setTerminalFontSize,
    setTerminalBackgroundOpacity,
    flushSessionQueue,
    removeQueuedCommand,
    toggleRecording: toggleRecordingWithPolicy,
    openPlayback,
    deleteRecordingWithPlaybackCleanup,
    setGlassesEnabled,
    setGlassesBrand,
    setGlassesTextScale,
    setGlassesVoiceAutoSend,
    setGlassesVoiceLoop,
    setGlassesWakePhraseEnabled,
    setGlassesWakePhrase,
    setGlassesMinimalMode,
    setGlassesVadEnabled,
    setGlassesVadSilenceMs,
    setGlassesVadSensitivityDb,
    setGlassesLoopCaptureMs,
    setGlassesHeadsetPttEnabled,
    voicePermissionStatus,
    requestVoicePermission,
    startVoiceCapture,
    stopVoiceCaptureIntoSession,
    stopVoiceCaptureIntoServerSession,
    sendVoiceTranscriptToSession,
    sendVoiceTranscriptToServerSession,
    runFleetCommand,
  });

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
                markActivity();
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
              serverVmHostInput={serverVmHostInput}
              serverVmTypeInput={serverVmTypeInput || ""}
              serverVmNameInput={serverVmNameInput}
              serverVmIdInput={serverVmIdInput}
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
              dangerConfirmManagedByTeam={dangerConfirmManagedByTeam}
              onUseServer={(serverId) => {
                void runWithStatus("Switching server", async () => {
                  markActivity();
                  await useServer(serverId);
                  setPoolFocusedServerId(serverId);
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
                  recordAuditEvent({
                    action: "server_removed",
                    serverId,
                    serverName: label,
                    detail: "Server profile removed from device.",
                  });
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
              onImportServerConfig={importServerConfig}
              onSetServerName={setServerNameInput}
              onSetServerUrl={setServerUrlInput}
              onSetServerToken={setServerTokenInput}
              onSetServerCwd={setServerCwdInput}
              onSetServerBackend={setServerBackendInput}
              onSetServerSshHost={setServerSshHostInput}
              onSetServerSshUser={setServerSshUserInput}
              onSetServerSshPort={setServerSshPortInput}
              onSetServerVmHost={setServerVmHostInput}
              onSetServerVmType={setServerVmTypeInput}
              onSetServerVmName={setServerVmNameInput}
              onSetServerVmId={setServerVmIdInput}
              onSetServerPortainerUrl={setServerPortainerUrlInput}
              onSetServerProxmoxUrl={setServerProxmoxUrlInput}
              onSetServerGrafanaUrl={setServerGrafanaUrlInput}
              onSetAnalyticsEnabled={(value) => {
                void runWithStatus("Updating analytics setting", async () => {
                  markActivity();
                  await setAnalyticsEnabled(value);
                  setGrowthStatus(value ? "Anonymous analytics enabled." : "Anonymous analytics disabled.");
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: focusedServerId || "",
                    serverName: activeServer?.name || "",
                    detail: `analytics_enabled=${value}`,
                  });
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
                  vmHost: template.vmHost,
                  vmType: template.vmType,
                  vmName: template.vmName,
                  vmId: template.vmId,
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
                  markActivity();
                  await setRequireBiometric(value);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "device",
                    detail: `require_biometric=${value}`,
                  });
                });
              }}
              onSetRequireDangerConfirm={(value) => {
                void runWithStatus("Updating safety setting", async () => {
                  markActivity();
                  await setRequireDangerConfirm(value);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "device",
                    detail: `require_danger_confirm=${value}`,
                  });
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
                  recordAuditEvent({
                    action: "server_added",
                    serverId: editingServerId || "",
                    serverName: serverNameInput.trim() || "server",
                    detail: editingServerId ? "Server profile updated." : "Server profile created.",
                  });
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

          {route === "vr" ? (
            <AppProvider value={{ terminals: terminalsViewModel }}>
              <VrCommandCenterScreen />
            </AppProvider>
          ) : null}

          {route === "snippets" ? (
            <SnippetsScreen
              snippets={filteredSnippets}
              activeServerId={scopedServerId}
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
                    markActivity();
                    if (focusedServerId) {
                      assertServerWritable(focusedServerId, "Write file");
                    }
                    await writeFile(path, content);
                    recordAuditEvent({
                      action: "file_written",
                      serverId: focusedServerId || "",
                      serverName: activeServer?.name || "",
                      session: "",
                      detail: `path=${path}`,
                    });
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

          {route === "team" ? (
            <TeamScreen
              identity={teamIdentity}
              members={teamMembers}
              planTier={subscriptionTier}
              planSeats={
                subscriptionTier === "team"
                  ? teamSeatCount
                  : subscriptionTier === "enterprise"
                    ? enterpriseSeatCount
                    : null
              }
              settings={teamSettings}
              usage={teamUsage}
              loading={teamLoading}
              busy={teamBusy}
              authError={teamAuthError}
              canInvite={hasTeamPermission("team:invite")}
              canManage={hasTeamPermission("team:manage")}
              canManageSettings={hasTeamPermission("team:manage") || hasTeamPermission("settings:manage")}
              teamServers={teamServers}
              teamInvites={teamInvites}
              cloudDashboardUrl={cloudDashboardUrl}
              fleetApprovals={fleetApprovals}
              auditPendingCount={pendingAuditEvents}
              auditLastSyncAt={auditLastSyncAt}
              onLogin={async (input) => {
                await runWithStatus("Signing in to team", async () => {
                  markActivity();
                  await loginTeamWithPassword(input);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: `team_login=${input.email.toLowerCase()}`,
                  });
                });
              }}
              onLoginSso={async (input) => {
                await runWithStatus(`Signing in to team (${input.provider.toUpperCase()})`, async () => {
                  markActivity();
                  await loginTeamWithSso(input);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: `team_login_sso=${input.provider}`,
                  });
                });
              }}
              onInviteMember={async ({ email, role }) => {
                await runWithStatus(`Sending invite to ${email}`, async () => {
                  markActivity();
                  await inviteTeamMember({ email, role });
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: `team_invite=${email.toLowerCase()}:${role}`,
                  });
                });
              }}
              onRevokeInvite={async (inviteId) => {
                await runWithStatus("Revoking invite", async () => {
                  markActivity();
                  await revokeTeamInvite(inviteId);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: `team_invite_revoke=${inviteId}`,
                  });
                });
              }}
              onChangeMemberRole={async (memberId, role) => {
                await runWithStatus("Updating team member role", async () => {
                  markActivity();
                  await updateTeamMemberRole(memberId, role);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: `team_role_update=${memberId}:${role}`,
                  });
                });
              }}
              onSetMemberServers={async (memberId, serverIds) => {
                await runWithStatus("Updating member server access", async () => {
                  markActivity();
                  await updateTeamMemberServers(memberId, serverIds);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: `team_member_servers=${memberId}:${serverIds.join(",")}`,
                  });
                });
              }}
              onUpdateSettings={async (nextSettings) => {
                await runWithStatus("Updating team policies", async () => {
                  markActivity();
                  await updateTeamSettings(nextSettings);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: `team_policy_update=danger:${nextSettings.enforceDangerConfirm};fleet:${nextSettings.requireFleetApproval};recording:${nextSettings.requireSessionRecording};timeout:${nextSettings.sessionTimeoutMinutes ?? "off"};blocklist:${nextSettings.commandBlocklist.length}`,
                  });
                });
              }}
              onApproveFleetApproval={async (approvalId, note) => {
                await runWithStatus("Approving fleet request", async () => {
                  markActivity();
                  await approveFleetApproval(approvalId, note);
                  recordAuditEvent({
                    action: "fleet_approval_approved",
                    serverId: "",
                    serverName: "fleet",
                    detail: `fleet_approval_approved=${approvalId}`,
                  });
                });
              }}
              onDenyFleetApproval={async (approvalId, note) => {
                await runWithStatus("Denying fleet request", async () => {
                  markActivity();
                  await denyFleetApproval(approvalId, note);
                  recordAuditEvent({
                    action: "fleet_approval_denied",
                    serverId: "",
                    serverName: "fleet",
                    detail: `fleet_approval_denied=${approvalId}`,
                    approved: false,
                  });
                });
              }}
              onLogout={async () => {
                await runWithStatus("Signing out of team", async () => {
                  markActivity();
                  await logoutTeam();
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: "team_logout",
                  });
                });
              }}
              onOpenCloudDashboard={() => {
                if (!cloudDashboardUrl) {
                  return;
                }
                void runWithStatus("Opening cloud dashboard", async () => {
                  markActivity();
                  await Linking.openURL(cloudDashboardUrl);
                });
              }}
              onRefresh={() => {
                void runWithStatus("Refreshing team context", async () => {
                  markActivity();
                  await refreshTeamContext();
                });
              }}
              onSyncAudit={async () => {
                await runWithStatus("Syncing audit log", async () => {
                  markActivity();
                  await syncAuditNow();
                });
              }}
              onExportAuditJson={async () => {
                await runWithStatus("Exporting audit log (JSON)", async () => {
                  markActivity();
                  const payload = exportAuditSnapshot("json");
                  await Share.share({
                    title: `novaremote-audit-${new Date().toISOString().slice(0, 10)}.json`,
                    message: payload,
                  });
                });
              }}
              onExportAuditCsv={async () => {
                await runWithStatus("Exporting audit log (CSV)", async () => {
                  markActivity();
                  const payload = exportAuditSnapshot("csv");
                  await Share.share({
                    title: `novaremote-audit-${new Date().toISOString().slice(0, 10)}.csv`,
                    message: payload,
                  });
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
        onSendControlChar={(char) => {
          if (!focusedSession) {
            return;
          }
          void Haptics.selectionAsync();
          void sendControlToSession(focusedSession, char).catch((error) => {
            setError(error);
          });
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
        subscriptionTier={subscriptionTier}
        proPriceLabel={proPriceLabel}
        teamPriceLabel={teamPriceLabel}
        enterprisePriceLabel={enterprisePriceLabel}
        teamSeatCount={teamSeatCount}
        enterpriseSeatCount={enterpriseSeatCount}
        onClose={() => setPaywallVisible(false)}
        onUpgradePro={() => {
          void runWithStatus("Purchasing Pro", async () => {
            track("purchase_attempt", { flow: "upgrade", tier: "pro" });
            if (!rcAvailable) {
              throw new Error("RevenueCat keys are not configured yet.");
            }
            const pro = await purchasePro();
            if (pro) {
              track("purchase_success", { flow: "upgrade", tier: "pro" });
              setPaywallVisible(false);
            }
          });
        }}
        onUpgradeTeam={
          teamPriceLabel
            ? () => {
                void runWithStatus("Purchasing Team", async () => {
                  track("purchase_attempt", { flow: "upgrade", tier: "team" });
                  if (!rcAvailable) {
                    throw new Error("RevenueCat keys are not configured yet.");
                  }
                  const pro = await purchaseTeam();
                  if (pro) {
                    track("purchase_success", { flow: "upgrade", tier: "team" });
                    setPaywallVisible(false);
                  }
                });
              }
            : undefined
        }
        onUpgradeEnterprise={
          enterprisePriceLabel
            ? () => {
                void runWithStatus("Purchasing Enterprise", async () => {
                  track("purchase_attempt", { flow: "upgrade", tier: "enterprise" });
                  if (!rcAvailable) {
                    throw new Error("RevenueCat keys are not configured yet.");
                  }
                  const pro = await purchaseEnterprise();
                  if (pro) {
                    track("purchase_success", { flow: "upgrade", tier: "enterprise" });
                    setPaywallVisible(false);
                  }
                });
              }
            : undefined
        }
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
        heading={shareConfig?.heading}
        description={shareConfig?.description}
        shareButtonLabel={shareConfig?.shareButtonLabel}
        onClose={() => setShareConfig(null)}
      />

      <DangerConfirmModal
        visible={dangerPrompt.visible}
        command={dangerPrompt.command}
        context={dangerPrompt.context}
        onCancel={() => {
          recordAuditEvent({
            action: "command_dangerous_denied",
            serverId: focusedServerId || "",
            serverName: activeServer?.name || "",
            session: focusedSession || "",
            detail: `${dangerPrompt.context}: ${dangerPrompt.command}`.slice(0, 400),
            approved: false,
          }, { immediateSync: true });
          setDangerPrompt({ visible: false, command: "", context: "" });
          const resolver = dangerResolverRef.current;
          dangerResolverRef.current = null;
          resolver?.(false);
        }}
        onConfirm={() => {
          recordAuditEvent({
            action: "command_dangerous_approved",
            serverId: focusedServerId || "",
            serverName: activeServer?.name || "",
            session: focusedSession || "",
            detail: `${dangerPrompt.context}: ${dangerPrompt.command}`.slice(0, 400),
            approved: true,
          }, { immediateSync: true });
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
