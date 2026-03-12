# NovaRemote Handoff Status

Updated: 2026-03-11

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
  - [x] cloud scaffold server listing now supports `vmHost` / `vmType` / `permissionLevel` / `search` filters with dashboard server filter controls
  - [x] cloud scaffold validates member server-assignment updates against known server IDs
  - [x] cloud scaffold server create/edit now persists VM metadata (`vmHost`/`vmType`/`vmName`/`vmId`) and dashboard forms expose those fields
- [x] `useAuditLog` local queue + periodic cloud sync
- [x] In-app audit queue export actions (`JSON` / `CSV`)
- [x] Wire audit events into command, fleet, file, process, and safety confirmation flows
- [x] Team screen in app with login, members, roles, invites, usage, and audit sync controls
- [x] Team invite lifecycle in app: list invites, create invite, and revoke pending invites
- [x] TeamScreen invite management now includes status/role/email filtering plus in-app pending/accepted/expired/revoked rollup visibility
- [x] Cloud scaffold invite listing now supports `status` / `role` / `email` filters with dashboard filter controls
- [x] Cloud scaffold invite listing now includes `pending` / `accepted` / `expired` / `revoked` summary rollups for dashboard governance visibility
- [x] Team cloud dashboard bridge in app (dashboard URL surfaced + quick-open action)
- [x] Per-member usage telemetry surfaced in TeamScreen cards (sessions/commands/fleet)
- [x] Cloud dashboard scaffold now surfaces aggregate usage counters from `/v1/team/usage` (`activeMembers`, `sessionsCreated`, `commandsSent`, `fleetExecutions`)
- [x] Cloud scaffold member listing now supports `role` / `email` / `activeSince` filters with dashboard member filter controls
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

- [x] NovaAdapt runtime/panel lifecycle is now implemented in-app (agent CRUD, status/goal/capability updates, approvals, memory timeline, monitoring controls, voice-routed lifecycle actions across AR/VR surfaces)
- [x] In-app NovaSpine context snapshots are wired (`useNovaSpine` + runtime/panel integration for context status, pending approvals, and recent timeline state)
- [x] External LLM replies now stream into NovaRemote for supported providers (OpenAI-compatible, Azure OpenAI, Anthropic, Ollama) with timing metrics surfaced in diagnostics
- [x] Server-side NovaAdapt bridge groundwork is now live in-app:
  - [x] `useNovaAdaptBridge` thin client against companion `/agents/*`
  - [x] live plan/job SSE follow for active plans and jobs
  - [x] server-runtime plan actions (`approve`, `reject`, `retry`, `undo`) from mobile
  - [x] dedicated `Agents` route/screen backed by the bridge
  - [x] dedicated `Agents` route now prefers server-backed creation (`Create Approval Plan`, `Start Workflow`, `Resume Workflow`)
  - [x] audit-event SSE now triggers quiet bridge refreshes so server-side plan/job/memory changes land without waiting for the poll interval
  - [x] server-backed runtime governance controls are now surfaced in the mobile bridge runtime section (pause, resume, reset usage, cancel all jobs)
  - [x] dedicated `Agents` runtime-unavailable state now labels the remaining phone-side controls explicitly as `device fallback` and shows companion capability availability in that panel
  - [x] local NovaAdapt preview no longer mounts inside the embedded `Terminals` panel; local fallback is now reserved for explicit preview surfaces and the dedicated `Agents` screen when the server runtime is unavailable
  - [x] the remaining phone-side fallback UI is now isolated in `NovaDeviceFallbackPanel`, so `NovaAgentPanel` stays focused on the server bridge surface and explicit fallback routing
  - [x] the embedded `Terminals` panel now exposes an explicit `Open Agents` CTA whenever the server runtime is unavailable, so the remaining local fallback path is discoverable instead of implicit
  - [x] AppShell agent actions now route remote-first through the bridge, translating assistant/runtime actions into server plans/workflows before falling back to the phone runtime
  - [x] focused-server local monitoring cycles are now suppressed when the server NovaAdapt runtime is available, preventing duplicate phone-side monitoring on the active server
  - [x] terminals/app context no longer expose focused-only approve/deny shortcuts; agent approvals now route through the same server-scoped async bridge callbacks everywhere
  - [x] focused-server local agent CRUD/approval execution is now gated behind bridge availability checks, so an online server runtime no longer silently falls through to phone-side execution on the active server
  - [x] the dedicated `Agents` screen no longer mounts the phone-side NovaAdapt runtime hook when the server bridge is live; local preview now renders only as an explicit fallback surface
  - [x] the dedicated `Agents` screen no longer auto-mounts local fallback when the runtime is down; local preview is now an explicit opt-in fallback control on that screen
  - [x] `AppShell` now passes `serverId: null` into the focused local NovaAdapt runtime hook while the server bridge is online, so the active-server phone runtime is actually disabled instead of merely gated at action time
  - [x] generic `AppShell` agent actions no longer run the hidden focused-server phone runtime at all; when the server runtime is unavailable, fallback is now explicit through the dedicated `Agents` screen only
  - [x] server-backed template surfaces are now wired into the `Agents` screen runtime section, including saved templates, built-in gallery import, and direct plan/workflow launch actions
  - [x] bridge capability detection now treats optional NovaAdapt sidecar routes independently, so missing memory/governance/workflow/template routes degrade those controls without marking the whole runtime offline
  - [x] the bridge now prefers companion-provided `/agents/capabilities` metadata and only falls back to 404-based optional-route probing against older companion builds
- [x] Voice remove-agent routing in shared parser + glasses + VR runtime callbacks
- [x] Voice set-agent-status routing in shared parser + glasses + VR runtime callbacks
- [x] Manual VR agent status controls (idle/monitoring/executing/waiting_approval) across scoped pooled targets
- [x] Monitoring-status orchestration now auto-queues pending approvals for existing agent goals when a routable session is available (runtime + AppShell + panel wiring)
- [x] Focused-server monitoring lifecycle now runs on an interval with cooldown gating, queues monitoring approvals automatically, and supports autonomous self-approval dispatch when agent capabilities include `autonomous` / `auto-approve`
- [x] Monitoring/autonomous cycles now fall back to each agent's latest known routed session from NovaMemory when no current default session is available, reducing stalled monitoring loops after focus/surface changes
- [x] NovaAdapt panel now includes manual "Run Monitoring" cycle control with immediate queued/dispatched feedback for monitoring agents
- [x] Added NovaAdapt panel regression coverage for manual monitoring controls (`src/components/NovaAgentPanel.test.tsx`)
- [x] Monitoring orchestration now supports autonomous multi-step workflow goals (`&&`, `;`, newline, `then`) with sequential step dispatch and automatic completion transitions to `idle`
- [~] Enterprise IAM expansion:
  - [x] SSO (`SAML`/`OIDC`) app-side token-exchange + TeamScreen SSO login mode
  - [x] Team SSO provider lifecycle (`GET/PATCH /v1/team/sso/providers`) wired in app (`useTeamAuth`, TeamScreen toggles + editable display/issuer/auth/token/client/callback fields) + cloud contract/scaffold
  - [x] Cloud dashboard scaffold now supports full SSO provider metadata editing (`displayName`, `issuerUrl`, `authUrl`, `tokenUrl`, `clientId`, `callbackUrl`) in addition to enable/disable actions
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
  - [x] dashboard scaffold now supports one-click download of filtered audit-event views as local `JSON`/`CSV` artifacts
  - [x] cloud export observability expanded with per-export detail reads (`GET /v1/audit/exports/{exportId}`), list summaries, and dashboard range-hour export requests + per-job detail drill-down (`inScopeEventCount` + `scopeDelta`) + retry controls
  - [x] cloud export observability now tracks per-job `processingDurationMs` plus export-list summary `avgProcessingDurationMs` / `oldestPendingAgeMs` in scaffold lifecycle metadata, OpenAPI schema, and dashboard export views
  - [x] cloud audit events now support `user` + `approved` filters (API contract + scaffold route + dashboard user filter)
  - [~] cloud export lifecycle governance now includes scaffold-side `pending` -> `ready`/`failed` transitions, retry endpoint (`POST /v1/audit/exports/{exportId}/retry`), tokenized download endpoint (`GET /v1/audit/exports/{exportId}/download`), TTL cleanup, and richer metadata (`eventCount`, `attemptCount`, transition timestamps), while production deployment remains pending
- [~] Fleet governance expansion:
  - [x] command blocklist + policy enforcement (including scaffold-side regex validation and policy payload bounds checks)
  - [x] approved execution claims now carry TTL metadata (`executionExpiresAt`) with scaffold-side expiration + re-claim enforcement
  - [x] fleet approval listing now supports `status` / `executionState` / `requestedBy` / `reviewedBy` / `target` filters (API contract + scaffold route + dashboard filter controls)
  - [x] fleet approval list responses now include status/execution rollup summaries for dashboard governance visibility
  - [x] dashboard scaffold fleet-review actions now forward optional review notes and completion summaries to approve/deny/complete endpoints
  - [~] fleet approval request/review + approved-execution matching is wired in-app and surfaced in dashboard scaffold (including approve/deny actions); scaffold API now enforces duplicate-pending + self-approval guardrails, pending-expiry normalization, approved-execution claim tokens/metadata, and request-identity-based review attribution for approve/deny actions, while production orchestration rollout remains pending
  - [x] inactivity timeout / session auto-disconnect policies
- [~] Separate NovaRemote Cloud backend + web admin dashboard rollout
- [~] Separate NovaRemote Cloud backend + web admin dashboard now have executable bootstrap + OpenAPI contract sync scaffolding (`cloud:bootstrap-repos`, `cloud:sync-contracts`) plus temp-dir bootstrap verification (`cloud:verify-bootstrap`), interactive dashboard scaffold wiring (built-in password/SSO sign-in helpers, invite-code redemption, refresh/logout session lifecycle, server fleet create/edit/delete, member role + server assignment management, invite lifecycle, policy editing, approvals, SSO toggles, audit event viewing/filtering, export request/history/delete lifecycle), file-backed local state persistence in the API scaffold, stricter refresh-token validation in scaffold auth routes, endpoint-level permission guards derived from team role in the scaffold API, server-derived member usage snapshots from audit history, and deployment templates (`Dockerfile`, `render.yaml`, scaffold CI workflows); production rollout/hardening remains pending
- [x] NovaSpine context orchestration + autonomous lifecycle routing are implemented in-app, including monitoring auto-queue, auto-approve, memory session fallback, and multi-step autonomous workflow sequencing
- [x] Terminals workspace voice channels now sync remote collaborator participant presence from focused-server collaboration sessions, preserving local participation and pruning stale remote speakers
- [x] Glasses and VR workspace voice channels now sync remote collaborator participant presence from focused-server collaboration sessions, preserving local participation and pruning stale remote speakers
- [x] Cross-surface voice presence now derives remote active speaker state from collaborator `lastSeenAt` snapshots and syncs speaker + participant updates through shared channel state (Terminals + Glasses + VR)
- [x] Presence sync now applies to every joined workspace voice channel (not only the first joined channel), enabling multi-workspace collaboration channel state parity across Terminals + Glasses + VR
- [x] Workspace channel UIs now resolve participant/speaker IDs to human labels (name/role) via merged collaboration + workspace-member directories across Terminals panel, Glasses HUD channels, and VR channel controls
- [x] Channel UIs now surface live participant summaries (online + speaker + participant list) across Terminals, Glasses, and VR collaboration controls for faster multi-user situational awareness
- [x] Presence-aware collaboration voice channels are implemented in-app across Terminals + Glasses + VR (participant/speaker identity mapping, joined-channel multi-workspace sync, live summaries)
- [x] Dedicated voice presence backplane transport is now implemented in-app (`useVoicePresenceBackplane`) with reconnect, heartbeat, auth/sync payloads, remote participant/speaker reconciliation, and regression coverage (`useVoicePresenceBackplane.test.ts`, `useVoiceChannels.test.ts`)

## Notes

- Companion-server-side NovaAdapt rollout is now documented in [docs/NOVAADAPT_SERVER_ROLLOUT.md](./NOVAADAPT_SERVER_ROLLOUT.md).
- Current server-backed NovaAdapt scope in-app is:
  - health + memory status reads
  - plans/jobs/workflows listing
  - plan/job live stream updates
  - audit-event-driven quiet refresh for relevant bridge mutations
  - plan action mutations
  - server-backed workflow creation + resume actions
  - server-backed plan creation from the dedicated `Agents` screen
  - explicit opt-in local fallback controls on the dedicated `Agents` screen when the server runtime is unavailable
  - server-first runtime status in the embedded `Terminals` panel without mounting the phone-side preview while the bridge runtime is healthy
  - explicit `Open Agents` routing from the embedded `Terminals` panel when the server runtime is unavailable
  - server-runtime misses now redirect the app into the dedicated `Agents` screen for the target server before surfacing the device-fallback message
  - server-backed template gallery + saved-template launch controls in the dedicated `Agents` screen
  - capability-aware optional bridge controls that hide or replace unsupported memory/governance/workflow/template surfaces instead of surfacing dead actions when a sidecar route is not available yet
  - workflow creation and template workflow-launch actions are now capability-gated, so the mobile surface stops offering dead workflow actions when the companion reports `workflows: false`
  - companion-provided `/agents/capabilities` support flags that let the mobile bridge skip unsupported optional route fetches instead of relearning support through repeated 404s
  - runtime-miss redirects into the dedicated `Agents` screen now auto-open device fallback for the target server instead of forcing a second manual toggle
  - validated companion sidecar routing for `codex_remote + NovaAdapt + NovaSpine`, including host `/agents/workflows/*` forwarding
  - codex_remote sidecar validation is now scriptable for both package and live stack checks via `scripts/validate_nova_sidecars.py`
  - codex_remote live sidecar validation now tolerates a missing `.env.nova-sidecars` file, so operators can validate an already-running stack directly against host/runtime state
  - codex_remote now also ships sidecar lifecycle wrappers (`scripts/start_nova_sidecars.sh`, `scripts/stop_nova_sidecars.sh`) for repeatable bring-up and teardown
  - codex_remote proxy allowlist now includes runtime governance routes for future mobile-side pause/cancel controls (`/agents/runtime/governance`, `/agents/runtime/jobs/cancel_all`)
  - the bridge now preserves companion `protocol_version` / `agent_contract_version` from both `/agents/health` and `/agents/capabilities`, and the server-runtime panel warns when the companion contract drifts from the mobile client expectation
- Remaining server-runtime migration work is:
  - finish release-hardening and packaging around the validated `codex_remote + NovaAdapt + NovaSpine` sidecar topology
  - clean auth/protocol boundaries before companion-server open-sourcing
- GitHub Actions `CI` now runs `cloud:verify-bootstrap` and `vr:verify-bootstrap` in addition to typecheck/tests/doctor.
- All changes above were validated locally with focused typecheck/test runs, and stable slices were pushed to `feat/novaremote-runtime-migration`.
- GitHub Actions CI status should be evaluated against that feature branch until it is merged to `main`.


- Frozen NovaAdapt integration target `cfb8983` (`novaadapt-integration-freeze-cfb8983`) now passes the companion contract validator via `codex_remote/scripts/validate_nova_sidecars.py --compose-only --novaadapt-contract-check`.
- Live companion validation remains pending until the local Docker Desktop backend and sidecar processes recover; current runtime checks reach Codex Remote `/health` but still see NovaAdapt/NovaSpine upstream resets.
