import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  Alert,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  SafeAreaView,
  Share,
  ScrollView,
  Text,
  View,
} from "react-native";

import { apiRequest, normalizeBaseUrl } from "./api/client";
import { FullscreenTerminal } from "./components/FullscreenTerminal";
import { HomeNavHub } from "./components/HomeNavHub";
import { LaunchIntro } from "./components/LaunchIntro";
import { LockScreen } from "./components/LockScreen";
import { DangerConfirmModal } from "./components/DangerConfirmModal";
import { OnboardingModal } from "./components/OnboardingModal";
import { NovaAssistantOverlay } from "./components/NovaAssistantOverlay";
import { PageSlideMenu } from "./components/PageSlideMenu";
import { PaywallModal } from "./components/PaywallModal";
import { SessionPlaybackModal } from "./components/SessionPlaybackModal";
import { ShareServerModal } from "./components/ShareServerModal";
import { StatusPill } from "./components/StatusPill";
import { TutorialModal } from "./components/TutorialModal";
import { AppProvider } from "./context/AppContext";
import { BRAND_LOGO } from "./branding";
import {
  DEFAULT_CWD,
  DEFAULT_FLEET_WAIT_MS,
  NOVA_VOICE_CAPTURE_MS,
  NOVA_VOICE_VAD_SILENCE_MS,
  DEFAULT_SPECTATE_TTL_SECONDS,
  DEFAULT_TERMINAL_BACKEND,
  FREE_SERVER_LIMIT,
  FREE_SESSION_LIMIT,
  STORAGE_NOVA_VOICE_SETTINGS,
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
import {
  approveNovaAdaptBridgePlanAsync,
  createNovaAdaptBridgePlan,
  fetchNovaAdaptBridgeSnapshot,
  rejectNovaAdaptBridgePlan,
  resumeNovaAdaptBridgeWorkflow,
} from "./hooks/useNovaAdaptBridge";
import { useServerConnection } from "./hooks/useServerConnection";
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
import { useNovaAssistant } from "./hooks/useNovaAssistant";
import {
  isFleetShellRunUnavailableError,
  resolveFleetTerminalApiBasePath,
  shouldAttemptFleetShellRun,
} from "./fleetTerminalBasePath";
import { findApprovedFleetApproval, findPendingFleetApproval } from "./fleetApproval";
import { formatAssistantShellPath, resolveAssistantFolderTarget } from "./assistantPath";
import { buildAgentRuntimeFallback } from "./agentFallback";
import { FilesScreen } from "./screens/FilesScreen";
import { LlmsScreen } from "./screens/LlmsScreen";
import { AgentsScreen } from "./screens/AgentsScreen";
import { ServersScreen } from "./screens/ServersScreen";
import { SnippetsScreen } from "./screens/SnippetsScreen";
import { TeamScreen } from "./screens/TeamScreen";
import { GlassesModeScreen } from "./screens/GlassesModeScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { TerminalsScreen } from "./screens/TerminalsScreen";
import { VrCommandCenterScreen } from "./screens/VrCommandCenterScreen";
import { styles } from "./theme/styles";
import { buildTerminalAppearance } from "./theme/terminalTheme";
import { evaluateCrossServerWatchAlerts } from "./crossServerWatchAlerts";
import {
  NovaAssistantAction,
  NovaAssistantExecutionResult,
  NovaAssistantRuntimeContext,
  resolveAssistantServer,
  resolveAssistantSession,
} from "./novaAssistant";
import {
  DEFAULT_NOVA_CONVERSATION_IDLE_MS,
  DEFAULT_NOVA_WAKE_PHRASE,
  normalizeNovaConversationIdleMs,
  normalizeNovaWakePhrase,
  resolveNovaWakeCommand,
} from "./novaVoice";
import { findBlockedCommandPattern, resolveSessionTimeoutMs } from "./teamPolicy";
import {
  AiEnginePreference,
  FleetRunResult,
  LlmProfile,
  NovaAdaptBridgePlan,
  NovaAdaptBridgeWorkflow,
  ProcessSignal,
  RemoteFileEntry,
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

function normalizeRemoteAgentName(value: string): string {
  return value.trim().toLowerCase();
}

function remoteWorkflowMatchesAgentName(workflow: NovaAdaptBridgeWorkflow, name: string): boolean {
  const normalizedName = normalizeRemoteAgentName(name);
  if (!normalizedName) {
    return false;
  }
  const contextName =
    typeof workflow.context.agent_name === "string" ? normalizeRemoteAgentName(workflow.context.agent_name) : "";
  if (contextName && contextName === normalizedName) {
    return true;
  }
  const objective = normalizeRemoteAgentName(workflow.objective);
  return objective.includes(normalizedName);
}

function remotePlanMatchesAgentName(plan: NovaAdaptBridgePlan, name: string): boolean {
  const normalizedName = normalizeRemoteAgentName(name);
  if (!normalizedName) {
    return false;
  }
  return normalizeRemoteAgentName(plan.objective).includes(normalizedName);
}

function canApproveRemotePlanStatus(status: string): boolean {
  return status.trim().toLowerCase() === "pending";
}

function canRejectRemotePlanStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "pending" || normalized === "approved";
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

function isLocalRuntimeHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "0.0.0.0" ||
    normalized === "::1"
  );
}

function resolveRuntimeLlmProfile(
  profile: LlmProfile | null,
  server: ServerProfile | null
): LlmProfile | null {
  if (!profile || profile.kind !== "ollama" || !server?.baseUrl) {
    return profile;
  }
  try {
    const profileUrl = new URL(normalizeBaseUrl(profile.baseUrl || "http://localhost:11434"));
    if (!isLocalRuntimeHost(profileUrl.hostname)) {
      return profile;
    }
    const serverUrl = new URL(normalizeBaseUrl(server.baseUrl));
    const nextUrl = new URL(profileUrl.toString());
    nextUrl.protocol = serverUrl.protocol;
    nextUrl.hostname = serverUrl.hostname;
    nextUrl.port = profileUrl.port || "11434";
    return {
      ...profile,
      baseUrl: nextUrl.toString().replace(/\/$/, ""),
    };
  } catch {
    return profile;
  }
}

type SpeechOutputModule = {
  speak: (text: string, options?: Record<string, unknown>) => void;
  stop?: () => void;
  isSpeakingAsync?: () => Promise<boolean>;
  getAvailableVoicesAsync?: () => Promise<
    Array<{
      identifier: string;
      name: string;
      language: string;
      quality?: string;
    }>
  >;
};

let speechOutputModuleCache: SpeechOutputModule | null | undefined;

function getSpeechOutputModule(): SpeechOutputModule | null {
  if (speechOutputModuleCache !== undefined) {
    return speechOutputModuleCache;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const expoModulesCore = require("expo-modules-core") as {
      requireOptionalNativeModule?: (moduleName: string) => unknown;
    };
    const nativeSpeechModule = expoModulesCore.requireOptionalNativeModule?.("ExpoSpeech");
    if (!nativeSpeechModule) {
      speechOutputModuleCache = null;
      return null;
    }
    // Lazy require keeps older dev-client builds from crashing if the module
    // has not been compiled into the installed binary yet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const speechModule = require("expo-speech") as SpeechOutputModule;
    speechOutputModuleCache = speechModule;
    return speechModule;
  } catch {
    speechOutputModuleCache = null;
    return null;
  }
}

function summarizeNovaReplyForSpeech(value: string): string {
  const compact = value
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!compact) {
    return "";
  }
  const sentences = compact
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const spoken = (sentences.slice(0, 3).join(" ") || compact).trim();
  if (spoken.length <= 420) {
    return spoken;
  }
  return `${spoken.slice(0, 417).trimEnd()}...`;
}

function selectPreferredNovaVoice(
  voices: Array<{ identifier: string; name: string; language: string; quality?: string }>,
  preferredId: string
): string {
  const normalizedPreferredId = preferredId.trim();
  if (normalizedPreferredId && voices.some((voice) => voice.identifier === normalizedPreferredId)) {
    return normalizedPreferredId;
  }

  const preferredVoice = [...voices].sort((a, b) => scoreNovaVoice(b) - scoreNovaVoice(a) || a.name.localeCompare(b.name))[0];

  return preferredVoice?.identifier || "";
}

const FEMALE_NOVA_VOICE_HINTS = [
  "ava",
  "samantha",
  "allison",
  "susan",
  "karen",
  "moira",
  "tessa",
  "victoria",
  "fiona",
  "veena",
  "serena",
  "joelle",
  "nora",
  "amelie",
  "paulina",
  "monica",
  "siri voice 4",
  "siri female",
];

const MALE_NOVA_VOICE_HINTS = [
  "alex",
  "daniel",
  "oliver",
  "thomas",
  "fred",
  "aaron",
  "arthur",
  "siri voice 2",
  "siri male",
];

function includesVoiceHint(name: string, hints: string[]): boolean {
  const normalized = name.trim().toLowerCase();
  return hints.some((hint) => normalized.includes(hint));
}

function isLikelyFemaleNovaVoice(voice: { name: string }): boolean {
  const normalizedName = voice.name.trim().toLowerCase();
  return /\bfemale\b/.test(normalizedName) || includesVoiceHint(normalizedName, FEMALE_NOVA_VOICE_HINTS);
}

function scoreNovaVoice(voice: { name: string; language: string; quality?: string }): number {
  let score = 0;
  const normalizedLanguage = String(voice.language || "").trim().toLowerCase();
  const normalizedQuality = String(voice.quality || "").trim().toLowerCase();
  const normalizedName = voice.name.trim().toLowerCase();

  if (isLikelyFemaleNovaVoice(voice)) {
    score += 240;
  }
  if (/\bfemale\b/.test(normalizedName)) {
    score += 120;
  }
  if (includesVoiceHint(normalizedName, MALE_NOVA_VOICE_HINTS) || /\bmale\b/.test(normalizedName)) {
    score -= 180;
  }
  if (/^en[-_]?us/.test(normalizedLanguage)) {
    score += 90;
  } else if (/^en/.test(normalizedLanguage)) {
    score += 60;
  }
  if (normalizedQuality === "enhanced") {
    score += 80;
  }

  return score;
}

function filterNovaSpeechVoices(
  voices: Array<{ identifier: string; name: string; language: string; quality?: string }>
): Array<{ identifier: string; name: string; language: string; quality?: string }> {
  const femaleVoices = voices.filter((voice) => isLikelyFemaleNovaVoice(voice));
  return femaleVoices.length ? femaleVoices : voices;
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function summarizeSessionDelta(after: string, before: string): string {
  const delta = (after.startsWith(before) ? after.slice(before.length) : after).trim();
  if (!delta) {
    return "";
  }
  return stripAnsi(delta)
    .replace(/\[LLM Prompt\][\s\S]*?(?=\[LLM Reply\]|\[LLM Prompt\]|$)/g, "")
    .replace(/\[LLM Reply\]\s*/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 220);
}

function devNovaLog(...args: Array<unknown>) {
  if (__DEV__) {
    console.log("[Nova]", ...args);
  }
}

function devVoiceUiLog(...args: Array<unknown>) {
  if (__DEV__) {
    console.log("[VoiceUI]", ...args);
  }
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

function summarizeNovaVoiceError(message: string): string {
  const normalized = message.trim().toLowerCase();
  if (!normalized) {
    return "Voice retrying";
  }
  if (/no speech|no transcript/.test(normalized)) {
    return "Voice retrying: no speech";
  }
  if (/network|timeout|http \d+/.test(normalized)) {
    return "Voice retrying: network";
  }
  if (/permission/.test(normalized)) {
    return "Voice permission needed";
  }
  if (/unavailable in this build|unavailable on this device/.test(normalized)) {
    return "Voice unavailable";
  }
  return "Voice retrying";
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
  const [agentsAutoEnableFallbackServerId, setAgentsAutoEnableFallbackServerId] = useState<string | null>(null);
  const [appStateStatus, setAppStateStatus] = useState(AppState.currentState);
  const simpleMode = true;
  const [homeHubVisible, setHomeHubVisible] = useState<boolean>(false);
  const [pageMenuVisible, setPageMenuVisible] = useState<boolean>(false);
  const [showLaunchIntro, setShowLaunchIntro] = useState<boolean>(true);
  const [novaHandsFreeEnabled, setNovaHandsFreeEnabled] = useState<boolean>(false);
  const [novaConversationModeEnabled, setNovaConversationModeEnabled] = useState<boolean>(false);
  const [novaWakePhrase, setNovaWakePhrase] = useState<string>(DEFAULT_NOVA_WAKE_PHRASE);
  const [novaConversationIdleMs, setNovaConversationIdleMs] = useState<number>(DEFAULT_NOVA_CONVERSATION_IDLE_MS);
  const [novaSpeakRepliesEnabled, setNovaSpeakRepliesEnabled] = useState<boolean>(true);
  const [novaSpeechVoiceId, setNovaSpeechVoiceId] = useState<string>("");
  const [novaSpeechVoices, setNovaSpeechVoices] = useState<Array<{ identifier: string; name: string; language: string; quality?: string }>>([]);
  const [novaVoiceModeActive, setNovaVoiceModeActive] = useState<boolean>(false);
  const [novaOpenRequestToken, setNovaOpenRequestToken] = useState<number>(0);
  const [novaAlwaysListeningEnabled, setNovaAlwaysListeningEnabled] = useState<boolean>(false);
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
  const novaVoiceLoopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const novaVoiceStopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const novaConversationIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const novaRecordingSilenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const novaWalkieHoldActiveRef = useRef<boolean>(false);
  const startNovaVoiceCaptureRef = useRef<(mode?: "wake" | "conversation" | "walkie") => void>(() => undefined);
  const stopVoiceCaptureIntoNovaRef = useRef<() => Promise<boolean>>(async () => false);
  const novaVoiceSettingsLoadedRef = useRef<boolean>(false);
  const novaAlwaysListeningEnabledRef = useRef<boolean>(novaAlwaysListeningEnabled);
  const novaHandsFreeEnabledRef = useRef<boolean>(novaHandsFreeEnabled);
  const novaConversationModeEnabledRef = useRef<boolean>(novaConversationModeEnabled);
  const novaWakePhraseRef = useRef<string>(novaWakePhrase);
  const novaConversationIdleMsRef = useRef<number>(novaConversationIdleMs);
  const novaSpeakRepliesEnabledRef = useRef<boolean>(novaSpeakRepliesEnabled);
  const novaSpeechVoiceIdRef = useRef<string>(novaSpeechVoiceId);
  const novaVoiceModeActiveRef = useRef<boolean>(novaVoiceModeActive);
  const novaListeningModeRef = useRef<"wake" | "conversation" | "walkie">("wake");
  const pendingNovaListenModeRef = useRef<"wake" | "conversation" | "walkie" | null>(null);
  const appOpenTrackedRef = useRef<boolean>(false);
  const crossServerWatchRulesRef = useRef<Record<string, Record<string, WatchRule>>>({});
  const lastActivityAtRef = useRef<number>(Date.now());
  const homeHubInitializedRef = useRef<boolean>(false);

  const setReady = useCallback((text: string = "Ready") => {
    setStatus({ text, error: false });
  }, []);

  const setError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ text: message, error: true });
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadNovaVoiceSettings() {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_NOVA_VOICE_SETTINGS);
        if (!mounted) {
          return;
        }
        if (!raw) {
          setNovaAlwaysListeningEnabled(false);
          setNovaHandsFreeEnabled(false);
          setNovaWakePhrase(DEFAULT_NOVA_WAKE_PHRASE);
          setNovaConversationIdleMs(DEFAULT_NOVA_CONVERSATION_IDLE_MS);
          setNovaSpeakRepliesEnabled(true);
          setNovaSpeechVoiceId("");
          return;
        }
        const parsed = JSON.parse(raw) as Partial<{
          alwaysListeningEnabled: boolean;
          handsFreeEnabled: boolean;
          wakePhrase: string;
          conversationIdleMs: number;
          speakRepliesEnabled: boolean;
          speechVoiceId: string;
        }>;
        setNovaAlwaysListeningEnabled(Boolean(parsed.alwaysListeningEnabled));
        setNovaHandsFreeEnabled(Boolean(parsed.handsFreeEnabled));
        setNovaWakePhrase(normalizeNovaWakePhrase(parsed.wakePhrase));
        setNovaConversationIdleMs(normalizeNovaConversationIdleMs(parsed.conversationIdleMs));
        setNovaSpeakRepliesEnabled(parsed.speakRepliesEnabled !== false);
        setNovaSpeechVoiceId(typeof parsed.speechVoiceId === "string" ? parsed.speechVoiceId.trim() : "");
      } catch {
        if (mounted) {
          setNovaAlwaysListeningEnabled(false);
          setNovaHandsFreeEnabled(false);
          setNovaWakePhrase(DEFAULT_NOVA_WAKE_PHRASE);
          setNovaConversationIdleMs(DEFAULT_NOVA_CONVERSATION_IDLE_MS);
          setNovaSpeakRepliesEnabled(true);
          setNovaSpeechVoiceId("");
        }
      } finally {
        if (mounted) {
          novaVoiceSettingsLoadedRef.current = true;
        }
      }
    }

    void loadNovaVoiceSettings();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!novaVoiceSettingsLoadedRef.current) {
      return;
    }
    void SecureStore.setItemAsync(
      STORAGE_NOVA_VOICE_SETTINGS,
      JSON.stringify({
        alwaysListeningEnabled: novaAlwaysListeningEnabled,
        handsFreeEnabled: novaHandsFreeEnabled,
        wakePhrase: normalizeNovaWakePhrase(novaWakePhrase),
        conversationIdleMs: normalizeNovaConversationIdleMs(novaConversationIdleMs),
        speakRepliesEnabled: novaSpeakRepliesEnabled,
        speechVoiceId: novaSpeechVoiceId.trim() || "",
      })
    );
  }, [novaAlwaysListeningEnabled, novaConversationIdleMs, novaHandsFreeEnabled, novaSpeakRepliesEnabled, novaSpeechVoiceId, novaWakePhrase]);

  useEffect(() => {
    novaAlwaysListeningEnabledRef.current = novaAlwaysListeningEnabled;
  }, [novaAlwaysListeningEnabled]);

  useEffect(() => {
    novaHandsFreeEnabledRef.current = novaHandsFreeEnabled;
  }, [novaHandsFreeEnabled]);

  useEffect(() => {
    novaConversationModeEnabledRef.current = novaConversationModeEnabled;
  }, [novaConversationModeEnabled]);

  useEffect(() => {
    novaWakePhraseRef.current = novaWakePhrase;
  }, [novaWakePhrase]);

  useEffect(() => {
    novaConversationIdleMsRef.current = novaConversationIdleMs;
  }, [novaConversationIdleMs]);

  useEffect(() => {
    novaSpeakRepliesEnabledRef.current = novaSpeakRepliesEnabled;
  }, [novaSpeakRepliesEnabled]);

  useEffect(() => {
    novaSpeechVoiceIdRef.current = novaSpeechVoiceId;
  }, [novaSpeechVoiceId]);

  useEffect(() => {
    let mounted = true;

    async function loadNovaSpeechVoices() {
      const speechModule = getSpeechOutputModule();
      if (!speechModule?.getAvailableVoicesAsync) {
        if (mounted) {
          setNovaSpeechVoices([]);
        }
        return;
      }

      try {
        const voices = await speechModule.getAvailableVoicesAsync();
        if (!mounted) {
          return;
        }
        const normalizedVoices = filterNovaSpeechVoices(
          voices
          .filter((voice) => typeof voice.identifier === "string" && typeof voice.name === "string")
          .sort((a, b) => {
            const scoreDelta = scoreNovaVoice(b) - scoreNovaVoice(a);
            if (scoreDelta !== 0) {
              return scoreDelta;
            }
            return a.name.localeCompare(b.name);
          })
        );
        setNovaSpeechVoices(normalizedVoices);
        const preferredVoiceId = selectPreferredNovaVoice(normalizedVoices, novaSpeechVoiceIdRef.current);
        if (preferredVoiceId !== novaSpeechVoiceIdRef.current) {
          setNovaSpeechVoiceId(preferredVoiceId);
        }
      } catch {
        if (mounted) {
          setNovaSpeechVoices([]);
        }
      }
    }

    void loadNovaSpeechVoices();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    novaVoiceModeActiveRef.current = novaVoiceModeActive;
  }, [novaVoiceModeActive]);

  const markActivity = useCallback(() => {
    lastActivityAtRef.current = Date.now();
  }, []);

  const requestNovaOverlayOpen = useCallback(() => {
    setHomeHubVisible(false);
    setPageMenuVisible(false);
    setNovaOpenRequestToken((current) => current + 1);
  }, []);

  const { loading: onboardingLoading, completed: onboardingCompleted, completeOnboarding } = useOnboarding();
  const { loading: lockLoading, requireBiometric, unlocked, setRequireBiometric, unlock, lock, forceLock } = useBiometricLock();
  const { loading: tutorialLoading, done: tutorialDone, finish: finishTutorial } = useTutorial(onboardingCompleted && unlocked);

  useEffect(() => {
    if (onboardingLoading || !unlocked || !onboardingCompleted || homeHubInitializedRef.current) {
      return;
    }
    homeHubInitializedRef.current = true;
    setHomeHubVisible(true);
  }, [onboardingCompleted, onboardingLoading, unlocked]);
  const {
    loading: teamLoading,
    busy: teamBusy,
    identity: teamIdentity,
    teamServers,
    teamMembers,
    teamInvites,
    teamSsoProviders,
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
    updateSsoProvider: updateTeamSsoProvider,
    requestFleetApproval,
    approveFleetApproval,
    denyFleetApproval,
    claimFleetExecution,
    completeFleetExecution,
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
  const { sendPrompt, sendPromptDetailed, sendPromptStream } = useLlmClient();

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
    requestCloudExport: requestCloudAuditExport,
    refreshCloudExports: refreshCloudAuditExports,
    retryCloudExport: retryCloudAuditExport,
    deleteCloudExport: deleteCloudAuditExport,
    lastCloudExportJob: lastCloudAuditExportJob,
    cloudExportJobs: cloudAuditExportJobs,
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
  const poolConnectionsRef = useRef(poolConnections);

  useEffect(() => {
    poolConnectionsRef.current = poolConnections;
  }, [poolConnections]);

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
  const runtimeActiveProfile = useMemo(
    () => resolveRuntimeLlmProfile(activeProfile, activeServer),
    [activeProfile, activeServer]
  );
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
    (
      command: string,
      context: string,
      scope?: {
        serverId?: string;
        serverName?: string;
        session?: string;
      }
    ) => {
      const blockedPattern = findBlockedCommandPattern(command, teamSettings.commandBlocklist);
      if (!blockedPattern) {
        return;
      }
      recordAuditEvent({
        action: "command_dangerous_denied",
        serverId: scope?.serverId ?? focusedServerId ?? "",
        serverName: scope?.serverName ?? activeServer?.name ?? "",
        session: scope?.session ?? "",
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
        auditScope?: {
          serverId?: string;
          serverName?: string;
          session?: string;
        };
      } = {}
    ) => {
      if (!options.skipFocusedServerCheck && focusedServerId) {
        assertServerWritable(focusedServerId, context);
      }
      assertCommandAllowed(command, context, options.auditScope);
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
    setStartCwd(DEFAULT_CWD);
  }, [focusedServerId]);

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
    if (startKind === "shell" && trimmedPrompt) {
      const approved = await requestDangerApproval(trimmedPrompt, "Create session prompt", {
        auditScope: {
          serverId: focusedServerId,
          serverName: activeServer.name,
          session: "",
        },
      });
      if (!approved) {
        throw new Error("Session creation cancelled.");
      }
    }
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
    requestDangerApproval,
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
      const trimmedPrompt = prompt.trim();
      if (kind === "shell" && trimmedPrompt) {
        const approved = await requestDangerApproval(trimmedPrompt, "Create session prompt", {
          skipFocusedServerCheck: true,
          auditScope: {
            serverId,
            serverName: targetConnection.server.name,
            session: "",
          },
        });
        if (!approved) {
          throw new Error("Session creation cancelled.");
        }
      }
      const session = await createPoolSession(
        serverId,
        DEFAULT_CWD,
        kind,
        trimmedPrompt,
        false
      );
      recordAuditEvent({
        action: "session_created",
        serverId,
        serverName: targetConnection.server.name,
        session,
        detail: `kind=${kind}`,
      });
      return session;
    },
    [assertServerWritable, createPoolSession, markActivity, poolConnections, recordAuditEvent, requestDangerApproval]
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
      markActivity();
      assertServerWritable(focusedServerId, "Close session");
      await stopPoolSession(focusedServerId, session);
      recordAuditEvent({
        action: "command_sent",
        serverId: focusedServerId,
        serverName: activeServer?.name || "",
        session,
        detail: "close_session",
      });
    },
    [activeServer?.name, assertServerWritable, focusedServerId, markActivity, recordAuditEvent, stopPoolSession]
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
    liveRecognitionActive: liveVoiceRecognitionActive,
    lastTranscript: voiceTranscript,
    lastError: voiceError,
    meteringDb: voiceMeteringDb,
    permissionStatus: voicePermissionStatus,
    requestCapturePermission: requestVoicePermission,
    startLiveRecognition,
    startCapture: startVoiceCapture,
    stopCapture: stopVoiceCapture,
    stopLiveRecognition,
    stopAndTranscribe: stopVoiceCaptureAndTranscribe,
    prepareSpeechOutput,
    setLastTranscript: setVoiceTranscript,
  } = useVoiceCapture({ activeServer, connected });
  const voiceRecordingRef = useRef<boolean>(voiceRecording);
  const voiceBusyRef = useRef<boolean>(voiceBusy);
  const liveVoiceRecognitionActiveRef = useRef<boolean>(liveVoiceRecognitionActive);

  useEffect(() => {
    voiceRecordingRef.current = voiceRecording;
  }, [voiceRecording]);

  useEffect(() => {
    voiceBusyRef.current = voiceBusy;
  }, [voiceBusy]);

  useEffect(() => {
    liveVoiceRecognitionActiveRef.current = liveVoiceRecognitionActive;
  }, [liveVoiceRecognitionActive]);

  const remoteOpenSessions = useMemo(
    () => openSessions.filter((session) => !localAiSessions.includes(session)),
    [localAiSessions, openSessions]
  );

  const novaListeningActive =
    unlocked &&
    appStateStatus === "active" &&
    route !== "glasses" &&
    (liveVoiceRecognitionActive || voiceRecording);

  const activeNovaSpeechVoiceIndex = useMemo(
    () => novaSpeechVoices.findIndex((voice) => voice.identifier === novaSpeechVoiceId),
    [novaSpeechVoiceId, novaSpeechVoices]
  );
  const activeNovaSpeechVoiceLabel =
    activeNovaSpeechVoiceIndex >= 0
      ? `${novaSpeechVoices[activeNovaSpeechVoiceIndex]?.name || "System"}`
      : "System default";

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
    setEntries: setFileEntries,
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
    let claimedFleetExecution: { approvalId: string; executionToken: string } | null = null;

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
        const claimedApproval = await claimFleetExecution(matchingApproval.id);
        const executionToken = claimedApproval?.executionToken?.trim() || "";
        if (!executionToken) {
          throw new Error("Fleet approval claim did not return an execution token.");
        }
        claimedFleetExecution = {
          approvalId: matchingApproval.id,
          executionToken,
        };
        recordAuditEvent({
          action: "fleet_execution_claimed",
          serverId: "",
          serverName: "fleet",
          detail: `fleet_execution_claimed=${matchingApproval.id}`,
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
        auditScope: {
          serverId: "",
          serverName: "fleet",
          session: "",
        },
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
      if (claimedFleetExecution) {
        const status: "succeeded" | "failed" = okCount === selectedServers.length ? "succeeded" : "failed";
        const failedServers = settled.filter((entry) => !entry.ok).map((entry) => entry.serverName).slice(0, 6);
        const summary = `${status} ok=${okCount}/${selectedServers.length}${
          failedServers.length > 0 ? ` failed=${failedServers.join(",")}` : ""
        }`;
        await completeFleetExecution({
          approvalId: claimedFleetExecution.approvalId,
          executionToken: claimedFleetExecution.executionToken,
          status,
          summary,
        });
        recordAuditEvent({
          action: "fleet_execution_completed",
          serverId: "",
          serverName: "fleet",
          detail: `fleet_execution_completed=${claimedFleetExecution.approvalId}:${status}`,
          approved: status === "succeeded",
        });
      }
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
    claimFleetExecution,
    completeFleetExecution,
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

      if (!runtimeActiveProfile) {
        throw new Error("No active LLM profile selected. Configure one in the LLMs tab.");
      }

      setPoolDrafts(serverId, (prev) => ({ ...prev, [session]: "" }));
      const baseTail = poolConnectionsRef.current.get(serverId)?.tails[session] || "";
      const prefix = `${baseTail}\\n\\n[LLM Prompt]\\n${cleanPrompt}\\n\\n[LLM Reply]\\n`;
      setPoolTails(serverId, (prev) => ({ ...prev, [session]: prefix }));

      const result = await sendPromptStream(runtimeActiveProfile, cleanPrompt, {
        onTextDelta: (_delta, fullText) => {
          setPoolTails(serverId, (prev) => ({ ...prev, [session]: `${prefix}${fullText}` }));
        },
      });
      setPoolTails(serverId, (prev) => ({ ...prev, [session]: `${prefix}${result.text}\\n` }));
      return cleanPrompt;
    },
    [runtimeActiveProfile, sendPromptStream, setPoolDrafts, setPoolTails]
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
    activeProfile: runtimeActiveProfile,
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
      markActivity();
      assertServerWritable(serverId, "Send command");
      assertCommandAllowed(trimmed, `Send to ${session}`, {
        serverId,
        serverName: targetConnection.server.name,
        session,
      });

      const focusedTarget = scopedServerId === serverId;
      const localSession = targetConnection.localAiSessions.includes(session);

      if (focusedTarget && sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only to send commands.`);
      }

      const routeToExternal = mode === "ai" && (localSession || !targetConnection.capabilities.codex);
      devNovaLog("sendTextToServerSession", {
        serverId,
        session,
        mode,
        clearDraft,
        localSession,
        routeToExternal,
        connected: targetConnection.connected,
        hasCodex: targetConnection.capabilities.codex,
        commandPreview: trimmed.slice(0, 160),
      });
      if (routeToExternal) {
        const sent = await sendViaExternalLlmToServer(serverId, session, trimmed);
        if (sent) {
          if (focusedTarget) {
            await addCommand(session, sent);
          }
          recordAuditEvent({
            action: "command_sent",
            serverId,
            serverName: targetConnection.server.name,
            session,
            detail: `${mode}:${trimmed.slice(0, 400)}`,
          });
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
      devNovaLog("sendTextToServerSession:sent", {
        serverId,
        session,
        mode,
        commandPreview: trimmed.slice(0, 160),
      });
      if (focusedTarget) {
        await addCommand(session, trimmed);
      }
      recordAuditEvent({
        action: "command_sent",
        serverId,
        serverName: targetConnection.server.name,
        session,
        detail: `${mode}:${trimmed.slice(0, 400)}`,
      });
    },
    [
      addCommand,
      assertCommandAllowed,
      assertServerWritable,
      markActivity,
      poolConnections,
      queueSessionCommand,
      recordAuditEvent,
      scopedServerId,
      sendPoolCommand,
      sendViaExternalLlmToServer,
      sessionReadOnly,
      setPoolDrafts,
    ]
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

  const waitForSessionOutput = useCallback(
    async ({
      serverId,
      session,
      beforeTail,
      maxWaitMs = 5000,
      pollRemote = true,
    }: {
      serverId: string;
      session: string;
      beforeTail: string;
      maxWaitMs?: number;
      pollRemote?: boolean;
    }): Promise<string> => {
      const deadline = Date.now() + maxWaitMs;

      while (Date.now() < deadline) {
        const connection = poolConnectionsRef.current.get(serverId);
        if (!connection) {
          break;
        }

        if (pollRemote && !connection.localAiSessions.includes(session)) {
          try {
            await fetchPoolTail(serverId, session, false);
          } catch {
            // Best-effort polling only.
          }
        }

        await wait(150);
        const latestTail = poolConnectionsRef.current.get(serverId)?.tails[session] || "";
        if (latestTail !== beforeTail && latestTail.trim()) {
          return latestTail;
        }

        await wait(250);
      }

      return poolConnectionsRef.current.get(serverId)?.tails[session] || beforeTail;
    },
    [fetchPoolTail]
  );

  const stopServerSession = useCallback(
    async (serverId: string, session: string) => {
      const targetConnection = poolConnections.get(serverId);
      if (!targetConnection || !targetConnection.connected) {
        throw new Error("Target server is disconnected.");
      }
      markActivity();
      assertServerWritable(serverId, "Close session");
      if (scopedServerId === serverId && sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only before closing the session.`);
      }
      await stopPoolSession(serverId, session);
      recordAuditEvent({
        action: "command_sent",
        serverId,
        serverName: targetConnection.server.name,
        session,
        detail: "close_session",
      });
    },
    [assertServerWritable, markActivity, poolConnections, recordAuditEvent, scopedServerId, sessionReadOnly, stopPoolSession]
  );

  const sendServerSessionControlChar = useCallback(
    async (serverId: string, session: string, char: string) => {
      const targetConnection = poolConnections.get(serverId);
      if (!targetConnection || !targetConnection.connected) {
        throw new Error("Target server is disconnected.");
      }
      markActivity();
      assertServerWritable(serverId, "Send control");
      if (targetConnection.localAiSessions.includes(session)) {
        throw new Error("Local LLM sessions do not support terminal control characters.");
      }
      if (scopedServerId === serverId && sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only before sending control keys.`);
      }
      await sendPoolControlChar(serverId, session, char);
      recordAuditEvent({
        action: "command_sent",
        serverId,
        serverName: targetConnection.server.name,
        session,
        detail: `control:${char}`,
      });
    },
    [assertServerWritable, markActivity, poolConnections, recordAuditEvent, scopedServerId, sendPoolControlChar, sessionReadOnly]
  );

  type AgentServerAction =
    | { kind: "approve" }
    | { kind: "deny" }
    | { kind: "create"; name: string; goal?: string }
    | { kind: "remove"; name: string }
    | { kind: "set_status"; name: string; status: "idle" | "monitoring" | "executing" | "waiting_approval" }
    | { kind: "set_goal"; name: string; goal: string }
    | { kind: "queue_command"; name: string; command: string };
  const buildRemoteAgentObjective = useCallback((action: AgentServerAction): string => {
    if (action.kind === "create") {
      const name = action.name.trim();
      const goal = action.goal?.trim() || "";
      return goal ? `Create agent "${name}" with goal: ${goal}` : `Create agent "${name}"`;
    }
    if (action.kind === "remove") {
      return `Remove agent "${action.name.trim()}"`;
    }
    if (action.kind === "set_status") {
      return `Set agent "${action.name.trim()}" status to ${action.status}`;
    }
    if (action.kind === "set_goal") {
      return `Update agent "${action.name.trim()}" goal to: ${action.goal.trim()}`;
    }
    if (action.kind === "queue_command") {
      return `Run command for agent "${action.name.trim()}": ${action.command.trim()}`;
    }
    return "";
  }, []);
  const executeRemoteAgentServerAction = useCallback(
    async (serverId: string, action: AgentServerAction): Promise<string[] | null> => {
      const targetServer = servers.find((server) => server.id === serverId) || null;
      if (!targetServer) {
        throw new Error("Target server is not available.");
      }

      const snapshot = await fetchNovaAdaptBridgeSnapshot(targetServer, {
        planLimit: 50,
        jobLimit: 25,
        workflowLimit: 50,
      });
      if (!snapshot.supported || !snapshot.runtimeAvailable) {
        return null;
      }

      if (action.kind === "approve") {
        const pendingPlans = snapshot.plans.filter((plan) => canApproveRemotePlanStatus(plan.status));
        if (pendingPlans.length === 0) {
          return [];
        }
        for (const plan of pendingPlans) {
          await approveNovaAdaptBridgePlanAsync(targetServer, plan.id);
        }
        return pendingPlans.map((plan) => plan.id);
      }

      if (action.kind === "deny") {
        const pendingPlans = snapshot.plans.filter((plan) => canRejectRemotePlanStatus(plan.status));
        if (pendingPlans.length === 0) {
          return [];
        }
        for (const plan of pendingPlans) {
          await rejectNovaAdaptBridgePlan(targetServer, plan.id, "Rejected from NovaRemote agent controls");
        }
        return pendingPlans.map((plan) => plan.id);
      }

      if (action.kind === "create") {
        const created = await createNovaAdaptBridgePlan(targetServer, buildRemoteAgentObjective(action), {
          strategy: "single",
        });
        return created ? [created.id] : [];
      }

      if (action.kind === "remove") {
        const matchingPendingPlans = snapshot.plans.filter(
          (plan) => canRejectRemotePlanStatus(plan.status) && remotePlanMatchesAgentName(plan, action.name)
        );
        if (matchingPendingPlans.length > 0) {
          for (const plan of matchingPendingPlans) {
            await rejectNovaAdaptBridgePlan(targetServer, plan.id, `Removed agent ${action.name.trim()} from NovaRemote`);
          }
          return matchingPendingPlans.map((plan) => plan.id);
        }
        const removalPlan = await createNovaAdaptBridgePlan(targetServer, buildRemoteAgentObjective(action), {
          strategy: "single",
        });
        return removalPlan ? [removalPlan.id] : [];
      }

      if (action.kind === "set_status") {
        const matchingWorkflows = snapshot.workflows.filter((workflow) => remoteWorkflowMatchesAgentName(workflow, action.name));
        if ((action.status === "executing" || action.status === "monitoring") && matchingWorkflows.length > 0) {
          const resumed: string[] = [];
          for (const workflow of matchingWorkflows) {
            if (workflow.status.trim().toLowerCase() === "running") {
              resumed.push(workflow.workflowId);
              continue;
            }
            const ok = await resumeNovaAdaptBridgeWorkflow(targetServer, workflow.workflowId);
            if (ok) {
              resumed.push(workflow.workflowId);
            }
          }
          if (resumed.length > 0) {
            return resumed;
          }
        }
        const statusPlan = await createNovaAdaptBridgePlan(targetServer, buildRemoteAgentObjective(action), {
          strategy: "single",
        });
        return statusPlan ? [statusPlan.id] : [];
      }

      if (action.kind === "set_goal") {
        const goalPlan = await createNovaAdaptBridgePlan(targetServer, buildRemoteAgentObjective(action), {
          strategy: "single",
        });
        return goalPlan ? [goalPlan.id] : [];
      }

      const commandPlan = await createNovaAdaptBridgePlan(targetServer, buildRemoteAgentObjective(action), {
        strategy: "single",
      });
      if (!commandPlan) {
        return [];
      }
      await approveNovaAdaptBridgePlanAsync(targetServer, commandPlan.id);
      return [commandPlan.id];
    },
    [buildRemoteAgentObjective, servers]
  );
  const runAgentServerAction = useCallback(
    async (serverId: string, action: AgentServerAction): Promise<string[]> => {
      const targetServerId = serverId.trim();
      if (!targetServerId) {
        return [];
      }
      if (!servers.some((server) => server.id === targetServerId)) {
        throw new Error("Target server is not available.");
      }
      const remoteResult = await executeRemoteAgentServerAction(targetServerId, action);
      if (remoteResult !== null) {
        return remoteResult;
      }
      const fallback = buildAgentRuntimeFallback({
        targetServerId,
        focusedServerId,
      });
      if (fallback.focusedServerId) {
        setPoolFocusedServerId(fallback.focusedServerId);
      }
      setAgentsAutoEnableFallbackServerId(targetServerId);
      setRoute(fallback.route);
      throw new Error(fallback.message);
    },
    [executeRemoteAgentServerAction, focusedServerId, servers, setPoolFocusedServerId]
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
    async (serverId: string, name: string, goal?: string): Promise<string[]> =>
      await runAgentServerAction(serverId, { kind: "create", name, goal }),
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
    async (serverIds: string[], name: string, goal?: string): Promise<string[]> => {
      const created: string[] = [];
      for (const serverId of uniqueServerIds(serverIds)) {
        const next = await createAgentForServer(serverId, name, goal);
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

  const buildNovaAssistantContext = useCallback((): NovaAssistantRuntimeContext => {
    return {
      route,
      focusedServerId,
      focusedServerName: activeServer?.name || null,
      focusedSession,
      activeProfileName: activeProfile?.name || null,
      files: {
        currentPath: currentPath || activeServer?.defaultCwd || "",
        includeHidden,
        selectedFilePath,
        selectedContentPreview: selectedContent.slice(0, 1200),
        entries: fileEntries.slice(0, 30).map((entry) => ({
          name: entry.name,
          path: entry.path,
          isDir: entry.is_dir,
        })),
      },
      team: {
        loggedIn: Boolean(teamIdentity),
        teamName: teamIdentity?.teamName || null,
        role: teamIdentity?.role || null,
        cloudDashboardUrl: cloudDashboardUrl || null,
        auditPendingCount: pendingAuditEvents,
      },
      processes: {
        available: capabilities.processes,
        busy: processesBusy,
        items: processes.slice(0, 20).map((process) => ({
          pid: process.pid,
          name: process.name,
          cpuPercent: process.cpu_percent,
          memPercent: process.mem_percent,
          command: process.command,
        })),
      },
      servers: brokeredServers.map((server) => {
        const connection = poolConnections.get(server.id);
        const sessionNames = Array.from(new Set([...(connection?.openSessions || []), ...(connection?.allSessions || [])]));
        return {
          id: server.id,
          name: server.name,
          connected: Boolean(connection?.connected),
          vmHost: server.vmHost,
          vmType: server.vmType,
          vmName: server.vmName,
          vmId: server.vmId,
          hasPortainerUrl: Boolean(server.portainerUrl),
          hasProxmoxUrl: Boolean(server.proxmoxUrl),
          hasGrafanaUrl: Boolean(server.grafanaUrl),
          hasSshFallback: Boolean(server.sshHost),
          sessions: sessionNames.map((session) => ({
            session,
            mode:
              connection?.sendModes[session] ||
              (connection?.localAiSessions.includes(session) || isLikelyAiSession(session) ? "ai" : "shell"),
            localAi: Boolean(connection?.localAiSessions.includes(session)),
            live: Boolean(connection?.streamLive[session]),
          })),
        };
      }),
      settings: {
        glassesEnabled: glassesMode.enabled,
        glassesVoiceAutoSend: glassesMode.voiceAutoSend,
        glassesVoiceLoop: glassesMode.voiceLoop,
        glassesWakePhraseEnabled: glassesMode.wakePhraseEnabled,
        glassesMinimalMode: glassesMode.minimalMode,
        glassesTextScale: glassesMode.textScale,
        startAiEngine,
        startKind,
        poolPaused: poolLifecyclePaused,
      },
    };
  }, [
    activeProfile?.name,
    activeServer?.name,
    activeServer?.defaultCwd,
    brokeredServers,
    cloudDashboardUrl,
    capabilities.processes,
    currentPath,
    fileEntries,
    focusedServerId,
    focusedSession,
    glassesMode.enabled,
    glassesMode.minimalMode,
    glassesMode.textScale,
    glassesMode.voiceAutoSend,
    glassesMode.voiceLoop,
    glassesMode.wakePhraseEnabled,
    includeHidden,
    pendingAuditEvents,
    processes,
    processesBusy,
    poolConnections,
    poolLifecyclePaused,
    route,
    selectedContent,
    selectedFilePath,
    startAiEngine,
    startKind,
    teamIdentity,
  ]);

  const executeNovaAssistantActions = useCallback(
    async (actions: NovaAssistantAction[], context: NovaAssistantRuntimeContext): Promise<NovaAssistantExecutionResult[]> => {
      const results: NovaAssistantExecutionResult[] = [];
      const lastCreatedSessionByServerId = new Map<string, string>();
      let assistantFileServerId = context.focusedServerId;
      let assistantFilePath = context.files.currentPath;
      let assistantFileIncludeHidden = context.files.includeHidden;
      let assistantSelectedFilePath = context.files.selectedFilePath;

      const resolveServerProfileOrThrow = (serverId: string): ServerProfile => {
        const profile = brokeredServers.find((entry) => entry.id === serverId);
        if (!profile) {
          throw new Error("Could not load the target server profile.");
        }
        return profile;
      };

      const getActiveDirectoryForServer = (serverId: string): string => {
        if (assistantFileServerId === serverId) {
          return assistantFilePath;
        }
        return resolveServerProfileOrThrow(serverId).defaultCwd || "";
      };

      const getSelectedFileForServer = (serverId: string): string => {
        if (assistantFileServerId === serverId && assistantSelectedFilePath) {
          return assistantSelectedFilePath;
        }
        return "";
      };

      const countProcessEntries = (payload: unknown): number => {
        if (Array.isArray(payload)) {
          return payload.filter((entry) => entry && typeof entry === "object" && Number.isFinite(Number((entry as { pid?: unknown }).pid)))
            .length;
        }
        if (payload && typeof payload === "object") {
          const record = payload as { processes?: unknown[]; items?: unknown[] };
          if (Array.isArray(record.processes)) {
            return record.processes.length;
          }
          if (Array.isArray(record.items)) {
            return record.items.length;
          }
        }
        return 0;
      };

      const processListContainsPid = (payload: unknown, pid: number): boolean => {
        if (Array.isArray(payload)) {
          return payload.some((entry) => Number((entry as { pid?: unknown })?.pid) === pid);
        }
        if (payload && typeof payload === "object") {
          const record = payload as { processes?: unknown[]; items?: unknown[] };
          if (Array.isArray(record.processes)) {
            return record.processes.some((entry) => Number((entry as { pid?: unknown })?.pid) === pid);
          }
          if (Array.isArray(record.items)) {
            return record.items.some((entry) => Number((entry as { pid?: unknown })?.pid) === pid);
          }
        }
        return false;
      };

      const setFilesSurfaceTarget = (serverId: string) => {
        focusServer(serverId);
        setHomeHubVisible(false);
        setRoute("files");
        assistantFileServerId = serverId;
      };

      for (const action of actions) {
        devNovaLog("executeNovaAssistantAction", action);
        try {
          if (action.type === "navigate") {
            setHomeHubVisible(false);
            setRoute(action.route);
            results.push({ action: action.type, ok: true, detail: `Opened ${action.route}` });
            continue;
          }

          if (action.type === "set_pool_paused") {
            markActivity();
            if (action.paused) {
              disconnectAllServers();
              results.push({ action: action.type, ok: true, detail: "Paused the connection pool" });
            } else {
              connectAllServers();
              results.push({ action: action.type, ok: true, detail: "Resumed the connection pool" });
            }
            continue;
          }

          if (action.type === "set_preference") {
            if (action.key === "glasses.enabled") {
              setGlassesEnabled(Boolean(action.value));
            } else if (action.key === "glasses.voiceAutoSend") {
              setGlassesVoiceAutoSend(Boolean(action.value));
            } else if (action.key === "glasses.voiceLoop") {
              setGlassesVoiceLoop(Boolean(action.value));
            } else if (action.key === "glasses.wakePhraseEnabled") {
              setGlassesWakePhraseEnabled(Boolean(action.value));
            } else if (action.key === "glasses.minimalMode") {
              setGlassesMinimalMode(Boolean(action.value));
            } else if (action.key === "glasses.textScale") {
              const next = Number.parseFloat(String(action.value));
              if (!Number.isFinite(next)) {
                throw new Error("Invalid glasses text scale.");
              }
              setGlassesTextScale(next);
            } else if (action.key === "start.aiEngine") {
              const next = String(action.value).trim().toLowerCase();
              if (next !== "auto" && next !== "server" && next !== "external") {
                throw new Error("Invalid start AI engine.");
              }
              setStartAiEngine(next as AiEnginePreference);
            } else if (action.key === "start.kind") {
              const next = String(action.value).trim().toLowerCase();
              if (next !== "ai" && next !== "shell") {
                throw new Error("Invalid start session kind.");
              }
              setStartKind(next as TerminalSendMode);
            }
            results.push({ action: action.type, ok: true, detail: `Updated ${action.key}` });
            continue;
          }

          if (action.type === "team_refresh") {
            setHomeHubVisible(false);
            setRoute("team");
            markActivity();
            await refreshTeamContext();
            results.push({ action: action.type, ok: true, detail: "Refreshed team context" });
            continue;
          }

          if (action.type === "team_open_dashboard") {
            if (!cloudDashboardUrl) {
              throw new Error("No team cloud dashboard is configured.");
            }
            setHomeHubVisible(false);
            setRoute("team");
            markActivity();
            await Linking.openURL(cloudDashboardUrl);
            results.push({ action: action.type, ok: true, detail: "Opened the team dashboard" });
            continue;
          }

          if (action.type === "team_sync_audit") {
            if (!teamIdentity) {
              throw new Error("Sign into a team account first.");
            }
            setHomeHubVisible(false);
            setRoute("team");
            markActivity();
            await syncAuditNow();
            results.push({ action: action.type, ok: true, detail: "Synced the audit log" });
            continue;
          }

          if (action.type === "team_request_audit_export") {
            if (!teamIdentity) {
              throw new Error("Sign into a team account first.");
            }
            setHomeHubVisible(false);
            setRoute("team");
            markActivity();
            await requestCloudAuditExport(action.format, action.rangeHours || 168);
            results.push({
              action: action.type,
              ok: true,
              detail: `Requested a ${action.format.toUpperCase()} audit export`,
            });
            continue;
          }

          if (action.type === "team_refresh_audit_exports") {
            if (!teamIdentity) {
              throw new Error("Sign into a team account first.");
            }
            setHomeHubVisible(false);
            setRoute("team");
            markActivity();
            await refreshCloudAuditExports(20);
            results.push({ action: action.type, ok: true, detail: "Refreshed cloud audit exports" });
            continue;
          }

          const server = resolveAssistantServer(context, action.serverRef);
          if (!server) {
            throw new Error("Could not resolve the target server.");
          }
          const serverProfile = resolveServerProfileOrThrow(server.id);

          const resolveSessionOrThrow = (sessionRef?: string | null) => {
            const resolved = resolveAssistantSession(
              context,
              server,
              sessionRef,
              lastCreatedSessionByServerId.get(server.id) || null
            );
            if (!resolved) {
              throw new Error(`Could not resolve a session on ${server.name}.`);
            }
            return resolved;
          };

          if (action.type === "focus_server") {
            focusServer(server.id);
            results.push({ action: action.type, ok: true, detail: `Focused ${server.name}` });
            continue;
          }

          if (action.type === "focus_session") {
            const session = resolveSessionOrThrow(action.sessionRef);
            focusServer(server.id);
            setHomeHubVisible(false);
            setRoute("terminals");
            setFocusedSession(session.session);
            results.push({ action: action.type, ok: true, detail: `Focused ${server.name} / ${session.session}` });
            continue;
          }

          if (action.type === "create_session") {
            const session = await createSessionForServer(server.id, action.kind, action.prompt || "");
            lastCreatedSessionByServerId.set(server.id, session);
            focusServer(server.id);
            setHomeHubVisible(false);
            setRoute("terminals");
            setFocusedSession(session);
            results.push({ action: action.type, ok: true, detail: `Created ${action.kind} session ${session} on ${server.name}` });
            continue;
          }

          if (action.type === "send_command") {
            const requestedMode = action.mode || "shell";
            let session = action.sessionRef
              ? resolveAssistantSession(context, server, action.sessionRef, lastCreatedSessionByServerId.get(server.id) || null)
              : null;
            const shouldUseShellSession = requestedMode === "shell";
            if (session && shouldUseShellSession && session.mode !== "shell") {
              session = null;
            }
            if (!session && (action.createIfMissing || shouldUseShellSession)) {
              const created = await createSessionForServer(server.id, action.createKind || requestedMode || "shell");
              lastCreatedSessionByServerId.set(server.id, created);
              session = {
                session: created,
                mode: action.createKind || requestedMode || "shell",
                localAi: false,
                live: false,
              };
            }
            if (!session) {
              throw new Error(`No session matched on ${server.name}.`);
            }
            const effectiveMode = requestedMode || session.mode;
            const beforeTail = poolConnectionsRef.current.get(server.id)?.tails[session.session] || "";
            await sendServerSessionCommand(server.id, session.session, action.command, effectiveMode);
            focusServer(server.id);
            setHomeHubVisible(false);
            setRoute("terminals");
            setFocusedSession(session.session);
            const observedTail = await waitForSessionOutput({
              serverId: server.id,
              session: session.session,
              beforeTail,
              pollRemote: effectiveMode === "shell",
            });
            const observation = summarizeSessionDelta(observedTail, beforeTail);
            const detailPrefix =
              effectiveMode === "ai"
                ? `Delivered request to ${server.name} / ${session.session}`
                : `Ran command in ${server.name} / ${session.session}`;
            results.push({
              action: action.type,
              ok: true,
              detail: observation ? `${detailPrefix}; observed output: ${observation}` : `${detailPrefix}; waiting for additional output.`,
            });
            continue;
          }

          if (action.type === "set_draft") {
            const session = resolveSessionOrThrow(action.sessionRef);
            setServerSessionDraft(server.id, session.session, action.text);
            focusServer(server.id);
            setHomeHubVisible(false);
            setRoute("terminals");
            setFocusedSession(session.session);
            results.push({ action: action.type, ok: true, detail: `Updated draft for ${server.name} / ${session.session}` });
            continue;
          }

          if (action.type === "stop_session") {
            const session = resolveSessionOrThrow(action.sessionRef);
            await stopServerSession(server.id, session.session);
            results.push({ action: action.type, ok: true, detail: `Closed ${server.name} / ${session.session}` });
            continue;
          }

          if (action.type === "list_files") {
            const nextIncludeHidden = action.includeHidden ?? assistantFileIncludeHidden;
            const targetPath = (action.path || getActiveDirectoryForServer(server.id)).trim();
            setFilesSurfaceTarget(server.id);
            markActivity();
            const query = new URLSearchParams();
            if (targetPath) {
              query.set("path", targetPath);
            }
            if (nextIncludeHidden) {
              query.set("hidden", "true");
            }
            const suffix = query.toString() ? `?${query.toString()}` : "";
            const data = await apiRequest<{ path: string; entries: RemoteFileEntry[] }>(
              serverProfile.baseUrl,
              serverProfile.token,
              `/files/list${suffix}`
            );
            assistantFileIncludeHidden = nextIncludeHidden;
            assistantFilePath = data.path;
            assistantSelectedFilePath = null;
            setIncludeHidden(nextIncludeHidden);
            setCurrentPath(data.path);
            setFileEntries(data.entries || []);
            setSelectedFilePath(null);
            setSelectedContent("");
            results.push({ action: action.type, ok: true, detail: `Listed files for ${server.name} at ${data.path}` });
            continue;
          }

          if (action.type === "open_file") {
            const targetPath = (action.path || getSelectedFileForServer(server.id)).trim();
            if (!targetPath) {
              throw new Error(`Pick a file path on ${server.name} first.`);
            }
            setFilesSurfaceTarget(server.id);
            markActivity();
            const data = await apiRequest<{ path: string; content: string }>(
              serverProfile.baseUrl,
              serverProfile.token,
              `/files/read?path=${encodeURIComponent(targetPath)}`
            );
            assistantSelectedFilePath = data.path;
            setSelectedFilePath(data.path);
            setSelectedContent(data.content || "");
            results.push({ action: action.type, ok: true, detail: `Opened ${data.path} on ${server.name}` });
            continue;
          }

          if (action.type === "tail_file") {
            const targetPath = (action.path || getSelectedFileForServer(server.id)).trim();
            if (!targetPath) {
              throw new Error(`Pick a file path on ${server.name} first.`);
            }
            const lines = Math.max(1, Math.min(action.lines || Number.parseInt(tailLines, 10) || 200, 5000));
            setFilesSurfaceTarget(server.id);
            markActivity();
            const data = await apiRequest<{ path: string; content: string; lines: number }>(
              serverProfile.baseUrl,
              serverProfile.token,
              `/files/tail?path=${encodeURIComponent(targetPath)}&lines=${lines}`
            );
            assistantSelectedFilePath = data.path;
            setSelectedFilePath(data.path);
            setSelectedContent(data.content || "");
            results.push({
              action: action.type,
              ok: true,
              detail: `Loaded the last ${lines} lines from ${data.path} on ${server.name}`,
            });
            continue;
          }

          if (action.type === "create_folder") {
            const requestedPath = action.path.trim();
            if (!requestedPath) {
              throw new Error("A folder path is required.");
            }
            const baseDirectory = getActiveDirectoryForServer(server.id).trim();
            const target = resolveAssistantFolderTarget(requestedPath, baseDirectory);
            let session = resolveAssistantSession(
              context,
              server,
              "$focused_session",
              lastCreatedSessionByServerId.get(server.id) || null
            );
            if (!session || session.mode !== "shell") {
              const created = await createSessionForServer(server.id, "shell");
              lastCreatedSessionByServerId.set(server.id, created);
              session = {
                session: created,
                mode: "shell",
                localAi: false,
                live: false,
              };
            }
            const markerSeed = `${Date.now()}${Math.floor(Math.random() * 10000)}`;
            const successMarker = `__NOVA_DIR_OK_${markerSeed}__`;
            const failureMarker = `__NOVA_DIR_FAIL_${markerSeed}__`;
            const quotedCommandPath = formatAssistantShellPath(target.commandPath, target.shellExpandable);
            const beforeTail = poolConnectionsRef.current.get(server.id)?.tails[session.session] || "";
            await sendServerSessionCommand(
              server.id,
              session.session,
              `mkdir -p -- ${quotedCommandPath} && if [ -d ${quotedCommandPath} ]; then printf '%s\\n' ${shellQuote(successMarker)}; else printf '%s\\n' ${shellQuote(
                failureMarker
              )}; fi`,
              "shell"
            );
            focusServer(server.id);
            setHomeHubVisible(false);
            setRoute("terminals");
            setFocusedSession(session.session);
            const observedTail = await waitForSessionOutput({
              serverId: server.id,
              session: session.session,
              beforeTail,
              pollRemote: true,
              maxWaitMs: 6000,
            });
            const verifiedByShell = observedTail.includes(successMarker) && !observedTail.includes(failureMarker);
            let verified = verifiedByShell;

            if (capabilities.files && target.parentPath) {
              try {
                const data = await apiRequest<{ path: string; entries: RemoteFileEntry[] }>(
                  serverProfile.baseUrl,
                  serverProfile.token,
                  `/files/list?path=${encodeURIComponent(target.parentPath)}${assistantFileIncludeHidden ? "&hidden=true" : ""}`
                );
                setFilesSurfaceTarget(server.id);
                assistantFilePath = data.path;
                setCurrentPath(data.path);
                setFileEntries(data.entries || []);
                const normalizedTargetName = target.commandPath.replace(/\/+$/, "").split("/").pop();
                if (
                  normalizedTargetName &&
                  data.entries.some((entry) => entry.is_dir && entry.name === normalizedTargetName)
                ) {
                  verified = true;
                }
              } catch {
                // Folder creation still succeeded even if the file index refresh failed.
              }
            }

            results.push({
              action: action.type,
              ok: verified,
              detail: verified
                ? `Created folder ${target.displayPath} on ${server.name} and verified it exists.`
                : `Sent the folder creation command for ${target.displayPath} on ${server.name}, but could not verify the result yet.`,
            });
            continue;
          }

          if (action.type === "save_file") {
            const targetPath = action.path.trim();
            if (!targetPath) {
              throw new Error("A file path is required.");
            }
            setFilesSurfaceTarget(server.id);
            markActivity();
            assertServerWritable(server.id, "Write file");
            const savedContent = typeof action.content === "string" ? action.content : "";
            await apiRequest<{ ok?: boolean; path?: string; bytes?: number }>(serverProfile.baseUrl, serverProfile.token, "/files/write", {
              method: "POST",
              body: JSON.stringify({
                path: targetPath,
                content: savedContent,
              }),
            });
            const verification = await apiRequest<{ path: string; content: string }>(
              serverProfile.baseUrl,
              serverProfile.token,
              `/files/read?path=${encodeURIComponent(targetPath)}`
            );
            assistantSelectedFilePath = targetPath;
            setSelectedFilePath(targetPath);
            setSelectedContent(verification.content || "");
            recordAuditEvent({
              action: "file_written",
              serverId: server.id,
              serverName: server.name,
              session: "",
              detail: `path=${targetPath}`,
            });
            const verified = verification.content === savedContent;
            results.push({
              action: action.type,
              ok: verified,
              detail: verified
                ? `Saved ${targetPath} on ${server.name} and verified the updated content.`
                : `Saved ${targetPath} on ${server.name}, but the verification readback did not match.`,
            });
            continue;
          }

          if (action.type === "refresh_processes") {
            focusServer(server.id);
            setHomeHubVisible(false);
            setRoute("terminals");
            markActivity();
            if (server.id === focusedServerId) {
              await refreshProcesses();
              results.push({ action: action.type, ok: true, detail: `Refreshed processes on ${server.name}` });
              continue;
            }
            const payload = await apiRequest<unknown>(serverProfile.baseUrl, serverProfile.token, "/proc/list");
            const count = countProcessEntries(payload);
            results.push({
              action: action.type,
              ok: true,
              detail: count > 0 ? `Found ${count} processes on ${server.name}` : `No processes returned from ${server.name}`,
            });
            continue;
          }

          if (action.type === "kill_process") {
            focusServer(server.id);
            setHomeHubVisible(false);
            setRoute("terminals");
            markActivity();
            assertServerWritable(server.id, "Kill process");
            await apiRequest(serverProfile.baseUrl, serverProfile.token, "/proc/kill", {
              method: "POST",
              body: JSON.stringify({
                pid: action.pid,
                signal: action.signal || "TERM",
              }),
            });
            const verificationPayload = await apiRequest<unknown>(serverProfile.baseUrl, serverProfile.token, "/proc/list");
            const stillRunning = processListContainsPid(verificationPayload, action.pid);
            if (server.id === focusedServerId) {
              await refreshProcesses();
            }
            recordAuditEvent({
              action: "process_killed",
              serverId: server.id,
              serverName: server.name,
              session: "",
              detail: `pid=${action.pid} signal=${action.signal || "TERM"}`,
            });
            results.push({
              action: action.type,
              ok: !stillRunning,
              detail: stillRunning
                ? `Sent ${action.signal || "TERM"} to PID ${action.pid} on ${server.name}, but it still appears in the process list.`
                : `Sent ${action.signal || "TERM"} to PID ${action.pid} on ${server.name} and verified it exited.`,
            });
            continue;
          }

          if (action.type === "open_server_link") {
            focusServer(server.id);
            setHomeHubVisible(false);
            setRoute("servers");
            markActivity();
            if (action.target === "ssh") {
              await openSshFallback(serverProfile);
            } else {
              const targetUrl =
                action.target === "portainer"
                  ? serverProfile.portainerUrl
                  : action.target === "proxmox"
                    ? serverProfile.proxmoxUrl
                    : serverProfile.grafanaUrl;
              if (!targetUrl) {
                throw new Error(`${server.name} does not have a ${action.target} URL configured.`);
              }
              await Linking.openURL(targetUrl);
            }
            results.push({
              action: action.type,
              ok: true,
              detail: `Opened ${action.target} for ${server.name}`,
            });
            continue;
          }

          if (action.type === "create_agent") {
            await createAgentForServer(server.id, action.name, action.goal);
            results.push({ action: action.type, ok: true, detail: `Created agent ${action.name} on ${server.name}` });
            continue;
          }

          if (action.type === "update_agent") {
            if (action.status) {
              await setAgentStatusForServer(server.id, action.name, action.status);
            }
            if (action.goal) {
              await setAgentGoalForServer(server.id, action.name, action.goal);
            }
            if (action.queuedCommand) {
              await queueAgentCommandForServer(server.id, action.name, action.queuedCommand);
            }
            results.push({ action: action.type, ok: true, detail: `Updated agent ${action.name} on ${server.name}` });
            continue;
          }

          if (action.type === "approve_agents") {
            const approved = await approveReadyAgentsForServer(server.id);
            results.push({
              action: action.type,
              ok: true,
              detail: approved.length > 0 ? `Approved ${approved.length} agent(s) on ${server.name}` : `No pending agents on ${server.name}`,
            });
            continue;
          }

          if (action.type === "deny_agents") {
            const denied = await denyAllPendingAgentsForServer(server.id);
            results.push({
              action: action.type,
              ok: true,
              detail: denied.length > 0 ? `Denied ${denied.length} agent(s) on ${server.name}` : `No pending agents on ${server.name}`,
            });
            continue;
          }
        } catch (error) {
          results.push({
            action: action.type,
            ok: false,
            detail: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return results;
    },
    [
      approveReadyAgentsForServer,
      assertServerWritable,
      connectAllServers,
      cloudDashboardUrl,
      createAgentForServer,
      createSessionForServer,
      denyAllPendingAgentsForServer,
      disconnectAllServers,
      focusServer,
      focusedServerId,
      brokeredServers,
      markActivity,
      openSshFallback,
      refreshProcesses,
      queueAgentCommandForServer,
      recordAuditEvent,
      refreshCloudAuditExports,
      refreshTeamContext,
      requestCloudAuditExport,
      setAgentGoalForServer,
      setAgentStatusForServer,
      setCurrentPath,
      setFileEntries,
      setFocusedSession,
      setGlassesEnabled,
      setGlassesMinimalMode,
      setGlassesTextScale,
      setGlassesVoiceAutoSend,
      setGlassesVoiceLoop,
      setGlassesWakePhraseEnabled,
      setHomeHubVisible,
      setIncludeHidden,
      setRoute,
      setSelectedContent,
      setSelectedFilePath,
      setServerSessionDraft,
      setStartAiEngine,
      setStartKind,
      sendServerSessionCommand,
      syncAuditNow,
      tailLines,
      teamIdentity,
      stopServerSession,
    ]
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

  const clearNovaVoiceLoopRestart = useCallback(() => {
    const timer = novaVoiceLoopTimerRef.current;
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    novaVoiceLoopTimerRef.current = null;
  }, []);

  const clearNovaVoiceStopTimer = useCallback(() => {
    const timer = novaVoiceStopTimerRef.current;
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    novaVoiceStopTimerRef.current = null;
  }, []);

  const clearNovaRecordingSilenceTimer = useCallback(() => {
    const timer = novaRecordingSilenceTimerRef.current;
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    novaRecordingSilenceTimerRef.current = null;
  }, []);

  const clearNovaConversationIdleTimer = useCallback(() => {
    const timer = novaConversationIdleTimerRef.current;
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    novaConversationIdleTimerRef.current = null;
  }, []);

  useEffect(() => {
    if (!novaVoiceSettingsLoadedRef.current) {
      return;
    }
    if (novaAlwaysListeningEnabled || novaHandsFreeEnabled || novaConversationModeEnabled) {
      return;
    }

    pendingNovaListenModeRef.current = null;
    clearNovaVoiceLoopRestart();
    clearNovaConversationIdleTimer();

    if (novaListeningModeRef.current !== "walkie") {
      if (liveVoiceRecognitionActiveRef.current) {
        void stopLiveRecognition("abort");
      }
      if (voiceRecordingRef.current) {
        void stopVoiceCapture();
      }
      setNovaVoiceModeActive(false);
    }
  }, [
    clearNovaConversationIdleTimer,
    clearNovaVoiceLoopRestart,
    novaAlwaysListeningEnabled,
    novaConversationModeEnabled,
    novaHandsFreeEnabled,
    stopLiveRecognition,
    stopVoiceCapture,
  ]);

  const resolveDefaultNovaListeningMode = useCallback((): "wake" | "conversation" | null => {
    if (novaHandsFreeEnabledRef.current || novaConversationModeEnabledRef.current) {
      return "conversation";
    }
    if (novaAlwaysListeningEnabledRef.current) {
      return "wake";
    }
    return null;
  }, []);

  const queueNovaListeningMode = useCallback(
    (mode: "wake" | "conversation" | "walkie" | null, delayMs: number = 0) => {
      if (!mode) {
        pendingNovaListenModeRef.current = null;
        clearNovaVoiceLoopRestart();
        return;
      }
      const schedule = (nextMode: "wake" | "conversation" | "walkie", nextDelay: number) => {
        const voiceRouteAvailable = route !== "glasses";
        pendingNovaListenModeRef.current = nextMode;
        clearNovaVoiceLoopRestart();
        if (!voiceRouteAvailable || !unlocked || appStateStatus !== "active") {
          return;
        }
        novaVoiceLoopTimerRef.current = setTimeout(() => {
          novaVoiceLoopTimerRef.current = null;
          const queuedMode = pendingNovaListenModeRef.current;
          pendingNovaListenModeRef.current = null;
          if (!queuedMode || !voiceRouteAvailable || !unlocked || appStateStatus !== "active") {
            return;
          }
          if (voiceBusyRef.current) {
            schedule(queuedMode, 320);
            return;
          }
          if (liveVoiceRecognitionActiveRef.current) {
            void stopLiveRecognition("abort");
            schedule(queuedMode, 180);
            return;
          }
          if (voiceRecordingRef.current) {
            void stopVoiceCapture();
            schedule(queuedMode, 180);
            return;
          }
          setNovaVoiceModeActive(true);
          startNovaVoiceCaptureRef.current(queuedMode);
        }, Math.max(0, Math.min(nextDelay, 15000)));
      };

      schedule(mode, delayMs);
    },
    [appStateStatus, clearNovaVoiceLoopRestart, route, stopLiveRecognition, stopVoiceCapture, unlocked]
  );

  const endNovaConversationSession = useCallback(
    (reason: "idle" | "manual") => {
      clearNovaConversationIdleTimer();
      clearNovaRecordingSilenceTimer();
      pendingNovaListenModeRef.current = null;
      novaConversationModeEnabledRef.current = false;
      setNovaConversationModeEnabled(false);
      getSpeechOutputModule()?.stop?.();
      if (liveVoiceRecognitionActiveRef.current) {
        void stopLiveRecognition("abort");
      }
      if (voiceRecordingRef.current) {
        void stopVoiceCapture();
      }
      setNovaVoiceModeActive(false);
      const nextMode = resolveDefaultNovaListeningMode();
      if (reason === "idle") {
        setStatus({
          text: nextMode === "conversation" ? "Hands-Free listening..." : nextMode === "wake" ? "Wake phrase standby." : "Ready",
          error: false,
        });
      } else {
        setStatus({
          text: nextMode === "conversation" ? "Nova voice paused." : nextMode === "wake" ? "Wake phrase standby." : "Nova voice paused.",
          error: false,
        });
      }
      queueNovaListeningMode(nextMode, 200);
    },
    [clearNovaConversationIdleTimer, clearNovaRecordingSilenceTimer, queueNovaListeningMode, resolveDefaultNovaListeningMode, setStatus, stopLiveRecognition, stopVoiceCapture]
  );

  const resetNovaConversationIdleTimer = useCallback(() => {
    clearNovaConversationIdleTimer();
    novaConversationIdleTimerRef.current = setTimeout(() => {
      novaConversationIdleTimerRef.current = null;
      endNovaConversationSession("idle");
    }, novaConversationIdleMsRef.current);
  }, [clearNovaConversationIdleTimer, endNovaConversationSession]);

  const applyNovaAlwaysListeningEnabled = useCallback(
    (value: boolean) => {
      novaAlwaysListeningEnabledRef.current = value;
      setNovaAlwaysListeningEnabled(value);
      if (value) {
        if (!novaHandsFreeEnabledRef.current && !novaConversationModeEnabledRef.current) {
          setStatus({ text: "Wake phrase standby.", error: false });
          queueNovaListeningMode("wake", 0);
        }
        return;
      }
      if (!novaHandsFreeEnabledRef.current && !novaConversationModeEnabledRef.current) {
        pendingNovaListenModeRef.current = null;
        clearNovaVoiceLoopRestart();
        if (novaListeningModeRef.current === "wake" && liveVoiceRecognitionActiveRef.current) {
          void stopLiveRecognition("abort");
        }
        if (novaListeningModeRef.current === "wake" && voiceRecordingRef.current) {
          void stopVoiceCapture();
        }
        setNovaVoiceModeActive(false);
        setStatus({ text: "Wake phrase standby off.", error: false });
      }
    },
    [clearNovaVoiceLoopRestart, queueNovaListeningMode, setStatus, stopLiveRecognition, stopVoiceCapture]
  );

  const applyNovaHandsFreeEnabled = useCallback(
    (value: boolean) => {
      novaHandsFreeEnabledRef.current = value;
      setNovaHandsFreeEnabled(value);
      if (value) {
        requestNovaOverlayOpen();
        novaConversationModeEnabledRef.current = true;
        setNovaConversationModeEnabled(true);
        setStatus({ text: "Hands-Free listening...", error: false });
        void requestVoicePermission().catch(() => undefined);
        queueNovaListeningMode("conversation", 0);
        return;
      }
      endNovaConversationSession("manual");
    },
    [endNovaConversationSession, queueNovaListeningMode, requestNovaOverlayOpen, requestVoicePermission, setStatus]
  );

  const handleNovaAssistantReply = useCallback(
    async (reply: string) => {
      const nextMode = resolveDefaultNovaListeningMode();
      const spoken = summarizeNovaReplyForSpeech(reply);
      clearNovaConversationIdleTimer();
      const resumeConversation = () => {
        if (nextMode === "conversation") {
          resetNovaConversationIdleTimer();
        }
        queueNovaListeningMode(nextMode, 220);
      };

      if (!spoken || !novaSpeakRepliesEnabledRef.current) {
        resumeConversation();
        return;
      }

      const speechModule = getSpeechOutputModule();
      if (!speechModule) {
        devVoiceUiLog("novaSpeech:moduleUnavailable");
        resumeConversation();
        return;
      }

      try {
        await prepareSpeechOutput();
        await new Promise((resolve) => setTimeout(resolve, 180));
        speechModule.stop?.();
        devVoiceUiLog("novaSpeech:start", { spokenPreview: spoken.slice(0, 160) });
        await new Promise<void>((resolve) => {
          let settled = false;
          const finish = () => {
            if (settled) {
              return;
            }
            settled = true;
            resolve();
          };

          speechModule.speak(spoken, {
            language: "en-US",
            pitch: 1.03,
            rate: Platform.OS === "ios" ? 0.92 : 0.96,
            volume: 1,
            voice: novaSpeechVoiceIdRef.current || undefined,
            onDone: finish,
            onStopped: finish,
            onError: finish,
          });

          setTimeout(finish, Math.max(6000, Math.min(18000, spoken.length * 90)));
        });
      } catch {
        // best effort
      }

      resumeConversation();
    },
    [clearNovaConversationIdleTimer, prepareSpeechOutput, queueNovaListeningMode, resetNovaConversationIdleTimer, resolveDefaultNovaListeningMode]
  );

  const novaAssistant = useNovaAssistant({
    activeProfile: runtimeActiveProfile,
    sendPromptDetailed,
    buildContext: buildNovaAssistantContext,
    executeActions: executeNovaAssistantActions,
    onAssistantReply: handleNovaAssistantReply,
  });

  const testNovaSpeechOutput = useCallback(() => {
    const speechModule = getSpeechOutputModule();
    if (!speechModule) {
      setStatus({ text: "Nova voice unavailable in this build.", error: true });
      return;
    }

    void (async () => {
      try {
        await prepareSpeechOutput();
        await new Promise((resolve) => setTimeout(resolve, 180));
        speechModule.stop?.();
        devVoiceUiLog("novaSpeech:testStart");
        speechModule.speak("Nova voice is active.", {
          language: "en-US",
          pitch: 1.03,
          rate: Platform.OS === "ios" ? 0.92 : 0.96,
          volume: 1,
          voice: novaSpeechVoiceIdRef.current || undefined,
        });
        setStatus({ text: "Testing Nova voice...", error: false });
      } catch (error) {
        setStatus({ text: error instanceof Error ? error.message : String(error), error: true });
      }
    })();
  }, [prepareSpeechOutput, setStatus]);

  const cycleNovaSpeechVoice = useCallback(
    (direction: -1 | 1) => {
      if (!novaSpeechVoices.length) {
        return;
      }
      const currentIndex = novaSpeechVoices.findIndex((voice) => voice.identifier === novaSpeechVoiceIdRef.current);
      const nextIndex =
        currentIndex >= 0
          ? (currentIndex + direction + novaSpeechVoices.length) % novaSpeechVoices.length
          : 0;
      setNovaSpeechVoiceId(novaSpeechVoices[nextIndex]?.identifier || "");
    },
    [novaSpeechVoices]
  );

  const resetNovaRecordingSilenceTimer = useCallback(
    (delayMs: number = novaConversationIdleMsRef.current) => {
      clearNovaRecordingSilenceTimer();
      novaRecordingSilenceTimerRef.current = setTimeout(() => {
        novaRecordingSilenceTimerRef.current = null;
        if (!voiceRecordingRef.current) {
          return;
        }
        void stopVoiceCaptureIntoNovaRef.current();
      }, Math.max(1000, Math.min(delayMs, 15000)));
    },
    [clearNovaRecordingSilenceTimer]
  );

  const handleNovaTranscript = useCallback(
    async (rawTranscript: string, mode: "wake" | "conversation" | "walkie"): Promise<boolean> => {
      const transcript = rawTranscript.trim();
      const activeWakePhrase = normalizeNovaWakePhrase(novaWakePhraseRef.current);

      if (!transcript) {
        return false;
      }

      if (mode === "wake") {
        const wake = resolveNovaWakeCommand(transcript, activeWakePhrase);
        if (!wake.heardWakePhrase) {
          queueNovaListeningMode("wake", 160);
          return false;
        }
        requestNovaOverlayOpen();
        novaConversationModeEnabledRef.current = true;
        setNovaConversationModeEnabled(true);

        if (!wake.command.trim()) {
          setStatus({ text: "Nova is listening.", error: false });
          resetNovaConversationIdleTimer();
          queueNovaListeningMode("conversation", 180);
          return true;
        }

        clearNovaConversationIdleTimer();
        const sent = await novaAssistant.submitTranscript(wake.command.trim(), { autoSend: true });
        if (!sent) {
          throw new Error("Nova could not submit the wake command.");
        }
        return true;
      }

      if (mode === "conversation") {
        requestNovaOverlayOpen();
        novaConversationModeEnabledRef.current = true;
        setNovaConversationModeEnabled(true);
        clearNovaConversationIdleTimer();
        const sent = await novaAssistant.submitTranscript(transcript, { autoSend: true });
        if (!sent) {
          throw new Error("Nova could not submit the transcript.");
        }
        return true;
      }

      requestNovaOverlayOpen();
      setNovaVoiceModeActive(false);
      const sent = await novaAssistant.submitTranscript(transcript, { autoSend: true });
      if (!sent) {
        throw new Error("Nova could not submit the transcript.");
      }
      return true;
    },
    [clearNovaConversationIdleTimer, novaAssistant, queueNovaListeningMode, requestNovaOverlayOpen, resetNovaConversationIdleTimer, setStatus]
  );

  const handleNovaVoiceNoSpeech = useCallback(
    (mode: "wake" | "conversation" | "walkie") => {
      if (mode === "walkie") {
        setNovaVoiceModeActive(false);
      }
      const nextMode =
        mode === "wake"
          ? "wake"
          : novaHandsFreeEnabledRef.current || novaConversationModeEnabledRef.current
            ? "conversation"
            : resolveDefaultNovaListeningMode();

      if (mode !== "wake") {
        setStatus({
          text:
            nextMode === "conversation"
              ? novaHandsFreeEnabledRef.current
                ? "Hands-Free listening..."
                : "Nova is listening."
              : nextMode === "wake"
                ? "Wake phrase standby."
                : "Ready",
          error: false,
        });
      }
      queueNovaListeningMode(nextMode, mode === "walkie" ? 260 : 180);
    },
    [queueNovaListeningMode, resolveDefaultNovaListeningMode, setStatus]
  );

  const handleNovaVoiceError = useCallback(
    (mode: "wake" | "conversation" | "walkie", message: string): boolean => {
      if (mode === "walkie") {
        setNovaVoiceModeActive(false);
      }
      const nextMode =
        mode === "wake"
          ? "wake"
          : novaHandsFreeEnabledRef.current || novaConversationModeEnabledRef.current
            ? "conversation"
            : resolveDefaultNovaListeningMode();

      if (shouldRetryVoiceLoopError(message)) {
        setStatus({ text: summarizeNovaVoiceError(message), error: /permission|unavailable/.test(message.toLowerCase()) });
        queueNovaListeningMode(nextMode, /no speech|no transcript/i.test(message) ? 260 : 1200);
        return false;
      }
      setNovaVoiceModeActive(false);
      setStatus({ text: summarizeNovaVoiceError(message), error: true });
      return false;
    },
    [queueNovaListeningMode, resolveDefaultNovaListeningMode, setStatus]
  );

  const stopVoiceCaptureIntoNova = useCallback(async (): Promise<boolean> => {
    clearNovaVoiceStopTimer();
    clearNovaRecordingSilenceTimer();
    const mode = novaListeningModeRef.current;
    try {
      const rawTranscript = (
        await stopVoiceCaptureAndTranscribe({
          wakePhrase: novaWakePhraseRef.current,
          requireWakePhrase: mode === "wake",
          vadEnabled: true,
          vadSilenceMs: NOVA_VOICE_VAD_SILENCE_MS,
        })
      ).trim();
      if (!rawTranscript) {
        handleNovaVoiceNoSpeech(mode);
        return false;
      }
      return await handleNovaTranscript(rawTranscript, mode);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return handleNovaVoiceError(mode, message);
    }
  }, [
    clearNovaRecordingSilenceTimer,
    clearNovaVoiceStopTimer,
    handleNovaTranscript,
    handleNovaVoiceError,
    handleNovaVoiceNoSpeech,
    stopVoiceCaptureAndTranscribe,
  ]);

  useEffect(() => {
    stopVoiceCaptureIntoNovaRef.current = stopVoiceCaptureIntoNova;
  }, [stopVoiceCaptureIntoNova]);

  const startNovaLiveRecognition = useCallback(
    async (mode: "wake" | "conversation") => {
      await startLiveRecognition({
        continuous: true,
        silenceTimeoutMs: Math.max(1000, Math.min(novaConversationIdleMsRef.current, 15000)),
        contextualStrings:
          mode === "wake"
            ? Array.from(
                new Set([novaWakePhraseRef.current, DEFAULT_NOVA_WAKE_PHRASE, "nova"].filter((value) => value.trim().length > 0))
              )
            : undefined,
        onTranscript: async (transcript) => {
          await handleNovaTranscript(transcript, mode);
        },
        onNoSpeech: async () => {
          handleNovaVoiceNoSpeech(mode);
        },
        onError: async (message) => {
          handleNovaVoiceError(mode, message);
        },
      });
    },
    [handleNovaTranscript, handleNovaVoiceError, handleNovaVoiceNoSpeech, startLiveRecognition]
  );

  const startNovaVoiceCapture = useCallback(
    (mode: "wake" | "conversation" | "walkie" = "conversation") => {
      void (async () => {
        if (voiceBusyRef.current) {
          return;
        }

        pendingNovaListenModeRef.current = null;
        clearNovaVoiceStopTimer();
        clearNovaVoiceLoopRestart();

        if (liveVoiceRecognitionActiveRef.current) {
          await stopLiveRecognition("abort");
        }
        if (voiceRecordingRef.current) {
          await stopVoiceCapture();
        }

        novaListeningModeRef.current = mode;
        setNovaVoiceModeActive(true);

        if (mode !== "wake") {
          setStatus({
            text:
              mode === "walkie"
                ? "Listening... release to send."
                : novaHandsFreeEnabledRef.current
                  ? "Hands-Free listening..."
                  : "Nova is listening.",
            error: false,
          });
        }

        devVoiceUiLog("startNovaVoiceCapture", { mode });

        if (mode === "walkie") {
          try {
            await startVoiceCapture();
            if (!novaWalkieHoldActiveRef.current) {
              await stopVoiceCaptureIntoNovaRef.current();
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setNovaVoiceModeActive(false);
            devVoiceUiLog("startNovaVoiceCapture:walkieError", message);
            handleNovaVoiceError(mode, message);
          }
          return;
        }

        try {
          await startNovaLiveRecognition(mode);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setNovaVoiceModeActive(false);
          devVoiceUiLog("startNovaVoiceCapture:error", message);
          handleNovaVoiceError(mode, message);
        }
      })();
    },
    [
      clearNovaVoiceLoopRestart,
      clearNovaRecordingSilenceTimer,
      clearNovaVoiceStopTimer,
      handleNovaVoiceError,
      setStatus,
      startNovaLiveRecognition,
      startVoiceCapture,
      stopLiveRecognition,
      stopVoiceCapture,
    ]
  );

  useEffect(() => {
    startNovaVoiceCaptureRef.current = startNovaVoiceCapture;
  }, [startNovaVoiceCapture]);

  useEffect(() => {
    if (!voiceRecording || !novaVoiceModeActive) {
      clearNovaRecordingSilenceTimer();
      return;
    }
    if (novaListeningModeRef.current === "walkie") {
      clearNovaRecordingSilenceTimer();
      return;
    }
    if (typeof voiceMeteringDb === "number" && Number.isFinite(voiceMeteringDb) && voiceMeteringDb > -62) {
      resetNovaRecordingSilenceTimer();
    }
  }, [clearNovaRecordingSilenceTimer, novaVoiceModeActive, resetNovaRecordingSilenceTimer, voiceMeteringDb, voiceRecording]);

  useEffect(() => {
    if (voiceRecording || liveVoiceRecognitionActive) {
      return;
    }
    if (
      route === "glasses" ||
      !unlocked ||
      appStateStatus !== "active" ||
      voiceBusy ||
      novaVoiceModeActive
    ) {
      return;
    }
    queueNovaListeningMode(resolveDefaultNovaListeningMode(), 120);
  }, [
    appStateStatus,
    liveVoiceRecognitionActive,
    novaConversationModeEnabled,
    novaHandsFreeEnabled,
    novaVoiceModeActive,
    queueNovaListeningMode,
    resolveDefaultNovaListeningMode,
    route,
    unlocked,
    voiceBusy,
    voiceRecording,
  ]);

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
      setAppStateStatus(state);
      if (state !== "active") {
        clearNovaVoiceLoopRestart();
        clearNovaConversationIdleTimer();
        if (liveVoiceRecognitionActive && novaVoiceModeActive) {
          void stopLiveRecognition("abort");
        }
        if (voiceRecording && novaVoiceModeActive) {
          void stopVoiceCapture();
        }
        const speechModule = getSpeechOutputModule();
        speechModule?.stop?.();
        setNovaConversationModeEnabled(false);
        setNovaVoiceModeActive(false);
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
  }, [
    clearNovaVoiceLoopRestart,
    clearNovaConversationIdleTimer,
    connectPoolAll,
    disconnectPoolAll,
    liveVoiceRecognitionActive,
    lock,
    novaVoiceModeActive,
    stopLiveRecognition,
    stopVoiceCapture,
    unlocked,
    voiceRecording,
  ]);

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
    return () => {
      clearNovaVoiceStopTimer();
      if (novaVoiceLoopTimerRef.current) {
        clearTimeout(novaVoiceLoopTimerRef.current);
        novaVoiceLoopTimerRef.current = null;
      }
    };
  }, [clearNovaVoiceStopTimer]);

  useEffect(() => {
    if (route === "glasses" && !glassesMode.enabled) {
      setRoute("terminals");
    }
  }, [glassesMode.enabled, route]);

  useEffect(() => {
    if (route !== "glasses") {
      return;
    }
    clearNovaVoiceLoopRestart();
    clearNovaVoiceStopTimer();
    clearNovaConversationIdleTimer();
    if (liveVoiceRecognitionActive && novaVoiceModeActive) {
      void stopLiveRecognition("abort");
    }
    if (voiceRecording && novaVoiceModeActive) {
      void stopVoiceCapture();
    }
    getSpeechOutputModule()?.stop?.();
    setNovaConversationModeEnabled(false);
    setNovaVoiceModeActive(false);
  }, [
    clearNovaConversationIdleTimer,
    clearNovaVoiceLoopRestart,
    clearNovaVoiceStopTimer,
    liveVoiceRecognitionActive,
    novaVoiceModeActive,
    route,
    stopLiveRecognition,
    stopVoiceCapture,
    voiceRecording,
  ]);

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
    if (liveVoiceRecognitionActive && !novaVoiceModeActive) {
      void stopLiveRecognition("abort");
    }
    if (!voiceRecording || novaVoiceModeActive) {
      return;
    }
    void stopVoiceCapture();
  }, [liveVoiceRecognitionActive, novaVoiceModeActive, route, stopLiveRecognition, stopVoiceCapture, voiceRecording]);

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
    stopServerSession,
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

  const handleTabChange = useCallback(
    (next: RouteTab): boolean => {
      markActivity();
      void Haptics.selectionAsync();
      if (next === "snippets" && !isPro) {
        setPaywallVisible(true);
        return false;
      }
      if (next === "files" && !capabilities.files) {
        setStatus({ text: "Active server does not support file APIs.", error: true });
        return false;
      }
      setRoute(next);
      return true;
    },
    [capabilities.files, isPro, markActivity]
  );

  const openRouteFromHomeHub = useCallback(
    (next: RouteTab) => {
      const changed = handleTabChange(next);
      if (changed) {
        setHomeHubVisible(false);
      }
    },
    [handleTabChange]
  );

  const openRouteFromMenu = useCallback(
    (next: RouteTab) => {
      const changed = handleTabChange(next);
      if (changed) {
        setHomeHubVisible(false);
      }
    },
    [handleTabChange]
  );

  const togglePoolLifecycleFromMenu = useCallback(() => {
    markActivity();
    if (poolLifecyclePaused) {
      connectAllServers();
      setReady("Connection pool resumed");
      return;
    }
    disconnectAllServers();
    setReady("Connection pool paused");
  }, [connectAllServers, disconnectAllServers, markActivity, poolLifecyclePaused, setReady]);

  const createMenuSession = useCallback(
    (kind: "shell" | "ai") => {
      if (!focusedServerId) {
        setStatus({ text: "Select a server before creating a session.", error: true });
        return;
      }
      void runWithStatus(kind === "ai" ? "Starting AI session" : "Starting shell session", async () => {
        const session = await createSessionForServer(focusedServerId, kind);
        setStatus({
          text: `${kind === "ai" ? "AI" : "Shell"} session started: ${session}`,
          error: false,
        });
        setRoute("terminals");
        setHomeHubVisible(false);
      });
    },
    [createSessionForServer, focusedServerId, runWithStatus]
  );

  const refreshAllFromMenu = useCallback(() => {
    void runWithStatus("Refreshing all servers", async () => {
      await refreshAllServers();
    });
  }, [refreshAllServers, runWithStatus]);

  const reconnectAllFromMenu = useCallback(() => {
    void runWithStatus("Reconnecting all servers", async () => {
      reconnectAllServers();
    });
  }, [reconnectAllServers, runWithStatus]);

  const routeLabel: Record<RouteTab, string> = {
    terminals: "Terminals",
    servers: "Servers",
    agents: "Agents",
    snippets: "Snippets",
    files: "Files",
    llms: "Nova",
    settings: "Settings",
    team: "Team",
    glasses: "Glasses",
    vr: "VR",
  };
  const activeRouteLabel = routeLabel[route] || "NovaRemote";

  useEffect(() => {
    if (!homeHubVisible && route !== "glasses") {
      return;
    }
    setPageMenuVisible(false);
  }, [homeHubVisible, route]);

  if (lockLoading || onboardingLoading || tutorialLoading || safetyLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View pointerEvents="none" style={styles.shellBackdrop}>
          <View style={styles.shellBackdropRibbon} />
          <View style={styles.shellBackdropRibbonGlow} />
          <View style={styles.shellBackdropTopGlow} />
          <View style={styles.shellBackdropOrb} />
        </View>
        <StatusBar style="light" hidden={showLaunchIntro} />
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
      <View pointerEvents="none" style={styles.shellBackdrop}>
        <View style={styles.shellBackdropRibbon} />
        <View style={styles.shellBackdropRibbonGlow} />
        <View style={styles.shellBackdropTopGlow} />
        <View style={styles.shellBackdropOrb} />
      </View>
      <StatusBar style="light" hidden={showLaunchIntro} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={12}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={[styles.container, styles.containerGrow]}
          showsVerticalScrollIndicator
          alwaysBounceVertical
          scrollEnabled
          nestedScrollEnabled
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshControl={
            !homeHubVisible && route === "terminals" ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#27d9ff" />
            ) : undefined
          }
        >
          {homeHubVisible ? (
            <HomeNavHub
              onOpenRoute={openRouteFromHomeHub}
              activeServerName={activeServerName}
            />
          ) : (
            <>
              {route !== "glasses" ? (
                <View style={styles.shellHeaderBar}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Open page menu"
                    style={styles.shellHeaderMenuButton}
                    onPress={() => setPageMenuVisible(true)}
                  >
                    <Text style={styles.shellHeaderMenuText}>Menu</Text>
                  </Pressable>

                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Return to home hub"
                    style={styles.shellHeaderBrand}
                    onPress={() => {
                      setHomeHubVisible(true);
                      setPageMenuVisible(false);
                    }}
                  >
                    <Image source={BRAND_LOGO} style={styles.shellHeaderLogo} resizeMode="contain" />
                    <View style={styles.flex}>
                      <Text style={styles.shellHeaderBrandTitle}>{activeRouteLabel}</Text>
                      <Text numberOfLines={1} style={styles.shellHeaderBrandMeta}>
                        {activeServerName}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.shellHeaderStatusWrap}>
                    <StatusPill status={status} />
                  </View>
                </View>
              ) : null}

              {route === "servers" ? (
            <ServersScreen
              simpleMode={simpleMode}
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

          {route === "agents" ? (
            <AppProvider value={{ terminals: terminalsViewModel }}>
              <AgentsScreen
                autoEnableFallback={agentsAutoEnableFallbackServerId === focusedServerId}
                onAutoEnableFallbackHandled={() => setAgentsAutoEnableFallbackServerId(null)}
              />
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
                    const timingFlags = result.timings
                      ? [
                          result.timings.streamed ? `first token ${result.timings.firstTokenMs ?? "n/a"} ms` : "",
                          `total ${result.timings.totalMs} ms`,
                        ].filter(Boolean)
                      : [`${elapsed} ms`];
                    const flags = [
                      result.usedVision ? "vision" : "",
                      result.usedTools ? `${result.toolCalls.length} tool call(s)` : "",
                    ]
                      .filter(Boolean)
                      .join(" • ");
                    setLlmTestSummary(
                      `${profile.kind} • ${profile.model} • ${timingFlags.join(" • ")}${flags ? ` • ${flags}` : ""}`
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

          {route === "settings" ? (
            <SettingsScreen
              isPro={isPro}
              alwaysListeningEnabled={novaAlwaysListeningEnabled}
              handsFreeEnabled={novaHandsFreeEnabled}
              speakRepliesEnabled={novaSpeakRepliesEnabled}
              wakePhrase={novaWakePhrase}
              conversationIdleMs={novaConversationIdleMs}
              speechOutputAvailable={Boolean(getSpeechOutputModule())}
              selectedSpeechVoiceLabel={activeNovaSpeechVoiceLabel}
              speechVoiceChoicesAvailable={novaSpeechVoices.length > 1}
              onTestSpeakReplies={testNovaSpeechOutput}
              onShowPaywall={() => setPaywallVisible(true)}
              onSetAlwaysListeningEnabled={applyNovaAlwaysListeningEnabled}
              onSetHandsFreeEnabled={applyNovaHandsFreeEnabled}
              onSetSpeakRepliesEnabled={setNovaSpeakRepliesEnabled}
              onSetWakePhrase={(value) => {
                setNovaWakePhrase(normalizeNovaWakePhrase(value));
              }}
              onSetConversationIdleMs={(value) => {
                setNovaConversationIdleMs(normalizeNovaConversationIdleMs(value));
              }}
              onCycleSpeechVoice={cycleNovaSpeechVoice}
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
              teamSsoProviders={teamSsoProviders}
              cloudDashboardUrl={cloudDashboardUrl}
              fleetApprovals={fleetApprovals}
              auditPendingCount={pendingAuditEvents}
              auditLastSyncAt={auditLastSyncAt}
              cloudAuditExportJob={lastCloudAuditExportJob}
              cloudAuditExports={cloudAuditExportJobs}
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
              onUpdateSsoProvider={async (input) => {
                await runWithStatus(
                  `${input.enabled ? "Enabling" : "Disabling"} ${input.provider.toUpperCase()} SSO`,
                  async () => {
                  markActivity();
                  await updateTeamSsoProvider(input);
                  recordAuditEvent({
                    action: "settings_changed",
                    serverId: "",
                    serverName: "team",
                    detail: `team_sso_provider=${input.provider}:${input.enabled ? "enabled" : "disabled"};display:${Boolean(input.displayName)};issuer:${Boolean(input.issuerUrl)};auth:${Boolean(input.authUrl)};token:${Boolean(input.tokenUrl)};client:${Boolean(input.clientId)};callback:${Boolean(input.callbackUrl)}`,
                  });
                  }
                );
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
              onClaimFleetExecution={async (approvalId) => {
                await runWithStatus("Claiming fleet execution", async () => {
                  markActivity();
                  await claimFleetExecution(approvalId);
                  recordAuditEvent({
                    action: "fleet_execution_claimed",
                    serverId: "",
                    serverName: "fleet",
                    detail: `fleet_execution_claimed=${approvalId}`,
                    approved: true,
                  });
                });
              }}
              onCompleteFleetExecution={async ({ approvalId, executionToken, status, summary }) => {
                await runWithStatus(`Marking fleet execution ${status}`, async () => {
                  markActivity();
                  await completeFleetExecution({
                    approvalId,
                    executionToken,
                    status,
                    summary,
                  });
                  recordAuditEvent({
                    action: "fleet_execution_completed",
                    serverId: "",
                    serverName: "fleet",
                    detail: `fleet_execution_completed=${approvalId}:${status}`,
                    approved: status === "succeeded",
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
              onRequestCloudAuditExportJson={async () => {
                await runWithStatus("Requesting cloud audit export (JSON)", async () => {
                  markActivity();
                  await requestCloudAuditExport("json", 168);
                });
              }}
              onRequestCloudAuditExportCsv={async () => {
                await runWithStatus("Requesting cloud audit export (CSV)", async () => {
                  markActivity();
                  await requestCloudAuditExport("csv", 168);
                });
              }}
              onRefreshCloudAuditExports={async () => {
                await runWithStatus("Refreshing cloud audit exports", async () => {
                  markActivity();
                  await refreshCloudAuditExports(20);
                });
              }}
              onRetryCloudAuditExport={async (exportId) => {
                await runWithStatus("Retrying cloud audit export", async () => {
                  markActivity();
                  await retryCloudAuditExport(exportId);
                });
              }}
              onDeleteCloudAuditExport={async (exportId) => {
                await runWithStatus("Deleting cloud audit export", async () => {
                  markActivity();
                  await deleteCloudAuditExport(exportId);
                });
              }}
              onOpenCloudAuditExport={(job) => {
                const target = job?.downloadUrl || lastCloudAuditExportJob?.downloadUrl;
                if (!target) {
                  return;
                }
                void runWithStatus("Opening cloud audit export", async () => {
                  markActivity();
                  await Linking.openURL(target);
                });
              }}
            />
          ) : null}
            </>
          )}
        </ScrollView>
        <PageSlideMenu
          visible={pageMenuVisible && !homeHubVisible && route !== "glasses"}
          route={route}
          onClose={() => setPageMenuVisible(false)}
          onGoHome={() => setHomeHubVisible(true)}
          onOpenSettings={() => {
            setPageMenuVisible(false);
            setHomeHubVisible(false);
            setRoute("settings");
          }}
          onLogOff={() => {
            Alert.alert(
              Platform.OS === "ios" ? "Log off?" : "Close NovaRemote?",
              Platform.OS === "ios"
                ? "iPhone apps cannot close themselves. Continue to log off and return to the lock screen?"
                : "Are you sure you want to log off and close NovaRemote?",
              [
                {
                  text: "Cancel",
                  style: "cancel",
                },
                {
                  text: Platform.OS === "ios" ? "Log Off" : "Close App",
                  style: "destructive",
                  onPress: () => {
                    void runWithStatus(Platform.OS === "ios" ? "Logging off" : "Closing NovaRemote", async () => {
                      setPageMenuVisible(false);
                      if (Platform.OS === "android") {
                        BackHandler.exitApp();
                        return;
                      }
                      forceLock();
                    });
                  },
                },
              ]
            );
          }}
          onNavigate={openRouteFromMenu}
          poolLifecyclePaused={poolLifecyclePaused}
          onTogglePoolLifecycle={togglePoolLifecycleFromMenu}
          onRefreshAll={refreshAllFromMenu}
          onReconnectAll={reconnectAllFromMenu}
          onCreateShell={() => createMenuSession("shell")}
          onCreateAi={() => createMenuSession("ai")}
          tokenMasked={tokenMasked}
          onToggleTokenMask={() => setTokenMasked((prev) => !prev)}
          includeHidden={includeHidden}
          onToggleIncludeHidden={setIncludeHidden}
          tailLines={tailLines}
          onSetTailLines={setTailLines}
        />
        <NovaAssistantOverlay
          messages={novaAssistant.messages}
          draft={novaAssistant.draft}
          busy={novaAssistant.busy}
          lastError={novaAssistant.lastError}
          activeProfileName={activeProfile?.name || null}
          canSend={novaAssistant.canSend}
          voiceRecording={(liveVoiceRecognitionActive || voiceRecording) && novaVoiceModeActive}
          voiceBusy={voiceBusy}
          listeningActive={novaListeningActive}
          handsFreeEnabled={novaHandsFreeEnabled}
          voiceModeEnabled={novaConversationModeEnabled}
          wakePhrase={novaWakePhrase}
          openRequestToken={novaOpenRequestToken}
          onSetDraft={novaAssistant.setDraft}
          onSend={() => {
            void novaAssistant.submitDraft();
          }}
          onClose={() => {
            if (novaConversationModeEnabled && !novaHandsFreeEnabled) {
              endNovaConversationSession("manual");
            }
          }}
          onClearConversation={novaAssistant.clearConversation}
          onOpenProviders={() => {
            setHomeHubVisible(false);
            setRoute("llms");
          }}
          onSetHandsFreeEnabled={(value) => {
            applyNovaHandsFreeEnabled(value);
          }}
          onToggleVoiceMode={() => {
            if (novaConversationModeEnabled) {
              endNovaConversationSession("manual");
              setStatus({ text: "Nova voice mode disabled.", error: false });
              return;
            }
            requestNovaOverlayOpen();
            novaConversationModeEnabledRef.current = true;
            setNovaConversationModeEnabled(true);
            resetNovaConversationIdleTimer();
            setStatus({ text: "Nova voice mode enabled. Speak naturally.", error: false });
            startNovaVoiceCaptureRef.current("conversation");
          }}
          onVoiceHoldStart={() => {
            requestNovaOverlayOpen();
            novaWalkieHoldActiveRef.current = true;
            startNovaVoiceCaptureRef.current("walkie");
          }}
          onVoiceHoldEnd={() => {
            novaWalkieHoldActiveRef.current = false;
            if (liveVoiceRecognitionActive) {
              void stopLiveRecognition("stop");
              return;
            }
            if (voiceRecording) {
              void stopVoiceCaptureIntoNova();
              return;
            }
            setNovaVoiceModeActive(false);
          }}
        />
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
          void runWithStatus(`Closing ${focusedSession}`, async () => {
            if (isLocalSession(focusedSession)) {
              throw new Error("Local LLM sessions cannot be closed from fullscreen controls.");
            }
            if (sessionReadOnly[focusedSession]) {
              throw new Error(`${focusedSession} is read-only. Disable read-only before closing it.`);
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
        visible={!showLaunchIntro && !onboardingCompleted}
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
          void (async () => {
            setStatus({ text: "Completing onboarding", error: false });
            await setRequireBiometric(biometric);
            await completeOnboarding();
            try {
              await addServerDirect({
                name: server.name,
                baseUrl: server.url,
                token: server.token,
                defaultCwd: server.cwd,
                terminalBackend: DEFAULT_TERMINAL_BACKEND,
              });
              setRoute("terminals");
              setHomeHubVisible(true);
              setReady("Onboarding complete");
            } catch (error) {
              importServerConfig({
                name: server.name,
                url: server.url,
                token: server.token,
                cwd: server.cwd,
              });
              setRoute("servers");
              setHomeHubVisible(false);
              const message = error instanceof Error ? error.message : String(error);
              setStatus({
                text: `Onboarding complete. Could not save server automatically: ${message}`,
                error: true,
              });
            }
          })();
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

      <LaunchIntro
        visible={showLaunchIntro}
        onDone={() => {
          setShowLaunchIntro(false);
        }}
      />
    </SafeAreaView>
  );
}
