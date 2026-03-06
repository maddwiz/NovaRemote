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
  permissions: [
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
    "audit:read"
  ],
  accessToken: `access-${randomUUID()}`,
  refreshToken: `refresh-${randomUUID()}`,
  tokenExpiresAt: Date.now() + 60 * 60 * 1000
};

const teamServers: TeamServer[] = [
  { id: "srv-dgx", teamServerId: "srv-dgx", name: "DGX", baseUrl: "https://dgx.example.com", defaultCwd: "/workspace", permissionLevel: "admin" },
  { id: "srv-home", teamServerId: "srv-home", name: "Homelab", baseUrl: "https://homelab.example.com", defaultCwd: "/home/dev", permissionLevel: "operator" }
];

const teamMembers: Array<{ id: string; name: string; email: string; role: TeamRole; serverIds: string[] }> = [
  { id: "user-admin-1", name: "Nova Admin", email: "admin@novaremote.dev", role: "admin", serverIds: teamServers.map((server) => server.id) }
];

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const stateFilePath =
  process.env.NOVA_CLOUD_STATE_FILE && process.env.NOVA_CLOUD_STATE_FILE.trim()
    ? path.resolve(process.cwd(), process.env.NOVA_CLOUD_STATE_FILE.trim())
    : path.resolve(__dirname, "../data/state.json");
const saveDebounceMsRaw = Number.parseInt(process.env.NOVA_CLOUD_STATE_SAVE_DEBOUNCE_MS || "200", 10);
const saveDebounceMs = Number.isFinite(saveDebounceMsRaw) && saveDebounceMsRaw >= 0 ? saveDebounceMsRaw : 200;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

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
        parsed.teamMembers as Array<{ id: string; name: string; email: string; role: TeamRole; serverIds: string[] }>
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

const teamServerCreateSchema = z.object({
  name: z.string().trim().min(1),
  baseUrl: z.string().url(),
  defaultCwd: z.string().trim().min(1).default("/"),
  permissionLevel: z.enum(["admin", "operator", "viewer"]).default("operator"),
});

const teamServerPatchSchema = teamServerCreateSchema.partial();

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

function unauthorized(res: Response, detail: string) {
  res.status(401).json({ detail });
}

function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || token !== baseIdentity.accessToken) {
    return unauthorized(res, "Unauthorized");
  }
  next();
}

app.get("/healthz", (_req, res) => {
  res.json({ ok: true });
});

app.post("/v1/auth/login", (_req, res) => {
  baseIdentity.accessToken = `access-${randomUUID()}`;
  baseIdentity.refreshToken = `refresh-${randomUUID()}`;
  baseIdentity.tokenExpiresAt = Date.now() + 60 * 60 * 1000;
  res.json({ identity: baseIdentity });
});

app.post("/v1/auth/sso/exchange", (_req, res) => {
  baseIdentity.provider = "oidc";
  baseIdentity.accessToken = `access-${randomUUID()}`;
  baseIdentity.refreshToken = `refresh-${randomUUID()}`;
  baseIdentity.tokenExpiresAt = Date.now() + 60 * 60 * 1000;
  res.json({ identity: baseIdentity });
});

app.post("/v1/auth/refresh", (_req, res) => {
  baseIdentity.accessToken = `access-${randomUUID()}`;
  baseIdentity.refreshToken = `refresh-${randomUUID()}`;
  baseIdentity.tokenExpiresAt = Date.now() + 60 * 60 * 1000;
  res.json({ identity: baseIdentity });
});

app.use("/v1", requireAuth);

app.post("/v1/tokens/provision", (req, res) => {
  const serverId = String(req.body?.serverId || "").trim();
  const permissionLevel = String(req.body?.permissionLevel || "viewer").trim();
  if (!serverId) {
    return res.status(400).json({ detail: "serverId is required" });
  }
  const permissionMap: Record<string, string[]> = {
    admin: ["read", "write", "execute", "admin"],
    operator: ["read", "write", "execute"],
    viewer: ["read"]
  };
  const permissions = permissionMap[permissionLevel] || ["read"];
  res.json({
    serverId,
    token: `srv-token-${serverId}-${randomUUID()}`,
    expiresAt: Date.now() + 2 * 60 * 60 * 1000,
    permissions
  });
});

app.get("/v1/team/servers", (_req, res) => {
  res.json({ servers: teamServers });
});

app.post("/v1/team/servers", (req, res) => {
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
  schedulePersist();
  res.json({ server: nextServer });
});

app.patch("/v1/team/servers/:serverId", (req, res) => {
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
  schedulePersist();
  res.json({ server: target });
});

app.delete("/v1/team/servers/:serverId", (req, res) => {
  const serverId = String(req.params.serverId || "").trim();
  const index = teamServers.findIndex((entry) => entry.id === serverId);
  if (index === -1) {
    return res.status(404).json({ detail: "Server not found" });
  }
  const [removed] = teamServers.splice(index, 1);
  teamMembers.forEach((member) => {
    member.serverIds = member.serverIds.filter((id) => id !== serverId);
  });
  schedulePersist();
  res.json({ server: removed, ok: true });
});

app.get("/v1/team/members", (_req, res) => {
  res.json({ members: teamMembers });
});

app.patch("/v1/team/members/:memberId", (req, res) => {
  const memberId = String(req.params.memberId || "");
  const role = String(req.body?.role || "") as TeamRole;
  const member = teamMembers.find((entry) => entry.id === memberId);
  if (!member) {
    return res.status(404).json({ detail: "Member not found" });
  }
  member.role = role;
  schedulePersist();
  res.json({ ok: true });
});

app.put("/v1/team/members/:memberId/servers", (req, res) => {
  const memberId = String(req.params.memberId || "");
  const member = teamMembers.find((entry) => entry.id === memberId);
  if (!member) {
    return res.status(404).json({ detail: "Member not found" });
  }
  member.serverIds = Array.isArray(req.body?.serverIds) ? req.body.serverIds.map((entry: unknown) => String(entry)) : [];
  schedulePersist();
  res.json({ ok: true });
});

app.get("/v1/team/settings", (_req, res) => {
  res.json({ settings: teamSettings });
});

app.patch("/v1/team/settings", (req, res) => {
  Object.assign(teamSettings, req.body || {});
  schedulePersist();
  res.json({ settings: teamSettings });
});

app.get("/v1/team/usage", (_req, res) => {
  res.json({
    usage: {
      activeMembers: teamMembers.length,
      sessionsCreated: 0,
      commandsSent: 0,
      fleetExecutions: 0
    }
  });
});

app.get("/v1/team/invites", (_req, res) => {
  res.json({ invites: teamInvites });
});

app.post("/v1/team/invites", (req, res) => {
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
  schedulePersist();
  res.json({ invite });
});

app.delete("/v1/team/invites/:inviteId", (req, res) => {
  const invite = teamInvites.find((entry) => entry.id === req.params.inviteId);
  if (!invite) {
    return res.status(404).json({ detail: "Invite not found" });
  }
  invite.status = "revoked";
  invite.revokedAt = new Date().toISOString();
  schedulePersist();
  res.json({ ok: true });
});

app.get("/v1/team/sso/providers", (_req, res) => {
  res.json({ providers: teamSsoProviders });
});

app.patch("/v1/team/sso/providers/:provider", (req, res) => {
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
  schedulePersist();
  res.json({ provider: entry });
});

app.get("/v1/team/fleet/approvals", (_req, res) => {
  res.json({ approvals: fleetApprovals });
});

app.post("/v1/team/fleet/approvals", (req, res) => {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const approval: FleetApproval = {
    id: `fa-${randomUUID().slice(0, 8)}`,
    command: String(req.body?.command || "").trim(),
    requestedByUserId: baseIdentity.userId,
    requestedByEmail: baseIdentity.email,
    targets: Array.isArray(req.body?.targets) ? req.body.targets.map((entry: unknown) => String(entry)) : [],
    createdAt: now,
    updatedAt: now,
    status: "pending",
    note: typeof req.body?.note === "string" ? req.body.note : undefined,
    expiresAt
  };
  fleetApprovals.unshift(approval);
  schedulePersist();
  res.json({ approval });
});

app.post("/v1/team/fleet/approvals/:approvalId/approve", (req, res) => {
  const approval = fleetApprovals.find((entry) => entry.id === req.params.approvalId);
  if (!approval) {
    return res.status(404).json({ detail: "Approval not found" });
  }
  approval.status = "approved";
  approval.updatedAt = new Date().toISOString();
  approval.note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : approval.note;
  schedulePersist();
  res.json({ ok: true });
});

app.post("/v1/team/fleet/approvals/:approvalId/deny", (req, res) => {
  const approval = fleetApprovals.find((entry) => entry.id === req.params.approvalId);
  if (!approval) {
    return res.status(404).json({ detail: "Approval not found" });
  }
  approval.status = "denied";
  approval.updatedAt = new Date().toISOString();
  approval.note = typeof req.body?.note === "string" && req.body.note.trim() ? req.body.note.trim() : approval.note;
  schedulePersist();
  res.json({ ok: true });
});

app.get("/v1/audit/events", (req, res) => {
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

app.post("/v1/audit/events", (req, res) => {
  const incoming = Array.isArray(req.body?.events) ? req.body.events : [];
  const normalized = incoming
    .map((entry) => normalizeAuditEvent(entry))
    .filter((entry): entry is AuditEvent => Boolean(entry));
  auditEvents.push(...normalized);
  schedulePersist();
  res.json({ accepted: normalized.length, rejected: incoming.length - normalized.length });
});

app.get("/v1/audit/exports", (req, res) => {
  const limitRaw = Number.parseInt(String(req.query?.limit || "20"), 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 20;
  const ordered = [...auditExportJobs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({
    exports: ordered.slice(0, limit)
  });
});

app.post("/v1/audit/exports", (req, res) => {
  const format = String(req.body?.format || "").toLowerCase();
  if (format !== "json" && format !== "csv") {
    return res.status(400).json({ detail: "format must be json or csv" });
  }
  const exportId = `audit-exp-${randomUUID().slice(0, 10)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const job = {
    exportId,
    format: format as "json" | "csv",
    status: "ready" as const,
    createdAt,
    expiresAt,
    downloadUrl: `https://cloud.novaremote.dev/exports/${exportId}.${format}`,
    detail: `Snapshot contains ${auditEvents.length} events`
  };
  auditExportJobs.unshift(job);
  schedulePersist();
  res.json(job);
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

export function App() {
  const [status, setStatus] = useState<string>("Ready");
  const [accessToken, setAccessToken] = useState<string>("");
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

  const loadTeamData = useCallback(async () => {
    if (!accessToken.trim()) {
      setStatus("Paste an access token from /v1/auth/login to load team data.");
      return;
    }
    setBusy(true);
    setStatus("Loading team data...");
    try {
      const [membersPayload, teamServersPayload, approvalsPayload, ssoPayload, invitesPayload, settingsPayload, exportsPayload, auditEventsPayload] = await Promise.all([
        fetchJson<{ members?: TeamMember[] }>("/v1/team/members", accessToken.trim()),
        fetchJson<{ servers?: TeamServer[] }>("/v1/team/servers", accessToken.trim()),
        fetchJson<{ approvals?: FleetApproval[] }>("/v1/team/fleet/approvals", accessToken.trim()),
        fetchJson<{ providers?: TeamSsoProviderConfig[] }>("/v1/team/sso/providers", accessToken.trim()),
        fetchJson<{ invites?: TeamInvite[] }>("/v1/team/invites", accessToken.trim()),
        fetchJson<{ settings?: TeamSettings }>("/v1/team/settings", accessToken.trim()),
        fetchJson<{ exports?: AuditExportJob[] }>("/v1/audit/exports?limit=20", accessToken.trim()),
        fetchJson<{ events?: AuditEvent[] }>("/v1/audit/events?limit=200", accessToken.trim()),
      ]);
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
      setStatus("Team data loaded.");
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
        <label className="muted">
          Access Token
          <input
            className="textInput"
            value={accessToken}
            onChange={(event) => setAccessToken(event.target.value)}
            placeholder="Paste bearer token from /v1/auth/login"
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
              <p key={job.exportId} className="muted">
                {job.exportId} • {job.format.toUpperCase()} • {job.status} • {new Date(job.createdAt).toLocaleString()}{" "}
                {job.downloadUrl ? (
                  <a href={job.downloadUrl} target="_blank" rel="noreferrer">
                    open
                  </a>
                ) : null}
              </p>
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
