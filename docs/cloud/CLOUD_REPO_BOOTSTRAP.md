# NovaRemote Cloud Stack Bootstrap

This track moves the remaining handoff items from "roadmap" to executable scaffolding:

- `NovaRemoteCloud` backend repo (team auth + token broker + policy + audit endpoints)
- `NovaRemoteCloudDashboard` web admin repo (team/admin/audit UI scaffold with member/fleet/SSO/export controls)

## 1. Bootstrap Both Repos

From the `NovaRemote` repo:

```bash
npm run cloud:bootstrap-repos
```

Default output paths:

- `../NovaRemoteCloud`
- `../NovaRemoteCloudDashboard`

Custom paths/remotes:

```bash
npm run cloud:bootstrap-repos -- \
  --api /absolute/path/to/NovaRemoteCloud \
  --dashboard /absolute/path/to/NovaRemoteCloudDashboard \
  --api-remote git@github.com:YOUR_ORG/NovaRemoteCloud.git \
  --dashboard-remote git@github.com:YOUR_ORG/NovaRemoteCloudDashboard.git
```

Bootstrap verification (temp-dir smoke check):

```bash
npm run cloud:verify-bootstrap
```

## 2. Contract Sync

Cloud API contract source of truth in this repo:

- `docs/contracts/novaremote-cloud-openapi.v1.yaml`

Sync command:

```bash
npm run cloud:sync-contracts -- /absolute/path/to/NovaRemoteCloud /absolute/path/to/NovaRemoteCloudDashboard
```

This writes:

- `contracts/novaremote-cloud-openapi.v1.yaml`
- `contracts/NOVAREMOTE_CLOUD_CONTRACT_SOURCE.txt`

to each target repo.

## 3. Run Locally

Cloud API:

```bash
cd ../NovaRemoteCloud
npm install
npm run dev
```

Dashboard:

```bash
cd ../NovaRemoteCloudDashboard
npm install
npm run dev
```

The generated dashboard scaffold currently wires:

- built-in password/SSO sign-in helpers for local testing
- invite-code redemption flow during password/SSO sign-in
- refresh-session and logout helpers (`/v1/auth/refresh`, `/v1/auth/logout`) with auto-refresh scheduling
- team server create/edit/delete controls
- team member list + role update controls
- member server-assignment controls
- invite lifecycle controls (create + revoke)
- team policy controls (`danger confirm`, `fleet approval`, `recording`, `timeout`, `blocklist`)
- fleet approval feed with approve/deny actions
- SSO provider toggle controls (`OIDC`/`SAML`)
- audit event viewer with action/server filters
- cloud audit export request actions (`JSON`/`CSV`) + export history list/open/delete controls

The generated API scaffold now persists state to a local JSON file (`NOVA_CLOUD_STATE_FILE`, default `./data/state.json`) so local restarts retain team data.
It also applies endpoint-level permission guards (`requireTeamPermission`) derived from the signed-in role for local RBAC validation.
Fleet approval endpoints now include duplicate-pending detection, pending-expiry normalization, and server-side self-approval guardrails.
Approved fleet requests can also be claimed for execution (`claim-execution`) to generate an execution token and reviewer/executor metadata.
The scaffold also emits system audit events for auth, server-fleet, invite, policy, approval-review, and export lifecycle actions.
Team policy updates are schema-validated in the scaffold API, including timeout bounds and command blocklist regex validation.
Audit export jobs now model lifecycle states (`pending` -> `ready`) and TTL cleanup with expiry metadata in the dashboard scaffold.
Team member responses now include server-derived usage snapshots (`sessionsCreated`, `commandsSent`, `fleetExecutions`, `lastActiveAt`) computed from the audit stream.
Token provisioning now enforces server assignment + least-privilege permission clamping (requested level is capped by caller role and server policy).
Team server listing now enforces per-member visibility (non-admin members only receive assigned servers).

Each generated repo also includes deployment starters:

- `Dockerfile`
- `render.yaml`
- `.github/workflows/ci.yml`

Use:

- `EXPO_PUBLIC_NOVA_CLOUD_URL=http://localhost:8788`

in NovaRemote dev environments.

## 4. Production Hardening Checklist

Before external rollout, replace scaffold defaults with:

- PostgreSQL storage + migrations
- JWT verification + rotation
- RBAC enforcement middleware by endpoint
- fleet approval policy engine and durable state
- audit event retention + export jobs
- SSO provider metadata/config (OIDC/SAML)
- secrets manager integration and deployment IaC
