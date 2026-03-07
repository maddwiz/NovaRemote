#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

API_REPO="${NOVAREMOTE_CLOUD_REPO:-${ROOT_DIR}/../NovaRemoteCloud}"
DASHBOARD_REPO="${NOVAREMOTE_CLOUD_DASHBOARD_REPO:-${ROOT_DIR}/../NovaRemoteCloudDashboard}"
API_REMOTE_URL=""
DASHBOARD_REMOTE_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --api)
      if [[ $# -lt 2 ]]; then
        echo "Missing path after --api"
        exit 1
      fi
      API_REPO="$2"
      shift 2
      ;;
    --dashboard)
      if [[ $# -lt 2 ]]; then
        echo "Missing path after --dashboard"
        exit 1
      fi
      DASHBOARD_REPO="$2"
      shift 2
      ;;
    --api-remote)
      if [[ $# -lt 2 ]]; then
        echo "Missing URL after --api-remote"
        exit 1
      fi
      API_REMOTE_URL="$2"
      shift 2
      ;;
    --dashboard-remote)
      if [[ $# -lt 2 ]]; then
        echo "Missing URL after --dashboard-remote"
        exit 1
      fi
      DASHBOARD_REMOTE_URL="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: scripts/bootstrap-cloud-stack.sh [--api PATH] [--dashboard PATH] [--api-remote URL] [--dashboard-remote URL]"
      exit 1
      ;;
  esac
done

mkdir -p "${API_REPO}" "${DASHBOARD_REPO}"
API_REPO="$(cd "${API_REPO}" && pwd)"
DASHBOARD_REPO="$(cd "${DASHBOARD_REPO}" && pwd)"

init_repo() {
  local repo_dir="$1"
  if [[ ! -d "${repo_dir}/.git" ]]; then
    git -C "${repo_dir}" init >/dev/null 2>&1 || true
  fi
}

configure_remote() {
  local repo_dir="$1"
  local url="$2"
  if [[ -z "${url}" ]]; then
    return 0
  fi
  if git -C "${repo_dir}" remote get-url origin >/dev/null 2>&1; then
    git -C "${repo_dir}" remote set-url origin "${url}"
  else
    git -C "${repo_dir}" remote add origin "${url}"
  fi
}

if [[ ! -f "${API_REPO}/README.md" ]]; then
  cat > "${API_REPO}/README.md" <<'DOC'
# NovaRemoteCloud

Metadata control plane for team auth, token brokerage, audit ingest, and policy management.

## Quickstart

```bash
npm install
npm run dev
```

Default server address: `http://localhost:8788`

This scaffold uses file-backed JSON state by default (`NOVA_CLOUD_STATE_FILE`) to preserve data across restarts. Replace with PostgreSQL + migrations before production rollout.
DOC
fi

mkdir -p "${API_REPO}/src" "${API_REPO}/contracts"

if [[ ! -f "${API_REPO}/package.json" ]]; then
  cat > "${API_REPO}/package.json" <<'JSON'
{
  "name": "novaremote-cloud",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "start": "node dist/server.js",
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "express": "^4.21.2",
    "helmet": "^8.1.0",
    "zod": "^3.25.76"
  },
  "devDependencies": {
    "@types/cors": "^2.8.19",
    "@types/express": "^4.17.22",
    "@types/node": "^24.5.2",
    "tsx": "^4.20.5",
    "typescript": "^5.9.2"
  }
}
JSON
fi

if [[ ! -f "${API_REPO}/tsconfig.json" ]]; then
  cat > "${API_REPO}/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts"]
}
JSON
fi

if [[ ! -f "${API_REPO}/.env.example" ]]; then
  cat > "${API_REPO}/.env.example" <<'ENV'
PORT=8788
NOVA_CLOUD_JWT_SECRET=replace-me
NOVA_CLOUD_TOKEN_TTL_SECONDS=7200
NOVA_CLOUD_STATE_FILE=./data/state.json
ENV
fi

if [[ ! -f "${API_REPO}/src/server.ts" ]]; then
  cat > "${API_REPO}/src/server.ts" <<'TS'
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

type TeamRole = "admin" | "operator" | "viewer" | "billing";
type TeamPermission = "servers:read" | "servers:write" | "servers:delete" | "sessions:create" | "sessions:send" | "sessions:view" | "fleet:execute" | "settings:manage" | "team:invite" | "team:manage" | "audit:read";

type TeamMemberRecord = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  serverIds: string[];
};

type TeamIdentity = {
  provider: "novaremote_cloud" | "saml" | "oidc" | "ldap_proxy";
  userId: string;
  email: string;
  displayName: string;
  teamId: string;
  teamName: string;
  role: TeamRole;
  permissions: TeamPermission[];
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: number;
};

type TeamServer = {
  id: string;
  teamServerId: string;
  name: string;
  baseUrl: string;
  defaultCwd: string;
  permissionLevel: "admin" | "operator" | "viewer";
};

type FleetApproval = {
  id: string;
  command: string;
  requestedByUserId: string;
  requestedByEmail: string;
  targets: string[];
  createdAt: string;
  updatedAt: string;
  status: "pending" | "approved" | "denied" | "expired";
  note?: string;
  expiresAt?: string;
  reviewedByUserId?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  executionClaimedByUserId?: string;
  executionClaimedByEmail?: string;
  executionClaimedAt?: string;
  executionToken?: string;
  executionCompletedByUserId?: string;
  executionCompletedByEmail?: string;
  executionCompletedAt?: string;
  executionResult?: "succeeded" | "failed";
  executionSummary?: string;
};

type TeamSsoProviderConfig = {
  provider: "saml" | "oidc";
  enabled: boolean;
  displayName?: string;
  issuerUrl?: string;
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  callbackUrl?: string;
  updatedAt?: string;
};

type AuditEvent = {
  id: string;
  timestamp: number;
  action: string;
  serverId: string;
  serverName: string;
  session: string;
  detail: string;
  userId: string;
  userEmail: string;
  approved?: boolean | null;
  deviceId?: string;
  appVersion?: string;
};

const ROLE_PERMISSIONS: Record<TeamRole, TeamPermission[]> = {
  admin: [
    "servers:read",
    "servers:write",
    "servers:delete",
    "sessions:create",
    "sessions:send",
    "sessions:view",
    "fleet:execute",
    "settings:manage",
    "team:invite",
    "team:manage",
    "audit:read",
  ],
  operator: [
    "servers:read",
    "sessions:create",
    "sessions:send",
    "sessions:view",
    "fleet:execute",
    "audit:read",
  ],
  viewer: [
    "servers:read",
    "sessions:view",
    "audit:read",
  ],
  billing: [
    "audit:read",
  ],
};

function permissionsForRole(role: TeamRole): TeamPermission[] {
  return [...(ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS.viewer)];
}

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "512kb" }));

const baseIdentity: TeamIdentity = {
  provider: "novaremote_cloud",
  userId: "user-admin-1",
  email: "admin@novaremote.dev",
  displayName: "Nova Admin",
  teamId: "team-1",
  teamName: "NovaRemote Ops",
  role: "admin",
  permissions: permissionsForRole("admin"),
  accessToken: `access-${randomUUID()}`,
  refreshToken: `refresh-${randomUUID()}`,
  tokenExpiresAt: Date.now() + 60 * 60 * 1000
};

const teamServers: TeamServer[] = [
  { id: "srv-dgx", teamServerId: "srv-dgx", name: "DGX", baseUrl: "https://dgx.example.com", defaultCwd: "/workspace", permissionLevel: "admin" },
  { id: "srv-home", teamServerId: "srv-home", name: "Homelab", baseUrl: "https://homelab.example.com", defaultCwd: "/home/dev", permissionLevel: "operator" }
];

const teamMembers: TeamMemberRecord[] = [
  { id: "user-admin-1", name: "Nova Admin", email: "admin@novaremote.dev", role: "admin", serverIds: teamServers.map((server) => server.id) }
];

function syncBaseIdentityFromMembers() {
  const member = teamMembers.find((entry) => entry.id === baseIdentity.userId);
  if (!member) {
    return;
  }
  baseIdentity.role = member.role;
  baseIdentity.permissions = permissionsForRole(member.role);
  baseIdentity.email = member.email || baseIdentity.email;
  baseIdentity.displayName = member.name || baseIdentity.displayName;
}

const fleetApprovals: FleetApproval[] = [];
const teamInvites: Array<{
  id: string;
  email: string;
  role: TeamRole;
  status: "pending" | "accepted" | "expired" | "revoked";
  inviteCode?: string;
  inviteLink?: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
  acceptedAt?: string;
}> = [];
const teamSsoProviders: TeamSsoProviderConfig[] = [
  {
    provider: "oidc",
    enabled: true,
    displayName: "Okta OIDC",
    issuerUrl: "https://id.example.com",
    clientId: "novaremote-mobile",
    callbackUrl: "novaremote://auth/team/sso/oidc",
    updatedAt: new Date().toISOString()
  },
  {
    provider: "saml",
    enabled: false,
    displayName: "SAML",
    callbackUrl: "novaremote://auth/team/sso/saml",
    updatedAt: new Date().toISOString()
  }
];
const auditEvents: AuditEvent[] = [];
const auditExportJobs: Array<{
  exportId: string;
  format: "json" | "csv";
  status: "pending" | "ready" | "failed";
  createdAt: string;
  expiresAt?: string;
  downloadUrl?: string;
  detail?: string;
}> = [];
const teamSettings = {
  enforceDangerConfirm: true,
  commandBlocklist: [],
  sessionTimeoutMinutes: 20,
  requireSessionRecording: false,
  requireFleetApproval: false
};

function effectiveTeamSettingsForIdentity(_identity: TeamIdentity) {
  return { ...teamSettings };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stateFilePath =
  process.env.NOVA_CLOUD_STATE_FILE && process.env.NOVA_CLOUD_STATE_FILE.trim()
    ? path.resolve(process.cwd(), process.env.NOVA_CLOUD_STATE_FILE.trim())
    : path.resolve(__dirname, "../data/state.json");
const saveDebounceMsRaw = Number.parseInt(process.env.NOVA_CLOUD_STATE_SAVE_DEBOUNCE_MS || "200", 10);
const saveDebounceMs = Number.isFinite(saveDebounceMsRaw) && saveDebounceMsRaw >= 0 ? saveDebounceMsRaw : 200;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const AUDIT_EXPORT_PROCESSING_MS = 1_500;
const AUDIT_EXPORT_TTL_MS = 60 * 60 * 1000;

function replaceArrayInPlace<T>(target: T[], source: T[]) {
  target.splice(0, target.length, ...source);
}

function snapshotState() {
  return {
    teamServers,
    teamMembers,
    teamInvites,
    teamSsoProviders,
    fleetApprovals,
    auditEvents,
    auditExportJobs,
    teamSettings,
  };
}

async function persistState() {
  try {
    await fs.mkdir(path.dirname(stateFilePath), { recursive: true });
    await fs.writeFile(stateFilePath, JSON.stringify(snapshotState(), null, 2), "utf8");
  } catch (error) {
    console.warn("Failed to persist state:", error);
  }
}

function schedulePersist() {
  if (saveDebounceMs === 0) {
    void persistState();
    return;
  }
  if (persistTimer) {
    clearTimeout(persistTimer);
  }
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistState();
  }, saveDebounceMs);
}

async function loadState() {
  try {
    const raw = await fs.readFile(stateFilePath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (Array.isArray(parsed.teamServers)) {
      replaceArrayInPlace(teamServers, parsed.teamServers as TeamServer[]);
    }
    if (Array.isArray(parsed.teamMembers)) {
      replaceArrayInPlace(
        teamMembers,
        parsed.teamMembers as TeamMemberRecord[]
      );
    }
    if (Array.isArray(parsed.teamInvites)) {
      replaceArrayInPlace(teamInvites, parsed.teamInvites as typeof teamInvites);
    }
    if (Array.isArray(parsed.teamSsoProviders)) {
      replaceArrayInPlace(teamSsoProviders, parsed.teamSsoProviders as TeamSsoProviderConfig[]);
    }
    if (Array.isArray(parsed.fleetApprovals)) {
      replaceArrayInPlace(fleetApprovals, parsed.fleetApprovals as FleetApproval[]);
    }
    if (Array.isArray(parsed.auditEvents)) {
      replaceArrayInPlace(auditEvents, parsed.auditEvents);
    }
    if (Array.isArray(parsed.auditExportJobs)) {
      replaceArrayInPlace(auditExportJobs, parsed.auditExportJobs as typeof auditExportJobs);
    }
    if (parsed.teamSettings && typeof parsed.teamSettings === "object") {
      Object.assign(teamSettings, parsed.teamSettings);
    }
    syncBaseIdentityFromMembers();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") {
      console.warn("Failed to load persisted state:", error);
    }
  }
}

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "operator", "viewer", "billing"])
});

const loginSchema = z.object({
  provider: z.literal("novaremote_cloud"),
  email: z.string().email(),
  password: z.string().min(1),
  inviteCode: z.string().trim().min(1).optional(),
});

const ssoExchangeSchema = z
  .object({
    provider: z.enum(["oidc", "saml"]),
    idToken: z.string().trim().min(1).optional(),
    accessToken: z.string().trim().min(1).optional(),
    inviteCode: z.string().trim().min(1).optional(),
  })
  .refine((value) => Boolean(value.idToken || value.accessToken), {
    message: "idToken or accessToken is required",
  });

const refreshTokenSchema = z.object({
  refreshToken: z.string().trim().min(1),
});

const fleetExecutionCompleteSchema = z.object({
  executionToken: z.string().trim().min(1),
  status: z.enum(["succeeded", "failed"]).default("succeeded"),
  summary: z.string().trim().max(2000).optional(),
});

const teamServerCreateSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().url(),
  defaultCwd: z.string().trim().min(1).default("/"),
  permissionLevel: z.enum(["admin", "operator", "viewer"]).default("operator"),
});

const teamServerPatchSchema = teamServerCreateSchema.partial();

const teamSettingsPatchSchema = z.object({
  enforceDangerConfirm: z.boolean().nullable().optional(),
  requireFleetApproval: z.boolean().nullable().optional(),
  requireSessionRecording: z.boolean().nullable().optional(),
  sessionTimeoutMinutes: z.number().int().min(1).max(24 * 60).nullable().optional(),
  commandBlocklist: z.array(z.string().trim().min(1)).max(200).optional(),
});

function normalizeCommandBlocklistPatterns(value: string[]): string[] {
  const deduped = new Set<string>();
  value.forEach((entry) => {
    const normalized = entry.trim();
    if (!normalized) {
      return;
    }
    deduped.add(normalized);
  });
  return Array.from(deduped.values());
}

function normalizeServerBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function normalizeAuditEvent(value: unknown): AuditEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const action = typeof parsed.action === "string" ? parsed.action.trim() : "";
  if (!action) {
    return null;
  }
  const timestampRaw = parsed.timestamp;
  const timestamp =
    typeof timestampRaw === "number" && Number.isFinite(timestampRaw)
      ? Math.round(timestampRaw)
      : Date.now();
  return {
    id:
      typeof parsed.id === "string" && parsed.id.trim()
        ? parsed.id.trim()
        : `audit-${randomUUID().slice(0, 10)}`,
    timestamp,
    action,
    serverId: typeof parsed.serverId === "string" ? parsed.serverId : "",
    serverName: typeof parsed.serverName === "string" ? parsed.serverName : "",
    session: typeof parsed.session === "string" ? parsed.session : "",
    detail: typeof parsed.detail === "string" ? parsed.detail : "",
    userId: typeof parsed.userId === "string" ? parsed.userId : baseIdentity.userId,
    userEmail: typeof parsed.userEmail === "string" ? parsed.userEmail : baseIdentity.email,
    approved:
      typeof parsed.approved === "boolean" || parsed.approved === null
        ? (parsed.approved as boolean | null)
        : undefined,
    deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : undefined,
    appVersion: typeof parsed.appVersion === "string" ? parsed.appVersion : undefined,
  };
}

type SystemAuditInput = {
  serverId?: string;
  serverName?: string;
  session?: string;
  approved?: boolean | null;
};

function recordSystemAuditEvent(action: string, detail: string, input: SystemAuditInput = {}, persist = true) {
  const event = normalizeAuditEvent({
    action,
    detail,
    timestamp: Date.now(),
    serverId: input.serverId || "",
    serverName: input.serverName || "",
    session: input.session || "",
    approved: input.approved,
    userId: baseIdentity.userId,
    userEmail: baseIdentity.email,
  });
  if (!event) {
    return;
  }
  auditEvents.push(event);
  if (persist) {
    schedulePersist();
  }
}

type MemberUsageSnapshot = {
  sessionsCreated: number;
  commandsSent: number;
  fleetExecutions: number;
  lastActiveTimestamp: number | null;
};

function buildEmptyMemberUsage(): MemberUsageSnapshot {
  return {
    sessionsCreated: 0,
    commandsSent: 0,
    fleetExecutions: 0,
    lastActiveTimestamp: null,
  };
}

function computeMemberUsageByIdentity() {
  const byUserId = new Map<string, MemberUsageSnapshot>();
  const byEmail = new Map<string, MemberUsageSnapshot>();

  for (const event of auditEvents) {
    const userId = typeof event.userId === "string" ? event.userId.trim() : "";
    const userEmail = typeof event.userEmail === "string" ? event.userEmail.trim().toLowerCase() : "";
    const hasIdentity = Boolean(userId || userEmail);
    if (!hasIdentity) {
      continue;
    }
    let stats: MemberUsageSnapshot | null = null;
    if (userId && byUserId.has(userId)) {
      stats = byUserId.get(userId) || null;
    } else if (userEmail && byEmail.has(userEmail)) {
      stats = byEmail.get(userEmail) || null;
    }
    if (!stats) {
      stats = buildEmptyMemberUsage();
    }

    const action = event.action.toLowerCase();
    if (action === "session_created") {
      stats.sessionsCreated += 1;
    }
    if (action === "command_sent" || action === "voice_command_sent") {
      stats.commandsSent += 1;
    }
    if (action === "fleet_executed" || action === "fleet_execution_claimed") {
      stats.fleetExecutions += 1;
    }

    if (Number.isFinite(event.timestamp)) {
      if (stats.lastActiveTimestamp === null || event.timestamp > stats.lastActiveTimestamp) {
        stats.lastActiveTimestamp = event.timestamp;
      }
    }

    if (userId) {
      byUserId.set(userId, stats);
    }
    if (userEmail) {
      byEmail.set(userEmail, stats);
    }
  }

  return { byUserId, byEmail };
}

function reconcileAuditExportJobs() {
  const nowMs = Date.now();
  let changed = false;
  const retained: typeof auditExportJobs = [];

  auditExportJobs.forEach((job) => {
    const expiresAtMs = job.expiresAt ? Date.parse(job.expiresAt) : Number.NaN;
    if (Number.isFinite(expiresAtMs) && expiresAtMs <= nowMs) {
      changed = true;
      recordSystemAuditEvent("audit_export_expired", `Expired audit export ${job.exportId}.`, {}, false);
      return;
    }

    if (job.status === "pending") {
      const createdAtMs = Date.parse(job.createdAt);
      if (Number.isFinite(createdAtMs) && nowMs - createdAtMs >= AUDIT_EXPORT_PROCESSING_MS) {
        job.status = "ready";
        job.downloadUrl = `https://cloud.novaremote.dev/exports/${job.exportId}.${job.format}`;
        job.detail = `Snapshot contains ${auditEvents.length} events`;
        changed = true;
        recordSystemAuditEvent("audit_export_ready", `Audit export ${job.exportId} is ready.`, {}, false);
      }
    }

    retained.push(job);
  });

  if (retained.length !== auditExportJobs.length) {
    auditExportJobs.splice(0, auditExportJobs.length, ...retained);
  }

  if (changed) {
    schedulePersist();
  }
}

function deriveDisplayNameFromEmail(email: string): string {
  const localPart = email.split("@")[0] || "team";
  const withSpaces = localPart.replace(/[._-]+/g, " ").trim();
  if (!withSpaces) {
    return "Team User";
  }
  return withSpaces
    .split(/\s+/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function defaultServerIdsForRole(role: TeamRole): string[] {
  if (role === "admin" || role === "operator") {
    return teamServers.map((server) => server.id);
  }
  return [];
}

type PermissionLevel = "admin" | "operator" | "viewer";

const permissionLevelRank: Record<PermissionLevel, number> = {
  viewer: 0,
  operator: 1,
  admin: 2,
};

function normalizePermissionLevel(value: unknown): PermissionLevel {
  const raw = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (raw === "admin" || raw === "operator" || raw === "viewer") {
    return raw;
  }
  return "viewer";
}

function rolePermissionCeiling(role: TeamRole): PermissionLevel {
  if (role === "admin") {
    return "admin";
  }
  if (role === "operator") {
    return "operator";
  }
  return "viewer";
}

function leastPrivilegeLevel(levels: PermissionLevel[]): PermissionLevel {
  if (levels.length === 0) {
    return "viewer";
  }
  return levels.reduce((lowest, current) =>
    permissionLevelRank[current] < permissionLevelRank[lowest] ? current : lowest
  );
}

function tokenPermissionsForLevel(level: PermissionLevel): string[] {
  if (level === "admin") {
    return ["read", "write", "execute", "admin"];
  }
  if (level === "operator") {
    return ["read", "write", "execute"];
  }
  return ["read"];
}

function findTeamMemberForIdentity(identity: TeamIdentity): TeamMemberRecord | null {
  const byId = teamMembers.find((entry) => entry.id === identity.userId);
  if (byId) {
    return byId;
  }
  const normalizedEmail = identity.email.trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }
  return teamMembers.find((entry) => entry.email.trim().toLowerCase() === normalizedEmail) || null;
}

function resolveVisibleServerIds(identity: TeamIdentity): Set<string> {
  if (identity.role === "admin") {
    return new Set(teamServers.map((server) => server.id));
  }
  const member = findTeamMemberForIdentity(identity);
  if (!member) {
    return new Set();
  }
  return new Set(member.serverIds);
}

function findTeamServerByAnyId(serverId: string) {
  const normalizedServerId = serverId.trim();
  if (!normalizedServerId) {
    return null;
  }
  return (
    teamServers.find((server) => server.id === normalizedServerId) ||
    teamServers.find((server) => server.teamServerId === normalizedServerId) ||
    null
  );
}

type NormalizedFleetTargets = {
  normalizedTargets: string[];
  unknownTargets: string[];
  unauthorizedTargets: string[];
};

function normalizeFleetTargetsForIdentity(rawTargets: string[], identity: TeamIdentity): NormalizedFleetTargets {
  const visibleServerIds = resolveVisibleServerIds(identity);
  const normalizedTargets = new Set<string>();
  const unknownTargets = new Set<string>();
  const unauthorizedTargets = new Set<string>();

  rawTargets.forEach((target) => {
    const server = findTeamServerByAnyId(target);
    if (!server) {
      unknownTargets.add(target);
      return;
    }
    if (identity.role !== "admin" && !visibleServerIds.has(server.id)) {
      unauthorizedTargets.add(server.id);
      return;
    }
    normalizedTargets.add(server.id);
  });

  return {
    normalizedTargets: Array.from(normalizedTargets.values()).sort((a, b) => a.localeCompare(b)),
    unknownTargets: Array.from(unknownTargets.values()).sort((a, b) => a.localeCompare(b)),
    unauthorizedTargets: Array.from(unauthorizedTargets.values()).sort((a, b) => a.localeCompare(b)),
  };
}

function redeemInviteCode(inviteCode: string, expectedEmail?: string): {
  member: (typeof teamMembers)[number] | null;
  detail?: string;
} {
  const normalizedCode = inviteCode.trim().toUpperCase();
  if (!normalizedCode) {
    return { member: null, detail: "Invite code is required" };
  }
  const invite = teamInvites.find(
    (entry) => typeof entry.inviteCode === "string" && entry.inviteCode.trim().toUpperCase() === normalizedCode
  );
  if (!invite) {
    return { member: null, detail: "Invalid invite code" };
  }
  if (invite.status !== "pending") {
    return { member: null, detail: `Invite is ${invite.status}` };
  }
  if (invite.expiresAt) {
    const expiresAtMs = Date.parse(invite.expiresAt);
    if (Number.isFinite(expiresAtMs) && expiresAtMs < Date.now()) {
      invite.status = "expired";
      recordSystemAuditEvent("invite_expired", `Invite ${invite.id} expired before redemption.`, {}, false);
      schedulePersist();
      return { member: null, detail: "Invite has expired" };
    }
  }
  const inviteEmail = invite.email.toLowerCase();
  if (expectedEmail && expectedEmail.toLowerCase() !== inviteEmail) {
    return { member: null, detail: "Invite code does not match login email" };
  }

  let member = teamMembers.find((entry) => entry.email.toLowerCase() === inviteEmail);
  if (!member) {
    member = {
      id: `user-${randomUUID().slice(0, 8)}`,
      name: deriveDisplayNameFromEmail(inviteEmail),
      email: inviteEmail,
      role: invite.role,
      serverIds: defaultServerIdsForRole(invite.role),
    };
    teamMembers.push(member);
  } else {
    member.role = invite.role;
    member.serverIds = Array.from(new Set([...member.serverIds, ...defaultServerIdsForRole(invite.role)]));
  }

  invite.status = "accepted";
  invite.acceptedAt = new Date().toISOString();
  recordSystemAuditEvent("invite_redeemed", `Invite ${invite.id} redeemed for ${member.email}.`, {}, false);
  schedulePersist();
  return { member };
}

function issueSession(overrides?: Partial<Pick<TeamIdentity, "provider" | "email" | "displayName">>) {
  syncBaseIdentityFromMembers();
  if (overrides?.provider) {
    baseIdentity.provider = overrides.provider;
  }
  if (overrides?.email) {
    baseIdentity.email = overrides.email;
  }
  if (overrides?.displayName) {
    baseIdentity.displayName = overrides.displayName;
  }
  baseIdentity.permissions = permissionsForRole(baseIdentity.role);
  baseIdentity.accessToken = `access-${randomUUID()}`;
  baseIdentity.refreshToken = `refresh-${randomUUID()}`;
  baseIdentity.tokenExpiresAt = Date.now() + 60 * 60 * 1000;
  return baseIdentity;
}

function unauthorized(res: Response, detail: string) {
  res.status(401).json({ detail });
}

function forbidden(res: Response, detail: string) {
  res.status(403).json({ detail });
}

function requireTeamPermission(permission: TeamPermission) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (!baseIdentity.permissions.includes(permission)) {
      return forbidden(res, `Missing permission: ${permission}`);
    }
    next();
  };
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || token !== baseIdentity.accessToken) {
    return unauthorized(res, "Unauthorized");
  }
  if (!Number.isFinite(baseIdentity.tokenExpiresAt) || Date.now() >= baseIdentity.tokenExpiresAt) {
    return unauthorized(res, "Team access token expired");
  }
  (req as Request & { identity?: TeamIdentity }).identity = { ...baseIdentity, permissions: [...baseIdentity.permissions] };
  next();
}

function normalizeApprovalCommand(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeApprovalTargets(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Set<string>();
  value.forEach((entry) => {
    const normalized = String(entry || "").trim();
    if (!normalized) {
      return;
    }
    deduped.add(normalized);
  });
  return Array.from(deduped.values()).sort((a, b) => a.localeCompare(b));
}

function approvalFingerprint(command: string, targets: string[]): string {
  return `${command.toLowerCase()}::${targets.join(",").toLowerCase()}`;
}

function expireApprovalIfNeeded(approval: FleetApproval, nowMs: number): FleetApproval["status"] {
  if (approval.status !== "pending") {
    return approval.status;
  }
  if (!approval.expiresAt) {
    return approval.status;
  }
  const expiresAtMs = Date.parse(approval.expiresAt);
  if (!Number.isFinite(expiresAtMs) || expiresAtMs > nowMs) {
    return approval.status;
  }
  approval.status = "expired";
  approval.updatedAt = new Date(nowMs).toISOString();
  return approval.status;
}

function expirePendingApprovals() {
  const nowMs = Date.now();
  let changed = false;
  fleetApprovals.forEach((approval) => {
    const before = approval.status;
    const after = expireApprovalIfNeeded(approval, nowMs);
    if (before !== after) {
      changed = true;
    }
  });
  if (changed) {
    schedulePersist();
  }
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/v1/auth/login", (req, res) => {
  const parsed = loginSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid login payload" });
  }
  const email = parsed.data.email.toLowerCase();
  const inviteCode = parsed.data.inviteCode?.trim() || "";
  if (inviteCode) {
    const redeemed = redeemInviteCode(inviteCode, email);
    if (!redeemed.member) {
      return res.status(400).json({ detail: redeemed.detail || "Unable to redeem invite code" });
    }
    baseIdentity.userId = redeemed.member.id;
    baseIdentity.role = redeemed.member.role;
    baseIdentity.email = redeemed.member.email;
    baseIdentity.displayName = redeemed.member.name;
  } else {
    const matchingMember = teamMembers.find((entry) => entry.email.toLowerCase() === email);
    if (matchingMember) {
      baseIdentity.userId = matchingMember.id;
      baseIdentity.role = matchingMember.role;
      baseIdentity.email = matchingMember.email;
      baseIdentity.displayName = matchingMember.name;
    }
  }
  const displayName = baseIdentity.displayName || deriveDisplayNameFromEmail(email);
  const issuedIdentity = issueSession({
    provider: "novaremote_cloud",
    email,
    displayName,
  });
  recordSystemAuditEvent("team_login", `Password sign-in for ${issuedIdentity.email}.`);
  res.json({
    identity: issuedIdentity,
  });
});

app.post("/v1/auth/sso/exchange", (req, res) => {
  const parsed = ssoExchangeSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid SSO exchange payload" });
  }
  const provider = parsed.data.provider === "saml" ? "saml" : "oidc";
  const inviteCode = parsed.data.inviteCode?.trim() || "";
  if (inviteCode) {
    const redeemed = redeemInviteCode(inviteCode);
    if (!redeemed.member) {
      return res.status(400).json({ detail: redeemed.detail || "Unable to redeem invite code" });
    }
    baseIdentity.userId = redeemed.member.id;
    baseIdentity.role = redeemed.member.role;
    baseIdentity.email = redeemed.member.email;
    baseIdentity.displayName = redeemed.member.name;
  }
  const issuedIdentity = issueSession({
    provider,
  });
  recordSystemAuditEvent("team_login_sso", `SSO sign-in via ${provider} for ${issuedIdentity.email}.`);
  res.json({
    identity: issuedIdentity,
  });
});

app.post("/v1/auth/refresh", (req, res) => {
  const parsed = refreshTokenSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "refreshToken is required" });
  }
  if (parsed.data.refreshToken !== baseIdentity.refreshToken) {
    return unauthorized(res, "Invalid refresh token");
  }
  const issuedIdentity = issueSession();
  recordSystemAuditEvent("team_session_refreshed", `Team session refreshed for ${issuedIdentity.email}.`);
  res.json({
    identity: issuedIdentity,
  });
});

app.post("/v1/auth/logout", (req, res) => {
  const parsed = refreshTokenSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "refreshToken is required" });
  }
  if (parsed.data.refreshToken !== baseIdentity.refreshToken) {
    return unauthorized(res, "Invalid refresh token");
  }
  recordSystemAuditEvent("team_logout", `Team session revoked for ${baseIdentity.email}.`);
  baseIdentity.accessToken = `revoked-${randomUUID()}`;
  baseIdentity.refreshToken = `revoked-${randomUUID()}`;
  baseIdentity.tokenExpiresAt = Date.now() - 1;
  res.json({ ok: true });
});

app.use("/v1", requireAuth);

app.post("/v1/tokens/provision", requireTeamPermission("servers:read"), (req, res) => {
  const identity = (req as Request & { identity?: TeamIdentity }).identity || null;
  const requestedServerId = String(req.body?.serverId || "").trim();
  if (!identity) {
    return unauthorized(res, "Authentication required");
  }
  if (!requestedServerId) {
    return res.status(400).json({ detail: "serverId is required" });
  }
  const targetServer =
    teamServers.find((server) => server.id === requestedServerId) ||
    teamServers.find((server) => server.teamServerId === requestedServerId);
  if (!targetServer) {
    return res.status(404).json({ detail: "Server not found" });
  }

  const callerMembership = findTeamMemberForIdentity(identity);
  const hasServerAccess =
    identity.role === "admin" || (callerMembership ? callerMembership.serverIds.includes(targetServer.id) : false);
  if (!hasServerAccess) {
    return forbidden(res, "Not authorized for this server.");
  }

  const requestedPermissionLevel = normalizePermissionLevel(req.body?.permissionLevel);
  const effectivePermissionLevel = leastPrivilegeLevel([
    requestedPermissionLevel,
    rolePermissionCeiling(identity.role),
    normalizePermissionLevel(targetServer.permissionLevel),
  ]);
  const permissions = tokenPermissionsForLevel(effectivePermissionLevel);
  recordSystemAuditEvent(
    "token_provisioned",
    `Provisioned ${effectivePermissionLevel} token for ${targetServer.name}.`,
    { serverId: targetServer.id, serverName: targetServer.name },
    false
  );
  res.json({
    serverId: targetServer.id,
    token: `srv-token-${targetServer.id}-${randomUUID()}`,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    permissions,
    permissionLevel: effectivePermissionLevel,
  });
});

app.get("/v1/team/servers", requireTeamPermission("servers:read"), (req, res) => {
  const identity = (req as Request & { identity?: TeamIdentity }).identity || null;
  if (!identity) {
    return unauthorized(res, "Authentication required");
  }
  const visibleServerIds = resolveVisibleServerIds(identity);
  const visibleServers =
    identity.role === "admin" ? teamServers : teamServers.filter((server) => visibleServerIds.has(server.id));
  res.json({ servers: visibleServers });
});

app.post("/v1/team/servers", requireTeamPermission("servers:write"), (req, res) => {
  const parsed = teamServerCreateSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid server payload" });
  }
  const id = `srv-${randomUUID().slice(0, 8)}`;
  const nextServer: TeamServer = {
    id,
    teamServerId: id,
    name: parsed.data.name,
    baseUrl: normalizeServerBaseUrl(parsed.data.baseUrl),
    defaultCwd: parsed.data.defaultCwd,
    permissionLevel: parsed.data.permissionLevel,
  };
  teamServers.unshift(nextServer);
  teamMembers.forEach((member) => {
    if (member.role === "admin" && !member.serverIds.includes(id)) {
      member.serverIds.push(id);
    }
  });
  recordSystemAuditEvent(
    "server_added",
    `Added team server ${nextServer.name} (${nextServer.baseUrl}).`,
    { serverId: nextServer.id, serverName: nextServer.name },
    false
  );
  schedulePersist();
  res.json({ server: nextServer });
});

app.patch("/v1/team/servers/:serverId", requireTeamPermission("servers:write"), (req, res) => {
  const serverId = String(req.params.serverId || "").trim();
  const target = teamServers.find((entry) => entry.id === serverId);
  if (!target) {
    return res.status(404).json({ detail: "Server not found" });
  }
  const parsed = teamServerPatchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid server payload" });
  }
  if (parsed.data.name) {
    target.name = parsed.data.name;
  }
  if (parsed.data.baseUrl) {
    target.baseUrl = normalizeServerBaseUrl(parsed.data.baseUrl);
  }
  if (parsed.data.defaultCwd) {
    target.defaultCwd = parsed.data.defaultCwd;
  }
  if (parsed.data.permissionLevel) {
    target.permissionLevel = parsed.data.permissionLevel;
  }
  recordSystemAuditEvent(
    "server_updated",
    `Updated team server ${target.name}.`,
    { serverId: target.id, serverName: target.name },
    false
  );
  schedulePersist();
  res.json({ server: target });
});

app.delete("/v1/team/servers/:serverId", requireTeamPermission("servers:delete"), (req, res) => {
  const serverId = String(req.params.serverId || "").trim();
  const index = teamServers.findIndex((entry) => entry.id === serverId);
  if (index === -1) {
    return res.status(404).json({ detail: "Server not found" });
  }
  const [removed] = teamServers.splice(index, 1);
  teamMembers.forEach((member) => {
    member.serverIds = member.serverIds.filter((id) => id !== serverId);
  });
  recordSystemAuditEvent(
    "server_removed",
    `Removed team server ${removed.name}.`,
    { serverId: removed.id, serverName: removed.name },
    false
  );
  schedulePersist();
  res.json({ server: removed, ok: true });
});

app.get("/v1/team/members", requireTeamPermission("team:manage"), (_req, res) => {
  const usageByIdentity = computeMemberUsageByIdentity();
  const members = teamMembers.map((member) => {
    const normalizedEmail = member.email.trim().toLowerCase();
    const stats = usageByIdentity.byUserId.get(member.id) ?? usageByIdentity.byEmail.get(normalizedEmail);
    const lastActiveAt =
      stats && stats.lastActiveTimestamp !== null ? new Date(stats.lastActiveTimestamp).toISOString() : undefined;
    return {
      ...member,
      sessionsCreated: stats?.sessionsCreated ?? 0,
      commandsSent: stats?.commandsSent ?? 0,
      fleetExecutions: stats?.fleetExecutions ?? 0,
      lastActiveAt,
    };
  });
  res.json({ members });
});

app.patch("/v1/team/members/:memberId", requireTeamPermission("team:manage"), (req, res) => {
  const memberId = String(req.params.memberId || "");
  const roleRaw = String(req.body?.role || "").trim().toLowerCase();
  if (roleRaw !== "admin" && roleRaw !== "operator" && roleRaw !== "viewer" && roleRaw !== "billing") {
    return res.status(400).json({ detail: "role must be admin, operator, viewer, or billing" });
  }
  const role = roleRaw as TeamRole;
  const member = teamMembers.find((entry) => entry.id === memberId);
  if (!member) {
    return res.status(404).json({ detail: "Member not found" });
  }
  member.role = role;
  if (member.id === baseIdentity.userId) {
    syncBaseIdentityFromMembers();
  }
  recordSystemAuditEvent("member_role_updated", `Updated ${member.email} role to ${role}.`, {}, false);
  schedulePersist();
  res.json({ ok: true });
});

app.put("/v1/team/members/:memberId/servers", requireTeamPermission("team:manage"), (req, res) => {
  const memberId = String(req.params.memberId || "");
  const member = teamMembers.find((entry) => entry.id === memberId);
  if (!member) {
    return res.status(404).json({ detail: "Member not found" });
  }
  const rawServerIds = Array.isArray(req.body?.serverIds) ? req.body.serverIds : [];
  const normalizedServerIds = Array.from(
    new Set(
      rawServerIds
        .map((entry: unknown) => String(entry || "").trim())
        .filter((entry) => Boolean(entry))
    )
  );
  const knownServerIds = new Set(teamServers.map((server) => server.id));
  const invalidServerIds = normalizedServerIds.filter((id) => !knownServerIds.has(id));
  if (invalidServerIds.length > 0) {
    return res.status(400).json({ detail: `Unknown serverIds: ${invalidServerIds.join(", ")}` });
  }
  member.serverIds =
    member.role === "admin"
      ? Array.from(new Set([...normalizedServerIds, ...teamServers.map((server) => server.id)]))
      : normalizedServerIds;
  recordSystemAuditEvent(
    "member_server_assignment_updated",
    `Updated server assignments for ${member.email} (${member.serverIds.length} servers).`,
    {},
    false
  );
  schedulePersist();
  res.json({ ok: true });
});

app.get("/v1/team/settings", requireTeamPermission("settings:manage"), (_req, res) => {
  res.json({ settings: teamSettings });
});

app.get("/v1/team/settings/effective", requireTeamPermission("servers:read"), (req, res) => {
  const identity = (req as Request & { identity?: TeamIdentity }).identity;
  if (!identity) {
    return unauthorized(res, "Unauthorized");
  }
  return res.json({
    settings: effectiveTeamSettingsForIdentity(identity),
    managedBy: "team_admin",
  });
});

app.patch("/v1/team/settings", requireTeamPermission("settings:manage"), (req, res) => {
  const parsed = teamSettingsPatchSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid settings payload" });
  }
  const nextSettings = { ...parsed.data };
  if (Array.isArray(nextSettings.commandBlocklist)) {
    const normalizedBlocklist = normalizeCommandBlocklistPatterns(nextSettings.commandBlocklist);
    for (const pattern of normalizedBlocklist) {
      try {
        // Validate pattern syntax before accepting policy changes.
        // eslint-disable-next-line no-new
        new RegExp(pattern);
      } catch (error) {
        return res.status(400).json({
          detail: `Invalid command blocklist regex: ${pattern}`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    nextSettings.commandBlocklist = normalizedBlocklist;
  }
  Object.assign(teamSettings, nextSettings);
  recordSystemAuditEvent(
    "settings_changed",
    `Updated team settings (${Object.keys(nextSettings).join(", ") || "no-op"}).`,
    {},
    false
  );
  schedulePersist();
  res.json({ settings: teamSettings });
});

app.get("/v1/team/usage", requireTeamPermission("team:manage"), (_req, res) => {
  const usageByIdentity = computeMemberUsageByIdentity();
  const uniqueUsageSnapshots = new Set<MemberUsageSnapshot>();
  usageByIdentity.byUserId.forEach((snapshot) => uniqueUsageSnapshots.add(snapshot));
  usageByIdentity.byEmail.forEach((snapshot) => uniqueUsageSnapshots.add(snapshot));
  let sessionsCreated = 0;
  let commandsSent = 0;
  let fleetExecutions = 0;
  uniqueUsageSnapshots.forEach((snapshot) => {
    sessionsCreated += snapshot.sessionsCreated;
    commandsSent += snapshot.commandsSent;
    fleetExecutions += snapshot.fleetExecutions;
  });
  res.json({
    usage: {
      activeMembers: teamMembers.length,
      sessionsCreated,
      commandsSent,
      fleetExecutions
    }
  });
});

app.get("/v1/team/invites", requireTeamPermission("team:invite"), (_req, res) => {
  res.json({ invites: teamInvites });
});

app.post("/v1/team/invites", requireTeamPermission("team:invite"), (req, res) => {
  const parsed = inviteSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid invite payload" });
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const invite = {
    id: `invite-${randomUUID().slice(0, 8)}`,
    email: parsed.data.email.toLowerCase(),
    role: parsed.data.role,
    status: "pending" as const,
    inviteCode: `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    inviteLink: `https://cloud.novaremote.dev/invite/${randomUUID().slice(0, 8)}`,
    createdAt: now.toISOString(),
    expiresAt
  };
  teamInvites.unshift(invite);
  recordSystemAuditEvent("invite_created", `Created invite for ${invite.email} as ${invite.role}.`, {}, false);
  schedulePersist();
  res.json({ invite });
});

app.delete("/v1/team/invites/:inviteId", requireTeamPermission("team:invite"), (req, res) => {
  const invite = teamInvites.find((entry) => entry.id === req.params.inviteId);
  if (!invite) {
    return res.status(404).json({ detail: "Invite not found" });
  }
  invite.status = "revoked";
  invite.revokedAt = new Date().toISOString();
  recordSystemAuditEvent("invite_revoked", `Revoked invite ${invite.id} for ${invite.email}.`, {}, false);
  schedulePersist();
  res.json({ ok: true });
});

app.get("/v1/team/sso/providers", requireTeamPermission("team:manage"), (_req, res) => {
  res.json({ providers: teamSsoProviders });
});

app.patch("/v1/team/sso/providers/:provider", requireTeamPermission("team:manage"), (req, res) => {
  const provider = String(req.params.provider || "").trim().toLowerCase();
  if (provider !== "oidc" && provider !== "saml") {
    return res.status(400).json({ detail: "Invalid provider" });
  }
  const entry = teamSsoProviders.find((item) => item.provider === provider);
  if (!entry) {
    return res.status(404).json({ detail: "Provider not found" });
  }
  const body = req.body && typeof req.body === "object" ? req.body : {};
  if (typeof (body as { enabled?: unknown }).enabled === "boolean") {
    entry.enabled = (body as { enabled: boolean }).enabled;
  }
  if (typeof (body as { displayName?: unknown }).displayName === "string") {
    entry.displayName = String((body as { displayName: string }).displayName);
  }
  if (typeof (body as { issuerUrl?: unknown }).issuerUrl === "string") {
    entry.issuerUrl = String((body as { issuerUrl: string }).issuerUrl);
  }
  if (typeof (body as { authUrl?: unknown }).authUrl === "string") {
    entry.authUrl = String((body as { authUrl: string }).authUrl);
  }
  if (typeof (body as { tokenUrl?: unknown }).tokenUrl === "string") {
    entry.tokenUrl = String((body as { tokenUrl: string }).tokenUrl);
  }
  if (typeof (body as { clientId?: unknown }).clientId === "string") {
    entry.clientId = String((body as { clientId: string }).clientId);
  }
  if (typeof (body as { callbackUrl?: unknown }).callbackUrl === "string") {
    entry.callbackUrl = String((body as { callbackUrl: string }).callbackUrl);
  }
  entry.updatedAt = new Date().toISOString();
  recordSystemAuditEvent("sso_provider_updated", `Updated ${provider.toUpperCase()} SSO provider configuration.`, {}, false);
  schedulePersist();
  res.json({ provider: entry });
});

app.get("/v1/team/fleet/approvals", requireTeamPermission("team:manage"), (_req, res) => {
  expirePendingApprovals();
  res.json({ approvals: fleetApprovals });
});

app.post("/v1/team/fleet/approvals", requireTeamPermission("fleet:execute"), (req, res) => {
  const identity = (req as Request & { identity?: TeamIdentity }).identity || null;
  if (!identity) {
    return unauthorized(res, "Authentication required");
  }
  expirePendingApprovals();
  const command = normalizeApprovalCommand(req.body?.command);
  const requestedTargets = normalizeApprovalTargets(req.body?.targets);
  if (!command) {
    return res.status(400).json({ detail: "command is required" });
  }
  if (requestedTargets.length === 0) {
    return res.status(400).json({ detail: "At least one target is required" });
  }
  const targetValidation = normalizeFleetTargetsForIdentity(requestedTargets, identity);
  if (targetValidation.unknownTargets.length > 0) {
    return res.status(400).json({ detail: `Unknown targets: ${targetValidation.unknownTargets.join(", ")}` });
  }
  if (targetValidation.unauthorizedTargets.length > 0) {
    return forbidden(res, `Not authorized for targets: ${targetValidation.unauthorizedTargets.join(", ")}`);
  }
  const targets = targetValidation.normalizedTargets;
  const fingerprint = approvalFingerprint(command, targets);
  const duplicate = fleetApprovals.find(
    (entry) =>
      entry.status === "pending" &&
      entry.requestedByUserId === identity.userId &&
      approvalFingerprint(entry.command, normalizeApprovalTargets(entry.targets)) === fingerprint
  );
  if (duplicate) {
    return res.status(409).json({ detail: `Fleet approval already pending (#${duplicate.id}).`, approval: duplicate });
  }
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const approval: FleetApproval = {
    id: `fa-${randomUUID().slice(0, 8)}`,
    command,
    requestedByUserId: identity.userId,
    requestedByEmail: identity.email,
    targets,
    createdAt: now,
    updatedAt: now,
    status: "pending",
    note: typeof req.body?.note === "string" ? req.body.note : undefined,
    expiresAt
  };
  fleetApprovals.unshift(approval);
  recordSystemAuditEvent(
    "fleet_approval_requested",
    `Requested fleet approval for command: ${approval.command}`,
    { approved: null },
    false
  );
  schedulePersist();
  res.json({ approval });
});

app.post("/v1/team/fleet/approvals/:approvalId/approve", requireTeamPermission("team:manage"), (req, res) => {
  const approval = fleetApprovals.find((entry) => entry.id === req.params.approvalId);
  if (!approval) {
    return res.status(404).json({ detail: "Approval not found" });
  }
  const currentStatus = expireApprovalIfNeeded(approval, Date.now());
  if (currentStatus === "expired") {
    schedulePersist();
    return res.status(409).json({ detail: "Approval has expired" });
  }
  if (approval.status !== "pending") {
    return res.status(409).json({ detail: `Approval is already ${approval.status}` });
  }
  if (approval.requestedByUserId === baseIdentity.userId) {
    return res.status(403).json({ detail: "Fleet approvals must be reviewed by another team member." });
  }
  approval.status = "approved";
  approval.updatedAt = new Date().toISOString();
  approval.note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : approval.note;
  approval.reviewedByUserId = baseIdentity.userId;
  approval.reviewedByEmail = baseIdentity.email;
  approval.reviewedAt = approval.updatedAt;
  recordSystemAuditEvent(
    "fleet_approval_reviewed",
    `Approved fleet request ${approval.id} by ${baseIdentity.email}.`,
    { approved: true },
    false
  );
  schedulePersist();
  res.json({ ok: true });
});

app.post("/v1/team/fleet/approvals/:approvalId/deny", requireTeamPermission("team:manage"), (req, res) => {
  const approval = fleetApprovals.find((entry) => entry.id === req.params.approvalId);
  if (!approval) {
    return res.status(404).json({ detail: "Approval not found" });
  }
  const currentStatus = expireApprovalIfNeeded(approval, Date.now());
  if (currentStatus === "expired") {
    schedulePersist();
    return res.status(409).json({ detail: "Approval has expired" });
  }
  if (approval.status !== "pending") {
    return res.status(409).json({ detail: `Approval is already ${approval.status}` });
  }
  if (approval.requestedByUserId === baseIdentity.userId) {
    return res.status(403).json({ detail: "Fleet approvals must be reviewed by another team member." });
  }
  approval.status = "denied";
  approval.updatedAt = new Date().toISOString();
  approval.note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : approval.note;
  approval.reviewedByUserId = baseIdentity.userId;
  approval.reviewedByEmail = baseIdentity.email;
  approval.reviewedAt = approval.updatedAt;
  recordSystemAuditEvent(
    "fleet_approval_reviewed",
    `Denied fleet request ${approval.id} by ${baseIdentity.email}.`,
    { approved: false },
    false
  );
  schedulePersist();
  res.json({ ok: true });
});

app.post("/v1/team/fleet/approvals/:approvalId/claim-execution", requireTeamPermission("fleet:execute"), (req, res) => {
  const identity = (req as Request & { identity?: TeamIdentity }).identity || null;
  if (!identity) {
    return unauthorized(res, "Authentication required");
  }
  const approval = fleetApprovals.find((entry) => entry.id === req.params.approvalId);
  if (!approval) {
    return res.status(404).json({ detail: "Approval not found" });
  }
  const currentStatus = expireApprovalIfNeeded(approval, Date.now());
  if (currentStatus === "expired") {
    schedulePersist();
    return res.status(409).json({ detail: "Approval has expired" });
  }
  if (approval.status !== "approved") {
    return res.status(409).json({ detail: `Approval is ${approval.status}; execution claim requires approved status.` });
  }
  const claimTargetValidation = normalizeFleetTargetsForIdentity(normalizeApprovalTargets(approval.targets), identity);
  if (claimTargetValidation.unknownTargets.length > 0) {
    return res
      .status(409)
      .json({ detail: `Approval targets are no longer available: ${claimTargetValidation.unknownTargets.join(", ")}` });
  }
  if (claimTargetValidation.unauthorizedTargets.length > 0) {
    return forbidden(res, `Not authorized for targets: ${claimTargetValidation.unauthorizedTargets.join(", ")}`);
  }
  if (approval.executionClaimedAt) {
    return res.status(409).json({
      detail: `Execution already claimed at ${approval.executionClaimedAt}.`,
      approval,
      executionToken: approval.executionToken,
    });
  }
  const claimedAt = new Date().toISOString();
  approval.executionClaimedByUserId = identity.userId;
  approval.executionClaimedByEmail = identity.email;
  approval.executionClaimedAt = claimedAt;
  approval.executionToken = `fexec-${randomUUID()}`;
  approval.updatedAt = claimedAt;
  recordSystemAuditEvent(
    "fleet_execution_claimed",
    `Claimed execution for approved fleet request ${approval.id}.`,
    { approved: true },
    false
  );
  schedulePersist();
  res.json({ approval, executionToken: approval.executionToken });
});

app.post("/v1/team/fleet/approvals/:approvalId/complete", requireTeamPermission("fleet:execute"), (req, res) => {
  const identity = (req as Request & { identity?: TeamIdentity }).identity || null;
  if (!identity) {
    return unauthorized(res, "Authentication required");
  }
  const approval = fleetApprovals.find((entry) => entry.id === req.params.approvalId);
  if (!approval) {
    return res.status(404).json({ detail: "Approval not found" });
  }
  const parsed = fleetExecutionCompleteSchema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ detail: parsed.error.issues[0]?.message || "Invalid completion payload" });
  }
  const currentStatus = expireApprovalIfNeeded(approval, Date.now());
  if (currentStatus === "expired") {
    schedulePersist();
    return res.status(409).json({ detail: "Approval has expired" });
  }
  if (approval.status !== "approved") {
    return res.status(409).json({ detail: `Approval is ${approval.status}; execution completion requires approved status.` });
  }
  const completionTargetValidation = normalizeFleetTargetsForIdentity(normalizeApprovalTargets(approval.targets), identity);
  if (completionTargetValidation.unknownTargets.length > 0) {
    return res
      .status(409)
      .json({ detail: `Approval targets are no longer available: ${completionTargetValidation.unknownTargets.join(", ")}` });
  }
  if (completionTargetValidation.unauthorizedTargets.length > 0) {
    return forbidden(res, `Not authorized for targets: ${completionTargetValidation.unauthorizedTargets.join(", ")}`);
  }
  if (!approval.executionClaimedAt || !approval.executionToken) {
    return res.status(409).json({ detail: "Execution must be claimed before completion." });
  }
  if (approval.executionCompletedAt) {
    return res.status(409).json({ detail: `Execution already completed at ${approval.executionCompletedAt}.`, approval });
  }
  if (
    approval.executionClaimedByUserId &&
    approval.executionClaimedByUserId !== identity.userId &&
    identity.role !== "admin"
  ) {
    return forbidden(res, "Only the claimer or an admin can complete execution.");
  }
  if (approval.executionToken !== parsed.data.executionToken) {
    return res.status(403).json({ detail: "Execution token mismatch." });
  }

  const completedAt = new Date().toISOString();
  approval.executionCompletedByUserId = identity.userId;
  approval.executionCompletedByEmail = identity.email;
  approval.executionCompletedAt = completedAt;
  approval.executionResult = parsed.data.status;
  approval.executionSummary = parsed.data.summary?.trim() || approval.executionSummary;
  approval.updatedAt = completedAt;
  recordSystemAuditEvent(
    "fleet_execution_completed",
    `Marked execution ${parsed.data.status} for fleet request ${approval.id}.`,
    { approved: parsed.data.status === "succeeded" },
    false
  );
  schedulePersist();
  res.json({ approval, ok: true });
});

app.get("/v1/audit/events", requireTeamPermission("audit:read"), (req, res) => {
  const limitRaw = Number.parseInt(String(req.query?.limit || "100"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 1000) : 100;
  const actionFilter = String(req.query?.action || "").trim().toLowerCase();
  const serverIdFilter = String(req.query?.serverId || "").trim();
  const sessionFilter = String(req.query?.session || "").trim();
  const fromTimestampRaw = Number.parseInt(String(req.query?.fromTimestamp || ""), 10);
  const toTimestampRaw = Number.parseInt(String(req.query?.toTimestamp || ""), 10);
  const fromTimestamp = Number.isFinite(fromTimestampRaw) ? fromTimestampRaw : null;
  const toTimestamp = Number.isFinite(toTimestampRaw) ? toTimestampRaw : null;

  const filtered = auditEvents
    .filter((event) => {
      if (actionFilter && event.action.toLowerCase() !== actionFilter) {
        return false;
      }
      if (serverIdFilter && event.serverId !== serverIdFilter) {
        return false;
      }
      if (sessionFilter && event.session !== sessionFilter) {
        return false;
      }
      if (fromTimestamp !== null && event.timestamp < fromTimestamp) {
        return false;
      }
      if (toTimestamp !== null && event.timestamp > toTimestamp) {
        return false;
      }
      return true;
    })
    .sort((a, b) => b.timestamp - a.timestamp);

  res.json({ events: filtered.slice(0, limit) });
});

app.post("/v1/audit/events", requireTeamPermission("audit:read"), (req, res) => {
  const incoming = Array.isArray(req.body?.events) ? req.body.events : [];
  const normalized = incoming
    .map((entry) => normalizeAuditEvent(entry))
    .filter((entry): entry is AuditEvent => Boolean(entry));
  auditEvents.push(...normalized);
  schedulePersist();
  res.json({ accepted: normalized.length, rejected: incoming.length - normalized.length });
});

app.get("/v1/audit/exports", requireTeamPermission("audit:read"), (req, res) => {
  reconcileAuditExportJobs();
  const limitRaw = Number.parseInt(String(req.query?.limit || "20"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 20;
  const ordered = [...auditExportJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({
    exports: ordered.slice(0, limit)
  });
});

app.post("/v1/audit/exports", requireTeamPermission("audit:read"), (req, res) => {
  reconcileAuditExportJobs();
  const format = String(req.body?.format || "").toLowerCase();
  if (format !== "json" && format !== "csv") {
    return res.status(400).json({ detail: "format must be json or csv" });
  }
  const exportId = `audit-exp-${randomUUID().slice(0, 10)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + AUDIT_EXPORT_TTL_MS).toISOString();
  const job = {
    exportId,
    format: format as "json" | "csv",
    status: "pending" as const,
    createdAt,
    expiresAt,
    detail: "Export queued for processing"
  };
  auditExportJobs.unshift(job);
  recordSystemAuditEvent("audit_export_requested", `Requested ${format.toUpperCase()} audit export ${exportId}.`, {}, false);
  schedulePersist();
  res.json(job);
});

app.delete("/v1/audit/exports/:exportId", requireTeamPermission("audit:read"), (req, res) => {
  reconcileAuditExportJobs();
  const exportId = String(req.params.exportId || "").trim();
  const index = auditExportJobs.findIndex((entry) => entry.exportId === exportId);
  if (index === -1) {
    return res.status(404).json({ detail: "Export not found" });
  }
  const [removed] = auditExportJobs.splice(index, 1);
  recordSystemAuditEvent("audit_export_removed", `Deleted audit export ${removed.exportId}.`, {}, false);
  schedulePersist();
  res.json({ ok: true, export: removed });
});

const port = Number.parseInt(process.env.PORT || "8788", 10);
void loadState().finally(() => {
  app.listen(port, () => {
    console.log(`NovaRemoteCloud scaffold listening on http://localhost:${port}`);
    console.log(`State file: ${stateFilePath}`);
  });
});

process.on("SIGINT", () => {
  void persistState().finally(() => {
    process.exit(0);
  });
});

process.on("SIGTERM", () => {
  void persistState().finally(() => {
    process.exit(0);
  });
});
TS
fi

if [[ ! -f "${DASHBOARD_REPO}/README.md" ]]; then
  cat > "${DASHBOARD_REPO}/README.md" <<'DOC'
# NovaRemote Cloud Dashboard

Admin web UI scaffold for NovaRemote Cloud team management and audit review.

## Quickstart

```bash
npm install
npm run dev
```

Dashboard expects cloud API at `VITE_NOVA_CLOUD_URL` (default `http://localhost:8788`).
DOC
fi

mkdir -p "${DASHBOARD_REPO}/src" "${DASHBOARD_REPO}/contracts"

if [[ ! -f "${DASHBOARD_REPO}/package.json" ]]; then
  cat > "${DASHBOARD_REPO}/package.json" <<'JSON'
{
  "name": "novaremote-cloud-dashboard",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.2.0",
    "react-dom": "^19.2.0"
  },
  "devDependencies": {
    "@types/react": "^19.2.2",
    "@types/react-dom": "^19.2.2",
    "@vitejs/plugin-react": "^5.0.2",
    "typescript": "^5.9.2",
    "vite": "^7.1.7"
  }
}
JSON
fi

if [[ ! -f "${DASHBOARD_REPO}/tsconfig.json" ]]; then
  cat > "${DASHBOARD_REPO}/tsconfig.json" <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "types": ["vite/client"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "vite.config.ts"]
}
JSON
fi

if [[ ! -f "${DASHBOARD_REPO}/vite.config.ts" ]]; then
  cat > "${DASHBOARD_REPO}/vite.config.ts" <<'TS'
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()]
});
TS
fi

if [[ ! -f "${DASHBOARD_REPO}/index.html" ]]; then
  cat > "${DASHBOARD_REPO}/index.html" <<'HTML'
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>NovaRemote Cloud Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
HTML
fi

if [[ ! -f "${DASHBOARD_REPO}/src/styles.css" ]]; then
  cat > "${DASHBOARD_REPO}/src/styles.css" <<'CSS'
:root {
  color-scheme: dark;
  font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
  background: radial-gradient(circle at 10% 20%, #1b2b4d, #080d17 55%);
  color: #d8ecff;
}
* {
  box-sizing: border-box;
}
body {
  margin: 0;
}
.layout {
  min-height: 100vh;
  padding: 24px;
  display: grid;
  gap: 16px;
}
.panel {
  border: 1px solid rgba(125, 181, 255, 0.4);
  border-radius: 12px;
  background: rgba(7, 12, 22, 0.8);
  padding: 16px;
}
.title {
  margin: 0 0 8px;
  font-size: 18px;
}
.muted {
  margin: 0;
  color: #99b9d9;
  font-size: 13px;
}
.textInput {
  width: 100%;
  margin-top: 6px;
  border-radius: 8px;
  border: 1px solid rgba(130, 180, 255, 0.4);
  background: rgba(5, 10, 18, 0.9);
  color: #d8ecff;
  padding: 8px 10px;
}
.selectInput {
  width: 100%;
  margin-top: 6px;
  border-radius: 8px;
  border: 1px solid rgba(130, 180, 255, 0.4);
  background: rgba(5, 10, 18, 0.9);
  color: #d8ecff;
  padding: 8px 10px;
}
.textArea {
  width: 100%;
  min-height: 96px;
  margin-top: 6px;
  border-radius: 8px;
  border: 1px solid rgba(130, 180, 255, 0.4);
  background: rgba(5, 10, 18, 0.9);
  color: #d8ecff;
  padding: 8px 10px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.gridCols {
  display: grid;
  gap: 10px;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
}
.actions button {
  border-radius: 8px;
  border: 1px solid rgba(130, 180, 255, 0.4);
  background: rgba(12, 20, 36, 0.95);
  color: #d8ecff;
  padding: 7px 11px;
  cursor: pointer;
}
.actions button:disabled {
  opacity: 0.5;
  cursor: default;
}
.providerRow {
  border: 1px solid rgba(130, 180, 255, 0.2);
  border-radius: 10px;
  padding: 10px;
  margin-top: 10px;
}
a {
  color: #9bd0ff;
}
CSS
fi

if [[ ! -f "${DASHBOARD_REPO}/src/main.tsx" ]]; then
  cat > "${DASHBOARD_REPO}/src/main.tsx" <<'TS'
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing root element");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
TS
fi

if [[ ! -f "${DASHBOARD_REPO}/src/App.tsx" ]]; then
  cat > "${DASHBOARD_REPO}/src/App.tsx" <<'TS'
import { useCallback, useEffect, useMemo, useState } from "react";

type TeamSsoProviderConfig = {
  provider: "saml" | "oidc";
  enabled: boolean;
  displayName?: string;
  issuerUrl?: string;
  clientId?: string;
  updatedAt?: string;
};

type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: string;
  serverIds?: string[];
  sessionsCreated?: number;
  commandsSent?: number;
  fleetExecutions?: number;
  lastActiveAt?: string;
};

type TeamServer = {
  id: string;
  name: string;
  baseUrl: string;
  defaultCwd: string;
  permissionLevel: "admin" | "operator" | "viewer";
};

type TeamInvite = {
  id: string;
  email: string;
  role: string;
  status: "pending" | "accepted" | "expired" | "revoked";
  inviteCode?: string;
  expiresAt?: string;
};

type TeamSettings = {
  enforceDangerConfirm: boolean | null;
  requireFleetApproval: boolean | null;
  requireSessionRecording: boolean | null;
  sessionTimeoutMinutes: number | null;
  commandBlocklist: string[];
};

type FleetApproval = {
  id: string;
  command: string;
  status: string;
  requestedByEmail: string;
  createdAt: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  executionClaimedByEmail?: string;
  executionClaimedAt?: string;
  executionToken?: string;
  executionCompletedByEmail?: string;
  executionCompletedAt?: string;
  executionResult?: "succeeded" | "failed";
  executionSummary?: string;
};

type AuditExportJob = {
  exportId: string;
  format: "json" | "csv";
  status: "pending" | "ready" | "failed";
  createdAt: string;
  downloadUrl?: string;
};

type AuditEvent = {
  id: string;
  timestamp: number;
  action: string;
  serverId: string;
  serverName: string;
  session: string;
  detail: string;
  userId: string;
  userEmail: string;
  approved?: boolean | null;
};

type TeamIdentity = {
  provider?: "novaremote_cloud" | "oidc" | "saml" | "ldap_proxy";
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: number;
  teamName?: string;
  role?: string;
  permissions?: string[];
  email?: string;
  displayName?: string;
};

const cloudUrl = (import.meta.env.VITE_NOVA_CLOUD_URL || "http://localhost:8788").replace(/\/+$/, "");
const TEAM_ROLES = ["viewer", "operator", "admin", "billing"] as const;

async function fetchJson<T>(path: string, accessToken?: string): Promise<T> {
  const response = await fetch(`${cloudUrl}${path}`, {
    headers: accessToken
      ? {
          Authorization: `Bearer ${accessToken}`,
        }
      : undefined,
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }
  return (await response.json()) as T;
}

function boolString(value: boolean | null): "true" | "false" | "null" {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "null";
}

function parseBoolString(value: string): boolean | null {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function settledValue<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

export function App() {
  const [status, setStatus] = useState<string>("Ready");
  const [accessToken, setAccessToken] = useState<string>("");
  const [loginEmail, setLoginEmail] = useState<string>("admin@novaremote.dev");
  const [loginPassword, setLoginPassword] = useState<string>("dev-password");
  const [ssoToken, setSsoToken] = useState<string>("dev-sso-token");
  const [inviteCode, setInviteCode] = useState<string>("");
  const [identity, setIdentity] = useState<TeamIdentity | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [teamServers, setTeamServers] = useState<TeamServer[]>([]);
  const [serverEditDrafts, setServerEditDrafts] = useState<
    Record<
      string,
      {
        name: string;
        baseUrl: string;
        defaultCwd: string;
        permissionLevel: "admin" | "operator" | "viewer";
      }
    >
  >({});
  const [memberServerDrafts, setMemberServerDrafts] = useState<Record<string, string[]>>({});
  const [serverNameInput, setServerNameInput] = useState<string>("");
  const [serverUrlInput, setServerUrlInput] = useState<string>("");
  const [serverCwdInput, setServerCwdInput] = useState<string>("/");
  const [serverPermissionInput, setServerPermissionInput] = useState<"admin" | "operator" | "viewer">("operator");
  const [approvals, setApprovals] = useState<FleetApproval[]>([]);
  const [ssoProviders, setSsoProviders] = useState<TeamSsoProviderConfig[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [exportJobs, setExportJobs] = useState<AuditExportJob[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [auditActionFilter, setAuditActionFilter] = useState<string>("");
  const [auditServerFilter, setAuditServerFilter] = useState<string>("");
  const [settings, setSettings] = useState<TeamSettings>({
    enforceDangerConfirm: null,
    requireFleetApproval: null,
    requireSessionRecording: null,
    sessionTimeoutMinutes: null,
    commandBlocklist: [],
  });
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<string>("viewer");
  const [policyDanger, setPolicyDanger] = useState<"true" | "false" | "null">("null");
  const [policyFleet, setPolicyFleet] = useState<"true" | "false" | "null">("null");
  const [policyRecording, setPolicyRecording] = useState<"true" | "false" | "null">("null");
  const [policyTimeout, setPolicyTimeout] = useState<string>("");
  const [policyBlocklist, setPolicyBlocklist] = useState<string>("");
  const [lastExport, setLastExport] = useState<AuditExportJob | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const loadHealth = useCallback(async () => {
    try {
      await fetchJson<{ ok: boolean }>("/healthz");
      setHealthOk(true);
    } catch {
      setHealthOk(false);
    }
  }, []);

  const signInPassword = useCallback(async () => {
    const email = loginEmail.trim().toLowerCase();
    const password = loginPassword;
    if (!email || !password) {
      setStatus("Email and password are required.");
      return;
    }
    setBusy(true);
    setStatus(`Signing in ${email}...`);
    try {
      const response = await fetch(`${cloudUrl}/v1/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "novaremote_cloud",
          email,
          password,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }
      const payload = (await response.json()) as { identity?: TeamIdentity };
      const nextIdentity = payload.identity || null;
      const token = nextIdentity?.accessToken || "";
      setIdentity(nextIdentity);
      setAccessToken(token);
      if (token) {
        await Promise.resolve();
      }
      setStatus("Signed in.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [inviteCode, loginEmail, loginPassword]);

  const signInSso = useCallback(async () => {
    const token = ssoToken.trim();
    if (!token) {
      setStatus("SSO token is required.");
      return;
    }
    setBusy(true);
    setStatus("Signing in with SSO...");
    try {
      const response = await fetch(`${cloudUrl}/v1/auth/sso/exchange`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          provider: "oidc",
          idToken: token,
          inviteCode: inviteCode.trim() || undefined,
        }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }
      const payload = (await response.json()) as { identity?: TeamIdentity };
      const nextIdentity = payload.identity || null;
      setIdentity(nextIdentity);
      setAccessToken(nextIdentity?.accessToken || "");
      setStatus("Signed in with SSO.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [inviteCode, ssoToken]);

  const refreshSession = useCallback(async () => {
    if (!identity?.refreshToken) {
      setStatus("Sign in before refreshing the session.");
      return;
    }
    setBusy(true);
    setStatus("Refreshing team session...");
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (accessToken.trim()) {
        headers.Authorization = `Bearer ${accessToken.trim()}`;
      }
      const response = await fetch(`${cloudUrl}/v1/auth/refresh`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          refreshToken: identity.refreshToken,
        }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }
      const payload = (await response.json()) as { identity?: TeamIdentity };
      const nextIdentity = payload.identity || null;
      setIdentity(nextIdentity);
      setAccessToken(nextIdentity?.accessToken || "");
      setStatus("Session refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [accessToken, identity]);

  const signOut = useCallback(async () => {
    const currentIdentity = identity;
    const currentToken = accessToken.trim();
    setBusy(true);
    if (currentIdentity?.refreshToken) {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (currentToken) {
          headers.Authorization = `Bearer ${currentToken}`;
        }
        await fetch(`${cloudUrl}/v1/auth/logout`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            refreshToken: currentIdentity.refreshToken,
          }),
        });
      } catch {
        // Local sign-out still proceeds even if logout endpoint is unavailable.
      }
    }
    setIdentity(null);
    setAccessToken("");
    setMembers([]);
    setTeamServers([]);
    setServerEditDrafts({});
    setMemberServerDrafts({});
    setApprovals([]);
    setSsoProviders([]);
    setInvites([]);
    setExportJobs([]);
    setAuditEvents([]);
    setLastExport(null);
    setStatus("Signed out.");
    setBusy(false);
  }, [accessToken, identity]);

  const loadTeamData = useCallback(async () => {
    if (!accessToken.trim()) {
      setStatus("Sign in to load team data.");
      return;
    }
    setBusy(true);
    setStatus("Loading team data...");
    try {
      const results = await Promise.allSettled([
        fetchJson<{ members?: TeamMember[] }>("/v1/team/members", accessToken.trim()),
        fetchJson<{ servers?: TeamServer[] }>("/v1/team/servers", accessToken.trim()),
        fetchJson<{ approvals?: FleetApproval[] }>("/v1/team/fleet/approvals", accessToken.trim()),
        fetchJson<{ providers?: TeamSsoProviderConfig[] }>("/v1/team/sso/providers", accessToken.trim()),
        fetchJson<{ invites?: TeamInvite[] }>("/v1/team/invites", accessToken.trim()),
        fetchJson<{ settings?: TeamSettings }>("/v1/team/settings", accessToken.trim()),
        fetchJson<{ exports?: AuditExportJob[] }>("/v1/audit/exports?limit=20", accessToken.trim()),
        fetchJson<{ events?: AuditEvent[] }>("/v1/audit/events?limit=200", accessToken.trim()),
      ] as const);
      const membersPayload = settledValue(results[0], { members: [] as TeamMember[] });
      const teamServersPayload = settledValue(results[1], { servers: [] as TeamServer[] });
      const approvalsPayload = settledValue(results[2], { approvals: [] as FleetApproval[] });
      const ssoPayload = settledValue(results[3], { providers: [] as TeamSsoProviderConfig[] });
      const invitesPayload = settledValue(results[4], { invites: [] as TeamInvite[] });
      const settingsPayload = settledValue(results[5], {
        settings: {
          enforceDangerConfirm: null,
          requireFleetApproval: null,
          requireSessionRecording: null,
          sessionTimeoutMinutes: null,
          commandBlocklist: [],
        } as TeamSettings,
      });
      const exportsPayload = settledValue(results[6], { exports: [] as AuditExportJob[] });
      const auditEventsPayload = settledValue(results[7], { events: [] as AuditEvent[] });
      const nextMembers = Array.isArray(membersPayload.members) ? membersPayload.members : [];
      setMembers(nextMembers);
      const nextServers = Array.isArray(teamServersPayload.servers) ? teamServersPayload.servers : [];
      setTeamServers(nextServers);
      setServerEditDrafts((previous) => {
        const next: Record<
          string,
          {
            name: string;
            baseUrl: string;
            defaultCwd: string;
            permissionLevel: "admin" | "operator" | "viewer";
          }
        > = {};
        nextServers.forEach((server) => {
          const previousDraft = previous[server.id];
          next[server.id] = previousDraft || {
            name: server.name,
            baseUrl: server.baseUrl,
            defaultCwd: server.defaultCwd,
            permissionLevel: server.permissionLevel,
          };
        });
        return next;
      });
      setMemberServerDrafts((previous) => {
        const next: Record<string, string[]> = {};
        nextMembers.forEach((member) => {
          next[member.id] = previous[member.id] || member.serverIds || [];
        });
        return next;
      });
      setApprovals(Array.isArray(approvalsPayload.approvals) ? approvalsPayload.approvals : []);
      setSsoProviders(Array.isArray(ssoPayload.providers) ? ssoPayload.providers : []);
      setInvites(Array.isArray(invitesPayload.invites) ? invitesPayload.invites : []);
      setExportJobs(Array.isArray(exportsPayload.exports) ? exportsPayload.exports : []);
      setAuditEvents(Array.isArray(auditEventsPayload.events) ? auditEventsPayload.events : []);
      const nextSettings = settingsPayload.settings || {
        enforceDangerConfirm: null,
        requireFleetApproval: null,
        requireSessionRecording: null,
        sessionTimeoutMinutes: null,
        commandBlocklist: [],
      };
      setSettings(nextSettings);
      setPolicyDanger(boolString(nextSettings.enforceDangerConfirm));
      setPolicyFleet(boolString(nextSettings.requireFleetApproval));
      setPolicyRecording(boolString(nextSettings.requireSessionRecording));
      setPolicyTimeout(
        typeof nextSettings.sessionTimeoutMinutes === "number" && Number.isFinite(nextSettings.sessionTimeoutMinutes)
          ? String(nextSettings.sessionTimeoutMinutes)
          : ""
      );
      setPolicyBlocklist((nextSettings.commandBlocklist || []).join("\n"));
      const failedCount = results.filter((entry) => entry.status === "rejected").length;
      if (failedCount > 0) {
        setStatus(`Team data loaded with ${failedCount} permission or API warning${failedCount === 1 ? "" : "s"}.`);
      } else {
        setStatus("Team data loaded.");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [accessToken]);

  const createServer = useCallback(async () => {
    if (!accessToken.trim()) {
      setStatus("Paste an access token before creating servers.");
      return;
    }
    const name = serverNameInput.trim();
    const baseUrl = serverUrlInput.trim();
    const defaultCwd = serverCwdInput.trim() || "/";
    if (!name || !baseUrl) {
      setStatus("Server name and URL are required.");
      return;
    }
    setBusy(true);
    setStatus(`Creating server ${name}...`);
    try {
      const response = await fetch(`${cloudUrl}/v1/team/servers`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: JSON.stringify({
          name,
          baseUrl,
          defaultCwd,
          permissionLevel: serverPermissionInput,
        }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }
      setServerNameInput("");
      setServerUrlInput("");
      setServerCwdInput("/");
      setServerPermissionInput("operator");
      await loadTeamData();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [accessToken, loadTeamData, serverCwdInput, serverNameInput, serverPermissionInput, serverUrlInput]);

  const removeServer = useCallback(
    async (serverId: string) => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before deleting servers.");
        return;
      }
      setBusy(true);
      setStatus(`Deleting server ${serverId}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/servers/${serverId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
          },
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const saveServerEdit = useCallback(
    async (serverId: string) => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before updating servers.");
        return;
      }
      const draft = serverEditDrafts[serverId];
      if (!draft) {
        setStatus(`No draft found for server ${serverId}.`);
        return;
      }
      const payload = {
        name: draft.name.trim(),
        baseUrl: draft.baseUrl.trim(),
        defaultCwd: draft.defaultCwd.trim() || "/",
        permissionLevel: draft.permissionLevel,
      };
      if (!payload.name || !payload.baseUrl) {
        setStatus("Server name and URL are required.");
        return;
      }
      setBusy(true);
      setStatus(`Updating server ${serverId}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/servers/${serverId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData, serverEditDrafts]
  );

  const requestExport = useCallback(
    async (format: "json" | "csv") => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before requesting exports.");
        return;
      }
      setBusy(true);
      setStatus(`Requesting ${format.toUpperCase()} export...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/audit/exports`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
          body: JSON.stringify({ format }),
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        const payload = (await response.json()) as AuditExportJob;
        setLastExport(payload);
        await loadTeamData();
        setStatus(`Export ${payload.exportId} (${payload.status}) ready.`);
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const removeExport = useCallback(
    async (exportId: string) => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before deleting exports.");
        return;
      }
      setBusy(true);
      setStatus(`Deleting export ${exportId}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/audit/exports/${exportId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
          },
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const toggleSsoProvider = useCallback(
    async (provider: "saml" | "oidc", enabled: boolean) => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before editing SSO providers.");
        return;
      }
      setBusy(true);
      setStatus(`${enabled ? "Enabling" : "Disabling"} ${provider.toUpperCase()}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/sso/providers/${provider}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
          body: JSON.stringify({ enabled }),
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const reviewApproval = useCallback(
    async (approvalId: string, action: "approve" | "deny") => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before reviewing approvals.");
        return;
      }
      setBusy(true);
      setStatus(`${action === "approve" ? "Approving" : "Denying"} ${approvalId}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/fleet/approvals/${approvalId}/${action}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const claimApprovalExecution = useCallback(
    async (approvalId: string) => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before claiming execution.");
        return;
      }
      setBusy(true);
      setStatus(`Claiming execution for ${approvalId}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/fleet/approvals/${approvalId}/claim-execution`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const completeApprovalExecution = useCallback(
    async (approvalId: string, executionToken: string, status: "succeeded" | "failed") => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before completing execution.");
        return;
      }
      if (!executionToken.trim()) {
        setStatus("Execution token is required before completion.");
        return;
      }
      setBusy(true);
      setStatus(`Marking ${approvalId} ${status}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/fleet/approvals/${approvalId}/complete`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
          body: JSON.stringify({
            executionToken,
            status,
          }),
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const updateMemberRole = useCallback(
    async (memberId: string, role: string) => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before updating roles.");
        return;
      }
      setBusy(true);
      setStatus(`Updating ${memberId} role to ${role}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/members/${memberId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
          body: JSON.stringify({ role }),
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const toggleMemberServer = useCallback((memberId: string, serverId: string) => {
    setMemberServerDrafts((previous) => {
      const current = previous[memberId] || [];
      const nextServers = current.includes(serverId) ? current.filter((entry) => entry !== serverId) : [...current, serverId];
      return {
        ...previous,
        [memberId]: nextServers,
      };
    });
  }, []);

  const saveMemberServers = useCallback(
    async (memberId: string) => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before updating server assignments.");
        return;
      }
      const serverIds = memberServerDrafts[memberId] || [];
      setBusy(true);
      setStatus(`Updating server access for ${memberId}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/members/${memberId}/servers`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken.trim()}`,
          },
          body: JSON.stringify({ serverIds }),
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData, memberServerDrafts]
  );

  const createInvite = useCallback(async () => {
    if (!accessToken.trim()) {
      setStatus("Paste an access token before creating invites.");
      return;
    }
    if (!inviteEmail.trim()) {
      setStatus("Invite email is required.");
      return;
    }
    setBusy(true);
    setStatus(`Sending invite to ${inviteEmail.trim().toLowerCase()}...`);
    try {
      const response = await fetch(`${cloudUrl}/v1/team/invites`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          role: inviteRole,
        }),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }
      setInviteEmail("");
      await loadTeamData();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [accessToken, inviteEmail, inviteRole, loadTeamData]);

  const revokeInvite = useCallback(
    async (inviteId: string) => {
      if (!accessToken.trim()) {
        setStatus("Paste an access token before revoking invites.");
        return;
      }
      setBusy(true);
      setStatus(`Revoking invite ${inviteId}...`);
      try {
        const response = await fetch(`${cloudUrl}/v1/team/invites/${inviteId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${accessToken.trim()}`,
          },
        });
        if (!response.ok) {
          throw new Error(`${response.status} ${await response.text()}`);
        }
        await loadTeamData();
      } catch (error) {
        setStatus(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [accessToken, loadTeamData]
  );

  const savePolicies = useCallback(async () => {
    if (!accessToken.trim()) {
      setStatus("Paste an access token before updating policies.");
      return;
    }
    const timeoutRaw = policyTimeout.trim();
    let timeout: number | null = null;
    if (timeoutRaw) {
      const parsed = Number.parseInt(timeoutRaw, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setStatus("Session timeout must be a positive integer.");
        return;
      }
      timeout = parsed;
    }
    const blocklist = policyBlocklist
      .split(/\r?\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);

    const payload: TeamSettings = {
      enforceDangerConfirm: parseBoolString(policyDanger),
      requireFleetApproval: parseBoolString(policyFleet),
      requireSessionRecording: parseBoolString(policyRecording),
      sessionTimeoutMinutes: timeout,
      commandBlocklist: Array.from(new Set(blocklist)),
    };

    setBusy(true);
    setStatus("Saving team policies...");
    try {
      const response = await fetch(`${cloudUrl}/v1/team/settings`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken.trim()}`,
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${await response.text()}`);
      }
      setSettings(payload);
      await loadTeamData();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [accessToken, loadTeamData, policyBlocklist, policyDanger, policyFleet, policyRecording, policyTimeout]);

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    if (!accessToken.trim()) {
      return;
    }
    void loadTeamData();
  }, [accessToken, loadTeamData]);

  useEffect(() => {
    if (!identity?.refreshToken || !identity.tokenExpiresAt) {
      return;
    }
    const msUntilRefresh = Math.max(identity.tokenExpiresAt - Date.now() - 60_000, 0);
    const timer = setTimeout(() => {
      void refreshSession();
    }, msUntilRefresh);
    return () => {
      clearTimeout(timer);
    };
  }, [identity, refreshSession]);

  const healthLabel = useMemo(() => {
    if (healthOk === null) {
      return "checking";
    }
    return healthOk ? "healthy" : "unreachable";
  }, [healthOk]);

  const filteredAuditEvents = useMemo(() => {
    const actionNeedle = auditActionFilter.trim().toLowerCase();
    const serverNeedle = auditServerFilter.trim().toLowerCase();
    return auditEvents.filter((event) => {
      if (actionNeedle && !event.action.toLowerCase().includes(actionNeedle)) {
        return false;
      }
      if (
        serverNeedle &&
        !event.serverId.toLowerCase().includes(serverNeedle) &&
        !event.serverName.toLowerCase().includes(serverNeedle)
      ) {
        return false;
      }
      return true;
    });
  }, [auditActionFilter, auditEvents, auditServerFilter]);

  return (
    <main className="layout">
      <section className="panel">
        <h1 className="title">NovaRemote Cloud Dashboard</h1>
        <p className="muted">Connected API: {cloudUrl}</p>
        <p className="muted">Health: {healthLabel}</p>
        {identity ? (
          <p className="muted">{`Signed in: ${identity.email || "unknown"}${identity.displayName ? ` (${identity.displayName})` : ""}`}</p>
        ) : (
          <p className="muted">Not signed in.</p>
        )}
        {identity?.role ? <p className="muted">{`Role: ${identity.role}`}</p> : null}
        {Array.isArray(identity?.permissions) && identity.permissions.length > 0 ? (
          <p className="muted">{`Permissions: ${identity.permissions.join(", ")}`}</p>
        ) : null}
        {identity?.tokenExpiresAt ? (
          <p className="muted">{`Session expires: ${new Date(identity.tokenExpiresAt).toLocaleString()}`}</p>
        ) : null}
        <div className="gridCols">
          <label className="muted">
            Team Email
            <input
              className="textInput"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              placeholder="admin@novaremote.dev"
            />
          </label>
          <label className="muted">
            Password
            <input
              className="textInput"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              placeholder="password"
              type="password"
            />
          </label>
          <label className="muted">
            SSO Token
            <input
              className="textInput"
              value={ssoToken}
              onChange={(event) => setSsoToken(event.target.value)}
              placeholder="oidc id token"
            />
          </label>
          <label className="muted">
            Invite Code (Optional)
            <input
              className="textInput"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="INV-ABC123"
            />
          </label>
        </div>
        <div className="actions">
          <button onClick={() => void signInPassword()} disabled={busy}>
            Password Sign-In
          </button>
          <button onClick={() => void signInSso()} disabled={busy}>
            SSO Sign-In
          </button>
          <button onClick={() => void refreshSession()} disabled={busy || !identity?.refreshToken}>
            Refresh Session
          </button>
          <button onClick={() => void signOut()} disabled={busy || !accessToken.trim()}>
            Sign Out
          </button>
        </div>
        <label className="muted">
          Access Token
          <input
            className="textInput"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder="Generated on sign-in; can be pasted for manual testing"
          />
        </label>
        <div className="actions">
          <button onClick={() => void loadTeamData()} disabled={busy}>
            {busy ? "Working..." : "Refresh Team Data"}
          </button>
          <button onClick={() => void requestExport("json")} disabled={busy}>
            Request JSON Export
          </button>
          <button onClick={() => void requestExport("csv")} disabled={busy}>
            Request CSV Export
          </button>
        </div>
        <p className="muted">{status}</p>
      </section>

      <section className="panel">
        <h2 className="title">Team Servers ({teamServers.length})</h2>
        <div className="gridCols">
          <label className="muted">
            Name
            <input className="textInput" value={serverNameInput} onChange={(event) => setServerNameInput(event.target.value)} />
          </label>
          <label className="muted">
            Base URL
            <input
              className="textInput"
              value={serverUrlInput}
              onChange={(event) => setServerUrlInput(event.target.value)}
              placeholder="https://server.example.com"
            />
          </label>
          <label className="muted">
            Default CWD
            <input className="textInput" value={serverCwdInput} onChange={(event) => setServerCwdInput(event.target.value)} />
          </label>
          <label className="muted">
            Permission Level
            <select
              className="selectInput"
              value={serverPermissionInput}
              onChange={(event) => setServerPermissionInput(event.target.value as "admin" | "operator" | "viewer")}
            >
              <option value="viewer">viewer</option>
              <option value="operator">operator</option>
              <option value="admin">admin</option>
            </select>
          </label>
        </div>
        <div className="actions">
          <button disabled={busy} onClick={() => void createServer()}>
            Add Server
          </button>
        </div>
        {teamServers.length === 0 ? <p className="muted">No servers loaded.</p> : null}
        {teamServers.map((server) => {
          const draft = serverEditDrafts[server.id] || {
            name: server.name,
            baseUrl: server.baseUrl,
            defaultCwd: server.defaultCwd,
            permissionLevel: server.permissionLevel,
          };
          return (
            <div key={server.id} className="providerRow">
              <p className="muted">
                {server.id} • {server.name}
              </p>
              <div className="gridCols">
                <label className="muted">
                  Name
                  <input
                    className="textInput"
                    value={draft.name}
                    onChange={(event) =>
                      setServerEditDrafts((previous) => ({
                        ...previous,
                        [server.id]: {
                          ...draft,
                          name: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="muted">
                  Base URL
                  <input
                    className="textInput"
                    value={draft.baseUrl}
                    onChange={(event) =>
                      setServerEditDrafts((previous) => ({
                        ...previous,
                        [server.id]: {
                          ...draft,
                          baseUrl: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="muted">
                  Default CWD
                  <input
                    className="textInput"
                    value={draft.defaultCwd}
                    onChange={(event) =>
                      setServerEditDrafts((previous) => ({
                        ...previous,
                        [server.id]: {
                          ...draft,
                          defaultCwd: event.target.value,
                        },
                      }))
                    }
                  />
                </label>
                <label className="muted">
                  Permission Level
                  <select
                    className="selectInput"
                    value={draft.permissionLevel}
                    onChange={(event) =>
                      setServerEditDrafts((previous) => ({
                        ...previous,
                        [server.id]: {
                          ...draft,
                          permissionLevel: event.target.value as "admin" | "operator" | "viewer",
                        },
                      }))
                    }
                  >
                    <option value="viewer">viewer</option>
                    <option value="operator">operator</option>
                    <option value="admin">admin</option>
                  </select>
                </label>
              </div>
              <div className="actions">
                <button disabled={busy} onClick={() => void saveServerEdit(server.id)}>
                  Save Server
                </button>
                <button disabled={busy} onClick={() => void removeServer(server.id)}>
                  Delete Server
                </button>
              </div>
            </div>
          );
        })}
      </section>

      <section className="panel">
        <h2 className="title">Team Members ({members.length})</h2>
        {members.length === 0 ? <p className="muted">No members loaded.</p> : null}
        {members.map((member) => (
          <div key={member.id} className="providerRow">
            <p className="muted">
              {member.name} ({member.email}) • {member.role}
            </p>
            <p className="muted">
              {`Usage: sessions ${member.sessionsCreated ?? 0} • commands ${member.commandsSent ?? 0} • fleet ${
                member.fleetExecutions ?? 0
              }${member.lastActiveAt ? ` • last active ${new Date(member.lastActiveAt).toLocaleString()}` : ""}`}
            </p>
            <div className="actions">
              {TEAM_ROLES.map((role) => (
                <button key={role} disabled={busy || member.role === role} onClick={() => void updateMemberRole(member.id, role)}>
                  Set {role}
                </button>
              ))}
            </div>
            <p className="muted">Server Access</p>
            <div className="actions">
              {teamServers.map((server) => {
                const selected = (memberServerDrafts[member.id] || member.serverIds || []).includes(server.id);
                return (
                  <button key={server.id} disabled={busy} onClick={() => toggleMemberServer(member.id, server.id)}>
                    {selected ? "Remove" : "Grant"} {server.name}
                  </button>
                );
              })}
              <button disabled={busy} onClick={() => void saveMemberServers(member.id)}>
                Save Access
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2 className="title">Team Invites</h2>
        <div className="gridCols">
          <label className="muted">
            Email
            <input
              className="textInput"
              value={inviteEmail}
              onChange={(event) => setInviteEmail(event.target.value)}
              placeholder="new-user@example.com"
            />
          </label>
          <label className="muted">
            Role
            <select className="selectInput" value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}>
              {TEAM_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="actions">
          <button disabled={busy} onClick={() => void createInvite()}>
            Send Invite
          </button>
        </div>
        {invites.length === 0 ? <p className="muted">No invites found.</p> : null}
        {invites.map((invite) => (
          <div key={invite.id} className="providerRow">
            <p className="muted">
              {invite.email} • {invite.role} • {invite.status}
            </p>
            {invite.inviteCode ? <p className="muted">Code: {invite.inviteCode}</p> : null}
            {invite.expiresAt ? <p className="muted">Expires: {new Date(invite.expiresAt).toLocaleString()}</p> : null}
            {invite.status === "pending" ? (
              <div className="actions">
                <button disabled={busy} onClick={() => void revokeInvite(invite.id)}>
                  Revoke
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2 className="title">Fleet Approvals ({approvals.length})</h2>
        {approvals.length === 0 ? <p className="muted">No approvals loaded.</p> : null}
        {approvals.map((approval) => (
          <div key={approval.id} className="providerRow">
            <p className="muted">
              {approval.status} • {approval.command} • {approval.requestedByEmail}
            </p>
            {approval.reviewedByEmail ? (
              <p className="muted">
                Reviewed by {approval.reviewedByEmail}
                {approval.reviewedAt ? ` • ${new Date(approval.reviewedAt).toLocaleString()}` : ""}
              </p>
            ) : null}
            {approval.executionClaimedByEmail ? (
              <p className="muted">
                Execution claimed by {approval.executionClaimedByEmail}
                {approval.executionClaimedAt ? ` • ${new Date(approval.executionClaimedAt).toLocaleString()}` : ""}
              </p>
            ) : null}
            {approval.executionCompletedByEmail ? (
              <p className="muted">
                Execution {approval.executionResult || "completed"} by {approval.executionCompletedByEmail}
                {approval.executionCompletedAt ? ` • ${new Date(approval.executionCompletedAt).toLocaleString()}` : ""}
              </p>
            ) : null}
            {approval.executionSummary ? <p className="muted">{`Summary: ${approval.executionSummary}`}</p> : null}
            {approval.executionToken ? <p className="muted">{`Execution token: ${approval.executionToken}`}</p> : null}
            {approval.status === "pending" ? (
              <div className="actions">
                <button disabled={busy} onClick={() => void reviewApproval(approval.id, "approve")}>
                  Approve
                </button>
                <button disabled={busy} onClick={() => void reviewApproval(approval.id, "deny")}>
                  Deny
                </button>
              </div>
            ) : null}
            {approval.status === "approved" && !approval.executionClaimedAt ? (
              <div className="actions">
                <button disabled={busy} onClick={() => void claimApprovalExecution(approval.id)}>
                  Claim Execution
                </button>
              </div>
            ) : null}
            {approval.status === "approved" &&
            Boolean(approval.executionClaimedAt) &&
            !approval.executionCompletedAt &&
            approval.executionToken ? (
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() => void completeApprovalExecution(approval.id, approval.executionToken || "", "succeeded")}
                >
                  Mark Succeeded
                </button>
                <button
                  disabled={busy}
                  onClick={() => void completeApprovalExecution(approval.id, approval.executionToken || "", "failed")}
                >
                  Mark Failed
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2 className="title">Team Policies</h2>
        <div className="gridCols">
          <label className="muted">
            Danger Confirm
            <select className="selectInput" value={policyDanger} onChange={(event) => setPolicyDanger(event.target.value as "true" | "false" | "null")}>
              <option value="null">User controlled</option>
              <option value="true">Enforced on</option>
              <option value="false">Enforced off</option>
            </select>
          </label>
          <label className="muted">
            Fleet Approval
            <select className="selectInput" value={policyFleet} onChange={(event) => setPolicyFleet(event.target.value as "true" | "false" | "null")}>
              <option value="null">User controlled</option>
              <option value="true">Enforced on</option>
              <option value="false">Enforced off</option>
            </select>
          </label>
          <label className="muted">
            Session Recording
            <select
              className="selectInput"
              value={policyRecording}
              onChange={(event) => setPolicyRecording(event.target.value as "true" | "false" | "null")}
            >
              <option value="null">User controlled</option>
              <option value="true">Enforced on</option>
              <option value="false">Enforced off</option>
            </select>
          </label>
          <label className="muted">
            Session Timeout (minutes)
            <input
              className="textInput"
              value={policyTimeout}
              onChange={(event) => setPolicyTimeout(event.target.value)}
              placeholder="e.g. 20"
            />
          </label>
        </div>
        <label className="muted">
          Command Blocklist (newline or comma separated)
          <textarea
            className="textArea"
            value={policyBlocklist}
            onChange={(event) => setPolicyBlocklist(event.target.value)}
            placeholder="rm -rf /"
          />
        </label>
        <div className="actions">
          <button disabled={busy} onClick={() => void savePolicies()}>
            Save Policies
          </button>
        </div>
        <p className="muted">
          Current: danger={boolString(settings.enforceDangerConfirm)} • fleet={boolString(settings.requireFleetApproval)} • recording={boolString(settings.requireSessionRecording)} • timeout={settings.sessionTimeoutMinutes ?? "off"} • blocklist={settings.commandBlocklist.length}
        </p>
      </section>

      <section className="panel">
        <h2 className="title">SSO Providers</h2>
        {ssoProviders.length === 0 ? <p className="muted">No providers loaded.</p> : null}
        {ssoProviders.map((provider) => (
          <div key={provider.provider} className="providerRow">
            <p className="muted">
              {provider.provider.toUpperCase()} • {provider.enabled ? "enabled" : "disabled"}{" "}
              {provider.clientId ? `• ${provider.clientId}` : ""}
            </p>
            <div className="actions">
              <button disabled={busy || provider.enabled} onClick={() => void toggleSsoProvider(provider.provider, true)}>
                Enable
              </button>
              <button disabled={busy || !provider.enabled} onClick={() => void toggleSsoProvider(provider.provider, false)}>
                Disable
              </button>
            </div>
          </div>
        ))}
      </section>

      <section className="panel">
        <h2 className="title">{`Audit Events (${filteredAuditEvents.length}/${auditEvents.length})`}</h2>
        <div className="gridCols">
          <label className="muted">
            Filter action
            <input
              className="textInput"
              value={auditActionFilter}
              onChange={(event) => setAuditActionFilter(event.target.value)}
              placeholder="command_sent"
            />
          </label>
          <label className="muted">
            Filter server
            <input
              className="textInput"
              value={auditServerFilter}
              onChange={(event) => setAuditServerFilter(event.target.value)}
              placeholder="srv-dgx"
            />
          </label>
        </div>
        {filteredAuditEvents.length === 0 ? <p className="muted">No events match filters.</p> : null}
        {filteredAuditEvents.map((event) => (
          <div key={event.id} className="providerRow">
            <p className="muted">
              {new Date(event.timestamp).toLocaleString()} • {event.action}
            </p>
            <p className="muted">
              {event.serverName || event.serverId || "no-server"} • {event.session || "no-session"} •{" "}
              {event.userEmail || event.userId || "unknown-user"}
            </p>
            {event.detail ? <p className="muted">{event.detail}</p> : null}
          </div>
        ))}
      </section>

      <section className="panel">
        <h2 className="title">Last Audit Export</h2>
        {!lastExport ? <p className="muted">No exports requested yet.</p> : null}
        {lastExport ? (
          <>
            <p className="muted">
              {lastExport.exportId} • {lastExport.format.toUpperCase()} • {lastExport.status}
            </p>
            {lastExport.detail ? <p className="muted">{lastExport.detail}</p> : null}
            {lastExport.expiresAt ? <p className="muted">{`Expires: ${new Date(lastExport.expiresAt).toLocaleString()}`}</p> : null}
            {lastExport.downloadUrl ? (
              <p className="muted">
                <a href={lastExport.downloadUrl} target="_blank" rel="noreferrer">
                  Open download URL
                </a>
              </p>
            ) : null}
          </>
        ) : null}
        {exportJobs.length > 0 ? (
          <div className="providerRow">
            <p className="muted">Recent Export Jobs</p>
            {exportJobs.map((job) => (
              <div key={job.exportId} className="providerRow">
                <p className="muted">
                  {job.exportId} • {job.format.toUpperCase()} • {job.status} • {new Date(job.createdAt).toLocaleString()}
                </p>
                {job.detail ? <p className="muted">{job.detail}</p> : null}
                {job.expiresAt ? <p className="muted">{`Expires: ${new Date(job.expiresAt).toLocaleString()}`}</p> : null}
                <div className="actions">
                  {job.downloadUrl ? (
                    <a href={job.downloadUrl} target="_blank" rel="noreferrer">
                      Open
                    </a>
                  ) : null}
                  <button disabled={busy} onClick={() => void removeExport(job.exportId)}>
                    Delete Export
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
TS
fi

if [[ ! -f "${API_REPO}/.gitignore" ]]; then
  cat > "${API_REPO}/.gitignore" <<'TXT'
node_modules/
dist/
.env
TXT
fi

if [[ ! -f "${DASHBOARD_REPO}/.gitignore" ]]; then
  cat > "${DASHBOARD_REPO}/.gitignore" <<'TXT'
node_modules/
dist/
.env
TXT
fi

if [[ ! -f "${API_REPO}/Dockerfile" ]]; then
  cat > "${API_REPO}/Dockerfile" <<'DOCKER'
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8788
COPY package*.json ./
RUN npm ci --omit=dev
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
EXPOSE 8788
CMD ["node", "dist/server.js"]
DOCKER
fi

if [[ ! -f "${API_REPO}/render.yaml" ]]; then
  cat > "${API_REPO}/render.yaml" <<'YAML'
services:
  - type: web
    name: novaremote-cloud
    env: node
    plan: starter
    buildCommand: npm install && npm run build
    startCommand: npm run start
    healthCheckPath: /healthz
    autoDeploy: true
    envVars:
      - key: NODE_VERSION
        value: 20
      - key: NOVA_CLOUD_JWT_SECRET
        sync: false
      - key: NOVA_CLOUD_TOKEN_TTL_SECONDS
        value: "7200"
YAML
fi

mkdir -p "${API_REPO}/.github/workflows"
if [[ ! -f "${API_REPO}/.github/workflows/ci.yml" ]]; then
  cat > "${API_REPO}/.github/workflows/ci.yml" <<'YAML'
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  api:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm install
      - run: npm run typecheck
      - run: npm run build
YAML
fi

if [[ ! -f "${DASHBOARD_REPO}/Dockerfile" ]]; then
  cat > "${DASHBOARD_REPO}/Dockerfile" <<'DOCKER'
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
DOCKER
fi

if [[ ! -f "${DASHBOARD_REPO}/render.yaml" ]]; then
  cat > "${DASHBOARD_REPO}/render.yaml" <<'YAML'
services:
  - type: web
    name: novaremote-cloud-dashboard
    env: static
    buildCommand: npm install && npm run build
    staticPublishPath: dist
    autoDeploy: true
    envVars:
      - key: NODE_VERSION
        value: 20
      - key: VITE_NOVA_CLOUD_URL
        sync: false
YAML
fi

mkdir -p "${DASHBOARD_REPO}/.github/workflows"
if [[ ! -f "${DASHBOARD_REPO}/.github/workflows/ci.yml" ]]; then
  cat > "${DASHBOARD_REPO}/.github/workflows/ci.yml" <<'YAML'
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  dashboard:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm install
      - run: npm run typecheck
      - run: npm run build
YAML
fi

init_repo "${API_REPO}"
init_repo "${DASHBOARD_REPO}"

"${ROOT_DIR}/scripts/sync-cloud-contracts.sh" "${API_REPO}" "${DASHBOARD_REPO}"

configure_remote "${API_REPO}" "${API_REMOTE_URL}"
configure_remote "${DASHBOARD_REPO}" "${DASHBOARD_REMOTE_URL}"

echo "Bootstrapped cloud API repo: ${API_REPO}"
echo "Bootstrapped cloud dashboard repo: ${DASHBOARD_REPO}"
echo "Next steps:"
echo "1. cd ${API_REPO} && npm install && npm run dev"
echo "2. cd ${DASHBOARD_REPO} && npm install && npm run dev"
echo "3. Point NovaRemote EXPO_PUBLIC_NOVA_CLOUD_URL at your cloud API deployment."
