import { ServerProfile, TerminalBackendKind } from "./types";

export const STORAGE_SERVERS = "novaremote.servers.v1";
export const STORAGE_ACTIVE_SERVER_ID = "novaremote.active_server_id.v1";
export const STORAGE_LEGACY_BASE_URL = "novaremote.base_url";
export const STORAGE_LEGACY_TOKEN = "novaremote.token";
export const STORAGE_HISTORY_PREFIX = "novaremote.history.v1";
export const STORAGE_SNIPPETS = "novaremote.snippets.v1";
export const STORAGE_SESSION_TAGS_PREFIX = "novaremote.session_tags.v1";
export const STORAGE_REQUIRE_BIOMETRIC = "novaremote.require_biometric.v1";
export const STORAGE_ONBOARDING_DONE = "novaremote.onboarding_done.v1";
export const STORAGE_TUTORIAL_DONE = "novaremote.tutorial_done.v1";
export const STORAGE_REQUIRE_DANGER_CONFIRM = "novaremote.require_danger_confirm.v1";
export const STORAGE_LLM_PROFILES = "novaremote.llm_profiles.v1";
export const STORAGE_ACTIVE_LLM_PROFILE_ID = "novaremote.active_llm_profile_id.v1";
export const STORAGE_TERMINAL_THEME = "novaremote.terminal_theme.v1";
export const STORAGE_WATCH_RULES_PREFIX = "novaremote.watch_rules.v1";
export const STORAGE_PINNED_SESSIONS_PREFIX = "novaremote.pinned_sessions.v1";
export const STORAGE_COMMAND_QUEUE_PREFIX = "novaremote.command_queue.v1";

export const DEFAULT_BASE_URL = "";
export const DEFAULT_CWD = "";
export const DEFAULT_SERVER_NAME = "My Server";
export const DEFAULT_TERMINAL_BACKEND: TerminalBackendKind = "auto";
export const DEFAULT_FLEET_WAIT_MS = 5000;

export const SERVER_URL_PLACEHOLDER = "https://your-server:8787";
export const CWD_PLACEHOLDER = "/path/to/your/project";

export const BRAND_LOGO = require("../assets/novaai-logo-user.png");

export const STREAM_RETRY_BASE_MS = 900;
export const STREAM_RETRY_FACTOR = 1.5;
export const STREAM_RETRY_MAX_MS = 30000;

export const POLL_INTERVAL_MS = 1800;
export const HEALTH_PING_INTERVAL_MS = 15000;
export const HISTORY_MAX_ITEMS = 50;
export const FREE_SERVER_LIMIT = 1;
export const FREE_SESSION_LIMIT = 2;
export const LOCAL_LLM_SESSION_PREFIX = "llm-";

export function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildDefaultServer(): ServerProfile {
  return {
    id: makeId(),
    name: DEFAULT_SERVER_NAME,
    baseUrl: DEFAULT_BASE_URL,
    token: "",
    defaultCwd: DEFAULT_CWD,
    terminalBackend: DEFAULT_TERMINAL_BACKEND,
  };
}

export function sortByCreatedAt<T extends { created_at?: string }>(sessions: T[]): T[] {
  return sessions.slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

export function isLikelyAiSession(name: string): boolean {
  return name.toLowerCase().includes("codex");
}

export function isLocalLlmSession(name: string): boolean {
  return name.startsWith(LOCAL_LLM_SESSION_PREFIX);
}

export function makeShellSessionName(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `term-${stamp}-${suffix}`;
}

export function makeLocalLlmSessionName(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `${LOCAL_LLM_SESSION_PREFIX}${stamp}-${suffix}`;
}
