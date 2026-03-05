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

This scaffold intentionally uses in-memory state to unblock integration. Replace with PostgreSQL + migrations before production rollout.
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
ENV
fi

if [[ ! -f "${API_REPO}/src/server.ts" ]]; then
  cat > "${API_REPO}/src/server.ts" <<'TS'
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { randomUUID } from "node:crypto";
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
const auditEvents: unknown[] = [];
const teamSettings = {
  enforceDangerConfirm: true,
  commandBlocklist: [],
  sessionTimeoutMinutes: 20,
  requireSessionRecording: false,
  requireFleetApproval: false
};

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "operator", "viewer", "billing"])
});

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
  res.json({ ok: true });
});

app.put("/v1/team/members/:memberId/servers", (req, res) => {
  const memberId = String(req.params.memberId || "");
  const member = teamMembers.find((entry) => entry.id === memberId);
  if (!member) {
    return res.status(404).json({ detail: "Member not found" });
  }
  member.serverIds = Array.isArray(req.body?.serverIds) ? req.body.serverIds.map((entry: unknown) => String(entry)) : [];
  res.json({ ok: true });
});

app.get("/v1/team/settings", (_req, res) => {
  res.json({ settings: teamSettings });
});

app.patch("/v1/team/settings", (req, res) => {
  Object.assign(teamSettings, req.body || {});
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
  res.json({ invite });
});

app.delete("/v1/team/invites/:inviteId", (req, res) => {
  const invite = teamInvites.find((entry) => entry.id === req.params.inviteId);
  if (!invite) {
    return res.status(404).json({ detail: "Invite not found" });
  }
  invite.status = "revoked";
  invite.revokedAt = new Date().toISOString();
  res.json({ ok: true });
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
  res.json({ ok: true });
});

app.post("/v1/audit/events", (req, res) => {
  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  auditEvents.push(...events);
  res.json({ accepted: events.length, rejected: 0 });
});

app.post("/v1/audit/exports", (req, res) => {
  const format = String(req.body?.format || "").toLowerCase();
  if (format !== "json" && format !== "csv") {
    return res.status(400).json({ detail: "format must be json or csv" });
  }
  const exportId = `audit-exp-${randomUUID().slice(0, 10)}`;
  const createdAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  res.json({
    exportId,
    format,
    status: "ready",
    createdAt,
    expiresAt,
    downloadUrl: `https://cloud.novaremote.dev/exports/${exportId}.${format}`,
    detail: `Snapshot contains ${auditEvents.length} events`
  });
});

const port = Number.parseInt(process.env.PORT || "8788", 10);
app.listen(port, () => {
  console.log(`NovaRemoteCloud scaffold listening on http://localhost:${port}`);
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
const cloudUrl = import.meta.env.VITE_NOVA_CLOUD_URL || "http://localhost:8788";

export function App() {
  return (
    <main className="layout">
      <section className="panel">
        <h1 className="title">NovaRemote Cloud Dashboard</h1>
        <p className="muted">Connected API: {cloudUrl}</p>
      </section>
      <section className="panel">
        <h2 className="title">Team Fleet</h2>
        <p className="muted">Manage members, roles, server assignments, and policy locks.</p>
      </section>
      <section className="panel">
        <h2 className="title">Audit Stream</h2>
        <p className="muted">Review command history and export compliance evidence.</p>
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
