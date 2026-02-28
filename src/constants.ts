import { ServerProfile } from "./types";

export const STORAGE_SERVERS = "novaremote.servers.v1";
export const STORAGE_ACTIVE_SERVER_ID = "novaremote.active_server_id.v1";
export const STORAGE_LEGACY_BASE_URL = "novaremote.base_url";
export const STORAGE_LEGACY_TOKEN = "novaremote.token";

export const DEFAULT_BASE_URL = "";
export const DEFAULT_CWD = "";
export const DEFAULT_SERVER_NAME = "My Server";

export const SERVER_URL_PLACEHOLDER = "https://your-server:8787";
export const CWD_PLACEHOLDER = "/path/to/your/project";

export const BRAND_LOGO = require("../assets/novaai-logo-user.png");

export const STREAM_RETRY_BASE_MS = 900;
export const STREAM_RETRY_FACTOR = 1.5;
export const STREAM_RETRY_MAX_MS = 30000;

export const POLL_INTERVAL_MS = 1800;

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
  };
}

export function sortByCreatedAt<T extends { created_at?: string }>(sessions: T[]): T[] {
  return sessions.slice().sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
}

export function isLikelyAiSession(name: string): boolean {
  return name.toLowerCase().includes("codex");
}

export function makeShellSessionName(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `term-${stamp}-${suffix}`;
}
