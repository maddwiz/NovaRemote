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
import { AppProvider, TerminalsViewModel } from "./context/AppContext";
import {
  BRAND_LOGO,
  DEFAULT_CWD,
  DEFAULT_FLEET_WAIT_MS,
  DEFAULT_SHELL_WAIT_MS,
  DEFAULT_TERMINAL_BACKEND,
  FREE_SERVER_LIMIT,
  FREE_SESSION_LIMIT,
  COLLAB_POLL_INTERVAL_MS,
  POLL_INTERVAL_MS,
  STORAGE_COMMAND_QUEUE_PREFIX,
  STORAGE_SHELL_WAIT_MS,
  STORAGE_SHELL_WAIT_MS_PREFIX,
  STORAGE_SESSION_COLLAB_READONLY_PREFIX,
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
import { useSessionAliases } from "./hooks/useSessionAliases";
import { useServerCapabilities } from "./hooks/useServerCapabilities";
import { useSnippets } from "./hooks/useSnippets";
import { useTerminalSessions } from "./hooks/useTerminalSessions";
import { useTerminalTheme } from "./hooks/useTerminalTheme";
import { useTutorial } from "./hooks/useTutorial";
import { useWebSocket } from "./hooks/useWebSocket";
import { useFilesBrowser } from "./hooks/useFilesBrowser";
import { usePinnedSessions } from "./hooks/usePinnedSessions";
import { useLlmProfiles } from "./hooks/useLlmProfiles";
import { useLlmClient } from "./hooks/useLlmClient";
import { FilesScreen } from "./screens/FilesScreen";
import { LlmsScreen } from "./screens/LlmsScreen";
import { ServersScreen } from "./screens/ServersScreen";
import { SnippetsScreen } from "./screens/SnippetsScreen";
import { TerminalsScreen } from "./screens/TerminalsScreen";
import { styles } from "./theme/styles";
import { buildTerminalAppearance } from "./theme/terminalTheme";
import {
  AiEnginePreference,
  FleetRunResult,
  ProcessInfo,
  ProcessSignal,
  QueuedCommand,
  QueuedCommandStatus,
  RecordingChunk,
  RouteTab,
  ServerProfile,
  SessionCollaborator,
  SessionRecording,
  Status,
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

function makeQueueCommandId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function queueStatus(item: QueuedCommand): QueuedCommandStatus {
  if (item.status === "sending" || item.status === "sent" || item.status === "failed") {
    return item.status;
  }
  return "pending";
}

function normalizeQueuedCommand(item: unknown): QueuedCommand | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const raw = item as Record<string, unknown>;
  const command = typeof raw.command === "string" ? raw.command.trim() : "";
  if (!command) {
    return null;
  }
  const mode = raw.mode === "ai" ? "ai" : "shell";
  const status = raw.status === "sending" || raw.status === "sent" || raw.status === "failed" ? raw.status : "pending";
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeQueueCommandId(),
    command,
    mode,
    queuedAt: typeof raw.queuedAt === "string" && raw.queuedAt ? raw.queuedAt : new Date().toISOString(),
    status,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    sentAt: typeof raw.sentAt === "string" ? raw.sentAt : null,
  };
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

function detectTerminalErrorLine(output: string): string | null {
  const lines = output
    .split("\n")
    .slice(-140)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const patterns = [
    /\berror\b/i,
    /\bexception\b/i,
    /\btraceback\b/i,
    /\bfatal\b/i,
    /\bpanic\b/i,
    /\bfailed\b/i,
    /\bcommand not found\b/i,
    /\bpermission denied\b/i,
    /\bsegmentation fault\b/i,
    /\bno such file or directory\b/i,
    /\bsyntax error\b/i,
    /\bmodule not found\b/i,
  ];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (/^\d+\s+errors?/.test(line.toLowerCase())) {
      continue;
    }
    if (patterns.some((pattern) => pattern.test(line))) {
      return line.slice(0, 280);
    }
  }

  return null;
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

function adaptCommandForBackend(command: string, backend: TerminalBackendKind | undefined): string {
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

function normalizeProcessList(payload: unknown): ProcessInfo[] {
  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { processes?: unknown[] }).processes)
      ? (payload as { processes: unknown[] }).processes
      : payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown[] }).items)
        ? (payload as { items: unknown[] }).items
        : [];

  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const pid = Number(raw.pid);
      if (!Number.isFinite(pid) || pid <= 0) {
        return null;
      }
      return {
        pid,
        name: typeof raw.name === "string" ? raw.name : typeof raw.command === "string" ? raw.command.split(" ")[0] || "process" : "process",
        cpu_percent: typeof raw.cpu_percent === "number" ? raw.cpu_percent : typeof raw.cpu === "number" ? raw.cpu : undefined,
        mem_percent: typeof raw.mem_percent === "number" ? raw.mem_percent : typeof raw.mem === "number" ? raw.mem : undefined,
        uptime_seconds:
          typeof raw.uptime_seconds === "number" ? raw.uptime_seconds : typeof raw.uptime === "number" ? raw.uptime : undefined,
        user: typeof raw.user === "string" ? raw.user : undefined,
        command: typeof raw.command === "string" ? raw.command : undefined,
      } as ProcessInfo;
    })
    .filter((entry): entry is ProcessInfo => Boolean(entry))
    .sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0));
}

function toOptionalBool(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "readonly", "read_only"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", "interactive", "readwrite", "read_write"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function parsePresenceTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCollaboratorRole(value: unknown): SessionCollaborator["role"] {
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "owner" || normalized === "editor" || normalized === "viewer") {
    return normalized;
  }
  return "unknown";
}

function normalizeSessionPresence(payload: unknown): { collaborators: SessionCollaborator[]; readOnly: boolean | null } {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.collaborators)
      ? root?.collaborators
      : Array.isArray(root?.viewers)
        ? root?.viewers
        : Array.isArray(root?.participants)
          ? root?.participants
          : Array.isArray(root?.users)
            ? root?.users
            : [];

  const collaborators = rawList
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const idValue = raw.id ?? raw.user_id ?? raw.uid ?? raw.socket_id;
      const id = typeof idValue === "string" && idValue.trim() ? idValue.trim() : `viewer-${index + 1}`;
      const nameValue = raw.name ?? raw.username ?? raw.display_name ?? raw.handle;
      const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : id;
      const readOnly = toOptionalBool(raw.read_only ?? raw.readonly ?? raw.readOnly) ?? false;
      const isSelf = toOptionalBool(raw.is_self ?? raw.self ?? raw.me) ?? false;
      return {
        id,
        name,
        role: normalizeCollaboratorRole(raw.role),
        readOnly,
        isSelf,
        lastSeenAt: parsePresenceTimestamp(raw.last_seen_at ?? raw.lastSeenAt ?? raw.last_seen ?? raw.updated_at ?? raw.updatedAt),
      } satisfies SessionCollaborator;
    })
    .filter((entry): entry is SessionCollaborator => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));

  const readOnly = toOptionalBool(root?.read_only ?? root?.readonly ?? root?.readOnly ?? root?.mode);
  return { collaborators, readOnly };
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
  const [shellRunWaitMs, setShellRunWaitMs] = useState<string>(String(DEFAULT_SHELL_WAIT_MS));
  const [startAiEngine, setStartAiEngine] = useState<AiEnginePreference>("auto");
  const [sessionAiEngine, setSessionAiEngine] = useState<Record<string, AiEnginePreference>>({});
  const [suggestionsBySession, setSuggestionsBySession] = useState<Record<string, string[]>>({});
  const [suggestionBusyBySession, setSuggestionBusyBySession] = useState<Record<string, boolean>>({});
  const [errorHintsBySession, setErrorHintsBySession] = useState<Record<string, string>>({});
  const [triageBusyBySession, setTriageBusyBySession] = useState<Record<string, boolean>>({});
  const [triageExplanationBySession, setTriageExplanationBySession] = useState<Record<string, string>>({});
  const [triageFixesBySession, setTriageFixesBySession] = useState<Record<string, string[]>>({});
  const [watchRules, setWatchRules] = useState<Record<string, WatchRule>>({});
  const [watchAlertHistoryBySession, setWatchAlertHistoryBySession] = useState<Record<string, string[]>>({});
  const [commandQueue, setCommandQueue] = useState<Record<string, QueuedCommand[]>>({});
  const [recordings, setRecordings] = useState<Record<string, SessionRecording>>({});
  const [sysStats, setSysStats] = useState<SysStats | null>(null);
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processesBusy, setProcessesBusy] = useState<boolean>(false);
  const [sessionPresence, setSessionPresence] = useState<Record<string, SessionCollaborator[]>>({});
  const [sessionReadOnly, setSessionReadOnly] = useState<Record<string, boolean>>({});
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
  const dangerResolverRef = useRef<((approved: boolean) => void) | null>(null);
  const autoOpenedPinsServerRef = useRef<string | null>(null);
  const recordingTailRef = useRef<Record<string, string>>({});
  const triageHintRef = useRef<Record<string, string>>({});
  const presenceInFlightRef = useRef<Set<string>>(new Set());

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

  const {
    capabilities,
    terminalApiBasePath,
    supportedFeatures,
    loading: capabilitiesLoading,
    refresh: refreshCapabilities,
  } = useServerCapabilities({ activeServer, connected });
  const parsedShellRunWaitMs = useMemo(
    () => Math.max(400, Math.min(Number.parseInt(shellRunWaitMs, 10) || DEFAULT_SHELL_WAIT_MS, 120000)),
    [shellRunWaitMs]
  );

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

  const explainSessionError = useCallback(
    async (session: string) => {
      const errorLine = errorHintsBySession[session];
      if (!errorLine) {
        throw new Error("No recent error detected for this session.");
      }
      if (!activeProfile) {
        throw new Error("Configure an external LLM profile to analyze errors.");
      }

      const tailLines = (tails[session] || "")
        .split("\n")
        .slice(-80)
        .join("\n");
      const recentCommands = (commandHistory[session] || []).slice(-6).join("\n");
      const prompt = [
        "You are a terminal troubleshooting assistant.",
        "Explain the likely root cause in plain language and list exactly 3 actionable debugging steps.",
        "Keep it concise, no markdown.",
        "",
        `Session: ${session}`,
        `Detected error line: ${errorLine}`,
        "Recent commands:",
        recentCommands || "(none)",
        "Recent terminal output:",
        tailLines || "(none)",
      ].join("\n");

      setTriageBusyBySession((prev) => ({ ...prev, [session]: true }));
      try {
        const response = await sendPrompt(activeProfile, prompt);
        setTriageExplanationBySession((prev) => ({ ...prev, [session]: response.trim() }));
      } finally {
        setTriageBusyBySession((prev) => ({ ...prev, [session]: false }));
      }
    },
    [activeProfile, commandHistory, errorHintsBySession, sendPrompt, tails]
  );

  const suggestSessionErrorFixes = useCallback(
    async (session: string) => {
      const errorLine = errorHintsBySession[session];
      if (!errorLine) {
        throw new Error("No recent error detected for this session.");
      }
      if (!activeProfile) {
        throw new Error("Configure an external LLM profile to generate fixes.");
      }

      const tailLines = (tails[session] || "")
        .split("\n")
        .slice(-80)
        .join("\n");
      const recentCommands = (commandHistory[session] || []).slice(-6).join("\n");
      const prompt = [
        "You are generating safe shell fixes for a terminal error.",
        "Return strictly JSON: an array of 3 shell commands only, no explanation.",
        "Commands must be minimally destructive and useful for diagnostics/fix.",
        "",
        `Session: ${session}`,
        `Detected error line: ${errorLine}`,
        "Recent commands:",
        recentCommands || "(none)",
        "Recent terminal output:",
        tailLines || "(none)",
      ].join("\n");

      setTriageBusyBySession((prev) => ({ ...prev, [session]: true }));
      try {
        const response = await sendPrompt(activeProfile, prompt);
        const fixes = parseSuggestionOutput(response).map((entry) => entry.replace(/^`+|`+$/g, "").trim()).filter(Boolean);
        setTriageFixesBySession((prev) => ({ ...prev, [session]: fixes }));
      } finally {
        setTriageBusyBySession((prev) => ({ ...prev, [session]: false }));
      }
    },
    [activeProfile, commandHistory, errorHintsBySession, sendPrompt, tails]
  );

  const refreshProcesses = useCallback(async () => {
    if (!activeServer || !connected || !capabilities.processes) {
      setProcesses([]);
      return;
    }
    setProcessesBusy(true);
    try {
      const payload = await apiRequest<unknown>(activeServer.baseUrl, activeServer.token, "/proc/list");
      setProcesses(normalizeProcessList(payload));
    } finally {
      setProcessesBusy(false);
    }
  }, [activeServer, capabilities.processes, connected]);

  const refreshSessionPresence = useCallback(
    async (session: string, showErrors: boolean = false) => {
      if (isLocalSession(session)) {
        setSessionPresence((prev) => ({ ...prev, [session]: [] }));
        return;
      }
      if (!activeServer || !connected || !capabilities.collaboration) {
        return;
      }
      if (presenceInFlightRef.current.has(session)) {
        return;
      }
      presenceInFlightRef.current.add(session);
      try {
        const candidates = [
          `${terminalApiBasePath}/presence?session=${encodeURIComponent(session)}`,
          `/collab/presence?session=${encodeURIComponent(session)}`,
          `/presence?session=${encodeURIComponent(session)}`,
        ];
        let payload: unknown = null;
        let lastError: unknown = null;
        for (const path of candidates) {
          try {
            payload = await apiRequest<unknown>(activeServer.baseUrl, activeServer.token, path);
            break;
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith("404") || message.startsWith("405") || message.startsWith("501")) {
              continue;
            }
          }
        }
        if (payload === null) {
          if (showErrors && lastError) {
            throw lastError;
          }
          setSessionPresence((prev) => ({ ...prev, [session]: [] }));
          return;
        }
        const normalized = normalizeSessionPresence(payload);
        setSessionPresence((prev) => ({ ...prev, [session]: normalized.collaborators }));
        if (normalized.readOnly !== null) {
          setSessionReadOnly((prev) => {
            const next = { ...prev };
            if (normalized.readOnly) {
              next[session] = true;
            } else {
              delete next[session];
            }
            return next;
          });
        }
      } finally {
        presenceInFlightRef.current.delete(session);
      }
    },
    [activeServer, capabilities.collaboration, connected, isLocalSession, terminalApiBasePath]
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

  const queueSessionCommand = useCallback(
    (session: string, command: string, mode: TerminalSendMode) => {
      const trimmed = command.trim();
      if (!trimmed) {
        return;
      }
      setCommandQueue((prev) => {
        const existing = prev[session] || [];
        const nextQueue = [
          ...existing,
          {
            id: makeQueueCommandId(),
            command: trimmed,
            mode,
            queuedAt: new Date().toISOString(),
            status: "pending" as QueuedCommandStatus,
            lastError: null,
            sentAt: null,
          },
        ].slice(-50);
        return {
          ...prev,
          [session]: nextQueue,
        };
      });
      setDrafts((prev) => ({ ...prev, [session]: "" }));
      setReady(`Queued command for ${session}. It will run when connection is restored.`);
    },
    [setDrafts, setReady]
  );

  const flushSessionQueue = useCallback(
    async (session: string, options?: { includeFailed?: boolean }) => {
      const initialQueue = commandQueue[session] || [];
      if (initialQueue.length === 0) {
        return 0;
      }
      const includeFailed = options?.includeFailed ?? true;
      if (sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only to flush queued commands.`);
      }

      if (!connected && !isLocalSession(session)) {
        throw new Error("Reconnect to flush queued commands for this session.");
      }

      const queue = initialQueue.map((item) => (item.id ? item : { ...item, id: makeQueueCommandId() }));
      if (queue.some((item, index) => initialQueue[index]?.id !== item.id)) {
        setCommandQueue((prev) => ({ ...prev, [session]: queue }));
      }

      const shouldFlushItem = (item: QueuedCommand): boolean => {
        const status = queueStatus(item);
        if (status === "pending" || status === "sending") {
          return true;
        }
        return includeFailed && status === "failed";
      };

      const updatable = queue.filter(shouldFlushItem);
      if (updatable.length === 0) {
        return 0;
      }

      let sentCount = 0;
      for (const item of updatable) {
        const itemId = item.id as string;
        setCommandQueue((prev) => ({
          ...prev,
          [session]: (prev[session] || []).map((entry) =>
            entry.id === itemId ? { ...entry, status: "sending" as QueuedCommandStatus, lastError: null } : entry
          ),
        }));

        if (item.mode === "ai" && shouldRouteToExternalAi(session)) {
          try {
            const sent = await sendViaExternalLlm(session, item.command);
            if (sent) {
              await addCommand(session, sent);
              sentCount += 1;
              setCommandQueue((prev) => ({
                ...prev,
                [session]: (prev[session] || []).map((entry) =>
                  entry.id === itemId
                    ? { ...entry, status: "sent" as QueuedCommandStatus, sentAt: new Date().toISOString(), lastError: null }
                    : entry
                ),
              }));
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setCommandQueue((prev) => ({
              ...prev,
              [session]: (prev[session] || []).map((entry) =>
                entry.id === itemId ? { ...entry, status: "failed" as QueuedCommandStatus, lastError: message } : entry
              ),
            }));
          }
          continue;
        }

        if (item.mode === "shell" && isLocalSession(session)) {
          setCommandQueue((prev) => ({
            ...prev,
            [session]: (prev[session] || []).map((entry) =>
              entry.id === itemId
                ? { ...entry, status: "failed" as QueuedCommandStatus, lastError: "Shell queueing is unavailable for local-only AI sessions." }
                : entry
            ),
          }));
          continue;
        }

        try {
          await sendCommand(session, item.command, item.mode, false);
          await addCommand(session, item.command);
          sentCount += 1;
          setCommandQueue((prev) => ({
            ...prev,
            [session]: (prev[session] || []).map((entry) =>
              entry.id === itemId
                ? { ...entry, status: "sent" as QueuedCommandStatus, sentAt: new Date().toISOString(), lastError: null }
                : entry
            ),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setCommandQueue((prev) => ({
            ...prev,
            [session]: (prev[session] || []).map((entry) =>
              entry.id === itemId ? { ...entry, status: "failed" as QueuedCommandStatus, lastError: message } : entry
            ),
          }));
        }
      }

      setCommandQueue((prev) => {
        const current = prev[session] || [];
        const retained = current
          .filter((entry) => queueStatus(entry) !== "sent")
          .map((entry) => (queueStatus(entry) === "sending" ? { ...entry, status: "pending" as QueuedCommandStatus } : entry));
        return { ...prev, [session]: retained };
      });
      return sentCount;
    },
    [addCommand, commandQueue, connected, isLocalSession, sendCommand, sendViaExternalLlm, sessionReadOnly, shouldRouteToExternalAi]
  );

  const toggleRecording = useCallback(
    (session: string) => {
      const now = Date.now();
      setRecordings((prev) => {
        const current = prev[session];
        if (current?.active) {
          return {
            ...prev,
            [session]: {
              ...current,
              active: false,
              stoppedAt: now,
            },
          };
        }

        recordingTailRef.current[session] = tails[session] || "";
        return {
          ...prev,
          [session]: {
            session,
            active: true,
            startedAt: now,
            stoppedAt: null,
            chunks: [],
          },
        };
      });
      void Haptics.selectionAsync();
    },
    [tails]
  );

  const openPlayback = useCallback((session: string) => {
    const recording = recordings[session];
    if (!recording || recording.chunks.length === 0) {
      return;
    }
    setPlaybackSession(session);
    setPlaybackTimeMs(0);
    setPlaybackPlaying(false);
  }, [recordings]);

  const deleteRecording = useCallback((session: string) => {
    setRecordings((prev) => {
      const next = { ...prev };
      delete next[session];
      return next;
    });
    if (playbackSession === session) {
      setPlaybackSession(null);
      setPlaybackTimeMs(0);
      setPlaybackPlaying(false);
    }
  }, [playbackSession]);

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

    setWatchAlertHistoryBySession((prev) => {
      const next = { ...prev };
      pending.forEach(([session, match]) => {
        const stamp = new Date().toLocaleTimeString();
        const existing = next[session] || [];
        next[session] = [`[${stamp}] ${match}`, ...existing].slice(0, 12);
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
    if (!connected) {
      return;
    }
    const pendingSessions = Object.keys(commandQueue).filter((session) =>
      (commandQueue[session] || []).some((item) => queueStatus(item) === "pending") && !sessionReadOnly[session]
    );
    if (pendingSessions.length === 0) {
      return;
    }
    pendingSessions.forEach((session) => {
      void runWithStatus(`Flushing queued commands for ${session}`, async () => {
        const sent = await flushSessionQueue(session, { includeFailed: false });
        if (sent > 0 && isPro) {
          await notify("Queued commands sent", `${session}: ${sent} command${sent === 1 ? "" : "s"}.`);
        }
      });
    });
  }, [commandQueue, connected, flushSessionQueue, isPro, notify, runWithStatus, sessionReadOnly]);

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
    if (!connected || !capabilities.collaboration || remoteOpenSessions.length === 0) {
      return;
    }
    remoteOpenSessions.forEach((session) => {
      void refreshSessionPresence(session, false);
    });
    const id = setInterval(() => {
      remoteOpenSessions.forEach((session) => {
        void refreshSessionPresence(session, false);
      });
    }, COLLAB_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [capabilities.collaboration, connected, refreshSessionPresence, remoteOpenSessions]);

  useEffect(() => {
    if (connected && capabilities.collaboration) {
      return;
    }
    setSessionPresence({});
  }, [capabilities.collaboration, connected]);

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
    setErrorHintsBySession((prev) => {
      let changed = false;
      const next = { ...prev };
      allSessions.forEach((session) => {
        const hint = detectTerminalErrorLine(tails[session] || "");
        if (!hint) {
          if (next[session]) {
            delete next[session];
            changed = true;
          }
          return;
        }
        if (next[session] !== hint) {
          next[session] = hint;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allSessions, tails]);

  useEffect(() => {
    const changedSessions: string[] = [];
    const nextFingerprint: Record<string, string> = {};
    allSessions.forEach((session) => {
      const hint = errorHintsBySession[session] || "";
      nextFingerprint[session] = hint;
      if ((triageHintRef.current[session] || "") !== hint) {
        changedSessions.push(session);
      }
    });
    triageHintRef.current = nextFingerprint;

    if (changedSessions.length === 0) {
      return;
    }

    setTriageExplanationBySession((prev) => {
      const next = { ...prev };
      changedSessions.forEach((session) => {
        delete next[session];
      });
      return next;
    });
    setTriageFixesBySession((prev) => {
      const next = { ...prev };
      changedSessions.forEach((session) => {
        delete next[session];
      });
      return next;
    });
  }, [allSessions, errorHintsBySession]);

  useEffect(() => {
    const available = new Set(allSessions);
    Object.keys(recordingTailRef.current).forEach((session) => {
      if (!available.has(session)) {
        delete recordingTailRef.current[session];
      }
    });
  }, [allSessions]);

  useEffect(() => {
    setRecordings((prev) => {
      let changed = false;
      const next = { ...prev };

      allSessions.forEach((session) => {
        const latestTail = tails[session] || "";
        const priorTail = recordingTailRef.current[session] ?? "";
        if (latestTail === priorTail) {
          return;
        }

        const recording = next[session];
        if (recording?.active) {
          const delta = latestTail.startsWith(priorTail) ? latestTail.slice(priorTail.length) : latestTail;
          if (delta) {
            next[session] = {
              ...recording,
              chunks: [
                ...recording.chunks,
                {
                  atMs: Math.max(0, Date.now() - recording.startedAt),
                  text: delta,
                },
              ],
            };
            changed = true;
          }
        }
        recordingTailRef.current[session] = latestTail;
      });

      return changed ? next : prev;
    });
  }, [allSessions, tails]);

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
    unnamed.forEach((session) => {
      const guess = inferSessionAlias(session, tails[session] || "", commandHistory[session] || []);
      if (!guess) {
        return;
      }
      void setAliasForSession(session, guess);
    });
  }, [allSessions, commandHistory, sessionAliases, setAliasForSession, tails]);

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
    setErrorHintsBySession((prev) => {
      const next: Record<string, string> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setTriageBusyBySession((prev) => {
      const next: Record<string, boolean> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setTriageExplanationBySession((prev) => {
      const next: Record<string, string> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setTriageFixesBySession((prev) => {
      const next: Record<string, string[]> = {};
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
    setWatchAlertHistoryBySession((prev) => {
      const next: Record<string, string[]> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setCommandQueue((prev) => {
      const next: Record<string, QueuedCommand[]> = {};
      allSessions.forEach((session) => {
        next[session] = prev[session] || [];
      });
      return next;
    });
    setSessionPresence((prev) => {
      const next: Record<string, SessionCollaborator[]> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setSessionReadOnly((prev) => {
      const next: Record<string, boolean> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = true;
        }
      });
      return next;
    });
    setRecordings((prev) => {
      const next: Record<string, SessionRecording> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
  }, [allSessions]);

  useEffect(() => {
    let mounted = true;
    async function loadShellRunWait() {
      if (!activeServerId) {
        setShellRunWaitMs(String(DEFAULT_SHELL_WAIT_MS));
        return;
      }

      setShellRunWaitMs(String(DEFAULT_SHELL_WAIT_MS));
      const scopedKey = `${STORAGE_SHELL_WAIT_MS_PREFIX}.${activeServerId}`;
      let raw = await SecureStore.getItemAsync(scopedKey);
      if (!raw) {
        raw = await SecureStore.getItemAsync(STORAGE_SHELL_WAIT_MS);
        if (raw) {
          await SecureStore.setItemAsync(scopedKey, raw);
        }
      }

      if (!mounted || !raw) {
        return;
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) {
        return;
      }
      const clamped = Math.max(400, Math.min(parsed, 120000));
      setShellRunWaitMs(String(clamped));
    }
    void loadShellRunWait();
    return () => {
      mounted = false;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    void SecureStore.setItemAsync(`${STORAGE_SHELL_WAIT_MS_PREFIX}.${activeServerId}`, String(parsedShellRunWaitMs));
  }, [activeServerId, parsedShellRunWaitMs]);

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
    let mounted = true;
    async function loadCollabReadOnly() {
      if (!activeServerId) {
        if (mounted) {
          setSessionReadOnly({});
        }
        return;
      }
      const raw = await SecureStore.getItemAsync(`${STORAGE_SESSION_COLLAB_READONLY_PREFIX}.${activeServerId}`);
      if (!mounted) {
        return;
      }
      if (!raw) {
        setSessionReadOnly({});
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") {
          setSessionReadOnly({});
          return;
        }
        const next: Record<string, boolean> = {};
        Object.entries(parsed).forEach(([session, value]) => {
          const bool = toOptionalBool(value);
          if (bool !== null) {
            next[session] = bool;
          }
        });
        setSessionReadOnly(next);
      } catch {
        setSessionReadOnly({});
      }
    }
    void loadCollabReadOnly();
    return () => {
      mounted = false;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    void SecureStore.setItemAsync(`${STORAGE_SESSION_COLLAB_READONLY_PREFIX}.${activeServerId}`, JSON.stringify(sessionReadOnly));
  }, [activeServerId, sessionReadOnly]);

  useEffect(() => {
    let mounted = true;
    async function loadQueuedCommands() {
      if (!activeServerId) {
        if (mounted) {
          setCommandQueue({});
        }
        return;
      }

      const raw = await SecureStore.getItemAsync(`${STORAGE_COMMAND_QUEUE_PREFIX}.${activeServerId}`);
      if (!mounted) {
        return;
      }
      if (!raw) {
        setCommandQueue({});
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") {
          setCommandQueue({});
          return;
        }
        const next: Record<string, QueuedCommand[]> = {};
        Object.entries(parsed).forEach(([session, value]) => {
          if (!Array.isArray(value)) {
            return;
          }
          next[session] = value
            .map((entry) => normalizeQueuedCommand(entry))
            .filter((entry): entry is QueuedCommand => Boolean(entry))
            .slice(-50);
        });
        setCommandQueue(next);
      } catch {
        setCommandQueue({});
      }
    }
    void loadQueuedCommands();
    return () => {
      mounted = false;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    void SecureStore.setItemAsync(`${STORAGE_COMMAND_QUEUE_PREFIX}.${activeServerId}`, JSON.stringify(commandQueue));
  }, [activeServerId, commandQueue]);

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

  useEffect(() => {
    if (!connected || !capabilities.processes) {
      setProcesses([]);
      return;
    }
    void refreshProcesses();
    const id = setInterval(() => {
      void refreshProcesses();
    }, 5000);
    return () => clearInterval(id);
  }, [capabilities.processes, connected, refreshProcesses]);

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
    const tickMs = 160;
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
          if (isPro) {
            await notify("Command sent", `${session}: ${sent.slice(0, 80)}`);
          }
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
    onSetShellRunWaitMs: (value) => setShellRunWaitMs(value.replace(/[^0-9]/g, "")),
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
      setSessionReadOnly((prev) => {
        const next = { ...prev };
        if (value) {
          next[session] = true;
        } else {
          delete next[session];
        }
        return next;
      });
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
      setWatchAlertHistoryBySession((prev) => {
        const next = { ...prev };
        delete next[session];
        return next;
      });
    },
    onClearWatchAlerts: (session) => {
      setWatchAlertHistoryBySession((prev) => {
        const next = { ...prev };
        delete next[session];
        return next;
      });
    },
    onSetTerminalPreset: setTerminalPreset,
    onSetTerminalFontFamily: setTerminalFontFamily,
    onSetTerminalFontSize: setTerminalFontSize,
    onSetTerminalBackgroundOpacity: setTerminalBackgroundOpacity,
    onFlushQueue: (session) => {
      void runWithStatus(`Flushing queued commands for ${session}`, async () => {
        const sent = await flushSessionQueue(session, { includeFailed: true });
        if (sent > 0 && isPro) {
          await notify("Queued commands sent", `${session}: ${sent} command${sent === 1 ? "" : "s"}.`);
        }
      });
    },
    onRemoveQueuedCommand: (session, index) => {
      setCommandQueue((prev) => {
        const current = prev[session] || [];
        if (index < 0 || index >= current.length) {
          return prev;
        }
        return {
          ...prev,
          [session]: current.filter((_, itemIndex) => itemIndex !== index),
        };
      });
    },
    onToggleRecording: toggleRecording,
    onOpenPlayback: openPlayback,
    onDeleteRecording: deleteRecording,
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
              onTestPrompt={(profile, prompt) => {
                void runWithStatus(`Testing ${profile.name}`, async () => {
                  setLlmTestBusy(true);
                  const started = Date.now();
                  try {
                    const output = await sendPrompt(profile, prompt);
                    const elapsed = Date.now() - started;
                    setLlmTestSummary(`${profile.kind} • ${profile.model} • ${elapsed} ms`);
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
