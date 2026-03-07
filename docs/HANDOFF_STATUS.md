# NovaRemote Handoff Status

Updated: 2026-03-07

## v1.2 Connection Pool + Switcher

- [x] `useConnectionPool` reducer/state with per-server sessions, tails, drafts, stream metadata, health
- [x] Multi-server WebSocket lifecycle with reconnect/backoff per server/session
- [x] `useServerConnection` helper
- [x] `useUnreadServers` unread output tracking
- [x] `ServerSwitcherRail` with status dots, unread badges, reconnect/edit actions
- [x] AppShell integration to focused connection from pool (removed destructive single-server reset flow)
- [x] Fleet execution path reuses pooled capability/base-path decisions
- [x] Cross-server watch alert notification prefixing (`[ServerName] ...`)
- [x] Terminals screen all-servers view mode (pooled open sessions rendered together)
- [x] Tests:
  - [x] `useConnectionPool.integration.test.ts` multi-server websocket/pool flow coverage
  - [x] `useUnreadServers.test.ts`
  - [x] `ServerSwitcherRail.test.ts`
  - [x] `openTerminalEntries.test.ts`

## v1.3 Spatial AR (Glasses)

- [x] `SpatialTerminalLayout` component
- [x] `useSpatialVoiceRouting` with route parsing via shared core
- [x] Glasses screen multi-panel pooled integration
- [x] Workspace and VM host scoping in glasses flow
- [x] Brand expansions (`meta_orion`, `meta_ray_ban`, `viture_pro`)
- [x] Voice-channel controls and role-gated channel management in glasses route
- [x] Voice-channel presence state (`activeParticipantIds`, `activeSpeakerId`, `lastSpokeAt`) with live local-speaker updates during voice capture
- [x] Voice `share live` / spectator-link routing in glasses + VR
- [x] Voice pin/unpin panel routing in shared parser + glasses HUD + VR workspace/HUD
- [x] Voice add/remove panel routing in shared parser + glasses HUD + VR workspace/HUD

## v1.3.1 Hands-Free Voice Session + Panel Management (Glasses/VR)

- [x] Spatial voice routing additions:
  - [x] `create_session` (`ai`/`shell`) with target-server resolution
  - [x] `close_panel`
  - [x] `resize_panel` (`double`/`half`/`fullscreen`/`normal`)
  - [x] `move_panel`
  - [x] `swap_panels`
- [x] Preserve parser priority order so `open codex` resolves to `create_session` (not focus/send fallback)
- [x] Expose cross-server session creation through app context/view model (`onCreateSession(serverId, kind)`)
- [x] Glasses route handling for new actions (create/close/resize/move/swap)
- [x] Voice `close_panel` in glasses now routes through pooled server stop-session controls before removing the panel
- [x] VR voice `close_panel` now also routes through pooled stop-session controls (with panel removal) for parity with glasses
- [x] Prompt-aware voice creation parsing (`open codex ... with prompt ...`, `open terminal ... and run ...`) forwarded to session creation handlers
- [x] Voice create-session target resolution now falls back to pooled server metadata, so `"open codex on <server>"` works even before that server has an open panel/session
- [x] Create-session routing now prioritizes explicit server-target matches over fuzzy panel matches, preventing misroutes when similarly named VM panels are open
- [x] VR voice parser now receives pooled server targets, so `"open codex on <server>"` / `"new terminal on <vm host>"` resolve even when no panel is open yet
- [x] Spatial panel state additions:
  - [x] per-panel scale
  - [x] fullscreen panel mode
  - [x] per-panel position map with move/swap helpers
- [x] `SpatialTerminalLayout` fullscreen render path + scale support
- [x] Tests:
  - [x] `useSpatialVoiceRouting.test.ts` coverage for new commands and command-order behavior
  - [x] Glasses route integration tests for create/close/resize/move/swap flows

## v1.4 VR Command Center

- [x] In this repo: VR preview route/screen + pooled multi-server controls + tests
- [~] Separate production VR native app (`NovaRemoteVR`) track has executable bootstrap + contract sync scripts, temp-dir bootstrap verification (`vr:verify-bootstrap`) wired into CI, and scaffolded repo-side contract verification (`scripts/verify-contract-sync.sh` + `.github/workflows/contracts-sync.yml`); full native client implementation remains pending

## v1.5 VM Grouping

- [x] VM metadata on server model (`vmHost`, `vmType`, `vmName`, `vmId`)
- [x] Server grouping by VM host/type in server switcher and server management flows
- [x] Fleet target helpers for VM host/type groups

## v1.6 Team MVP (Enterprise Foundation)

- [x] `useTeamAuth` (team login, identity lifecycle, invite-code flow for `novaremote_cloud`)
- [x] `useTokenBroker` (ephemeral per-server tokens + auto-refresh + revocation behavior)
- [x] Team-aware server source model (`local` vs `team`) in `useServers`
- [x] Team server governance:
  - [x] non-admin edit/delete restrictions for team-managed servers
  - [x] permission-level badges/metadata in server UX
  - [x] URL-precedence merge (team server replaces local duplicate for same base URL)
  - [x] cloud scaffold server listing is now filtered by member assignments (admin sees all)
  - [x] cloud scaffold validates member server-assignment updates against known server IDs
- [x] `useAuditLog` local queue + periodic cloud sync
- [x] In-app audit queue export actions (`JSON` / `CSV`)
- [x] Wire audit events into command, fleet, file, process, and safety confirmation flows
- [x] Team screen in app with login, members, roles, invites, usage, and audit sync controls
- [x] Team invite lifecycle in app: list invites, create invite, and revoke pending invites
- [x] Team cloud dashboard bridge in app (dashboard URL surfaced + quick-open action)
- [x] Per-member usage telemetry surfaced in TeamScreen cards (sessions/commands/fleet)
- [x] Team/Enterprise packaging in monetization/paywall + seat-based product plumbing
- [x] RevenueCat entitlement tier recognition (`pro`/`team`/`enterprise`) in app gating state
- [x] Tier-aware paywall upgrade actions for Pro/Team/Enterprise (when package offerings are configured)
- [x] Seat-aware team/enterprise plan metadata surfaced in paywall and team settings
- [x] Team-enforced safety policy overrides (managed settings cannot be disabled locally)
- [x] Team policy/runtime additions:
  - [x] auto-refresh team identity session
  - [x] clear broker cache on logout
  - [x] immediate dangerous-command audit sync
  - [x] in-app team policy controls for danger confirm, fleet approval, session recording, timeout, and blocklist
  - [x] enforce session-recording policy
  - [x] enforce fleet-execution policy approval gate with in-app request/review actions
  - [x] fleet-approval review notes captured in TeamScreen and forwarded to approve/deny actions
  - [x] self-approval guard for fleet requests (another team member must approve)
  - [x] duplicate fleet approval requests are deduped when an identical request is already pending
  - [x] fleet approval request/claim now validates target existence + per-member access in cloud scaffold
  - [x] cloud scaffold + dashboard now support execution completion (`/complete`) with token verification and succeeded/failed outcomes
  - [x] derive runtime server permission level from broker token permissions
  - [x] cloud token provisioning now enforces member server assignment and least-privilege clamping by caller role + server policy
  - [x] token broker now provisions immediately on team login and purges cached tokens on 401/403 revocation responses
  - [x] cross-server command + control routes (including voice-driven sends) now enforce viewer write restrictions + blocklist policy and emit audit events with the correct target server context
  - [x] session stop actions are now auditable (`command_sent` with `stop_session`) across focused and cross-server flows
  - [x] shell session creation prompts (`start prompt` / voice `... and run ...`) now pass through danger/blocklist approval before execution

## v1.6.1 Multi-Server Session Lifecycle UX

- [x] Cross-server "stop session" actions in Terminals all-servers mode and Glasses HUD now call pooled stop-session APIs directly instead of falling back to Ctrl-C injection
- [x] View-model + context now expose server-scoped stop callbacks for spatial/remote surfaces
- [x] Added coverage in `useTerminalsViewModel.test.ts` and `GlassesModeScreen.test.ts` for server-scoped stop routing

## v2.0+ NovaAdapt / Team Roadmap

- [~] Early NovaAdapt runtime/panel scaffolding exists
- [x] In-app NovaSpine context snapshots are wired (`useNovaSpine` + runtime/panel integration for context status, pending approvals, and recent timeline state)
- [x] Voice remove-agent routing in shared parser + glasses + VR runtime callbacks
- [x] Voice set-agent-status routing in shared parser + glasses + VR runtime callbacks
- [x] Manual VR agent status controls (idle/monitoring/executing/waiting_approval) across scoped pooled targets
- [x] Monitoring-status orchestration now auto-queues pending approvals for existing agent goals when a routable session is available (runtime + AppShell + panel wiring)
- [~] Enterprise IAM expansion:
  - [x] SSO (`SAML`/`OIDC`) app-side token-exchange + TeamScreen SSO login mode
  - [x] Team SSO provider lifecycle (`GET/PATCH /v1/team/sso/providers`) wired in app (`useTeamAuth`, TeamScreen toggles) + cloud contract/scaffold
  - [~] in-app role/invite controls + member filtering + member server-assignment controls are implemented, plus invite revoke + dashboard deep-link; cloud dashboard scaffold now includes role/invite/server-assignment admin controls while production deployment remains pending
  - [x] role-limited team context fetch now degrades gracefully on `403` responses in `useTeamAuth.refreshTeamContext` (forbidden endpoints fall back to safe defaults while auth/network errors still surface)
- [~] Compliance expansion:
  - [x] team-managed session recording enforcement is in-app, and cloud scaffold now exposes member-effective policy reads (`GET /v1/team/settings/effective`) so non-admin clients still enforce admin-managed recording/safety settings
  - [x] audit export (`CSV`/`JSON`) from in-app queue
  - [x] cloud audit export job requests + export history refresh/list/open/retry/delete actions in app (`useAuditLog` + TeamScreen)
  - [x] cloud scaffold now emits system audit events for auth, server/invite/policy admin actions, fleet approval lifecycle, and export lifecycle updates
  - [x] download-token auth in cloud scaffold now uses constant-time token checks plus least-privilege (`audit:read`) request identity
  - [x] cloud OpenAPI contract now models download auth as bearer-or-token (`auditExportToken`) for `/v1/audit/exports/{exportId}/download`
  - [x] cloud scaffold audit-event queue is now bounded at 10,000 records with drop-count metadata on ingest responses
  - [x] cloud audit export listing now supports `status` / `format` / `requestedBy` filters for dashboard and compliance tooling
  - [x] dashboard scaffold export history now supports local requester/status/format filtering and requester visibility
  - [~] cloud export lifecycle governance now includes scaffold-side `pending` -> `ready`/`failed` transitions, retry endpoint (`POST /v1/audit/exports/{exportId}/retry`), tokenized download endpoint (`GET /v1/audit/exports/{exportId}/download`), TTL cleanup, and richer metadata (`eventCount`, `attemptCount`, transition timestamps), while production deployment remains pending
- [~] Fleet governance expansion:
  - [x] command blocklist + policy enforcement (including scaffold-side regex validation and policy payload bounds checks)
  - [x] approved execution claims now carry TTL metadata (`executionExpiresAt`) with scaffold-side expiration + re-claim enforcement
  - [~] fleet approval request/review + approved-execution matching is wired in-app and surfaced in dashboard scaffold (including approve/deny actions); scaffold API now enforces duplicate-pending + self-approval guardrails, pending-expiry normalization, approved-execution claim tokens/metadata, and request-identity-based review attribution for approve/deny actions, while production orchestration rollout remains pending
  - [x] inactivity timeout / session auto-disconnect policies
- [~] Separate NovaRemote Cloud backend + web admin dashboard rollout
- [~] Separate NovaRemote Cloud backend + web admin dashboard now have executable bootstrap + OpenAPI contract sync scaffolding (`cloud:bootstrap-repos`, `cloud:sync-contracts`) plus temp-dir bootstrap verification (`cloud:verify-bootstrap`), interactive dashboard scaffold wiring (built-in password/SSO sign-in helpers, invite-code redemption, refresh/logout session lifecycle, server fleet create/edit/delete, member role + server assignment management, invite lifecycle, policy editing, approvals, SSO toggles, audit event viewing/filtering, export request/history/delete lifecycle), file-backed local state persistence in the API scaffold, stricter refresh-token validation in scaffold auth routes, endpoint-level permission guards derived from team role in the scaffold API, server-derived member usage snapshots from audit history, and deployment templates (`Dockerfile`, `render.yaml`, scaffold CI workflows); production rollout/hardening remains pending
- [~] NovaSpine context orchestration is implemented in-app; monitoring-goal auto-queue lifecycle groundwork is now shipped, while full autonomous agent lifecycle orchestration remains roadmap work
- [~] Presence-aware voice channels are implemented in-app; full multi-user collaboration voice/presence channels remain roadmap work

## Notes

- All changes above were validated locally with `npm run ci` and pushed to `main`.
- GitHub Actions CI is currently green on the latest push that updated this status.
