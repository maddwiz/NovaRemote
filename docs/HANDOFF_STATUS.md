# NovaRemote Handoff Status

Updated: 2026-03-05

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
- [ ] Separate production VR native app (`NovaRemoteVR`) still a broader standalone track

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
- [x] `useAuditLog` local queue + periodic cloud sync
- [x] In-app audit queue export actions (`JSON` / `CSV`)
- [x] Wire audit events into command, fleet, file, process, and safety confirmation flows
- [x] Team screen in app with login, members, roles, invites, usage, and audit sync controls
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
  - [x] derive runtime server permission level from broker token permissions
  - [x] token broker now provisions immediately on team login and purges cached tokens on 401/403 revocation responses

## v2.0+ NovaAdapt / Team Roadmap

- [~] Early NovaAdapt runtime/panel scaffolding exists
- [x] Voice remove-agent routing in shared parser + glasses + VR runtime callbacks
- [x] Voice set-agent-status routing in shared parser + glasses + VR runtime callbacks
- [x] Manual VR agent status controls (idle/monitoring/executing/waiting_approval) across scoped pooled targets
- [ ] Enterprise IAM expansion:
  - [~] SSO (`SAML`/`OIDC`) app-side token-exchange + TeamScreen SSO login mode are implemented; provider dashboard + backend rollout remains pending
  - [~] in-app role/invite controls + member filtering + member server-assignment controls are implemented; centralized cloud admin UX remains pending
- [ ] Compliance expansion:
  - [~] team-managed session recording enforcement is in-app; cloud admin policy governance remains pending
  - [~] audit export (`CSV`/`JSON`) from in-app queue is implemented; cloud dashboard export remains pending
- [ ] Fleet governance expansion:
  - [x] command blocklist + policy enforcement
  - [~] fleet approval request/review + approved-execution matching is wired in-app; cloud dashboard orchestration remains pending
  - [x] inactivity timeout / session auto-disconnect policies
- [ ] Separate NovaRemote Cloud backend + web admin dashboard rollout
- [ ] Full agent lifecycle + NovaSpine memory orchestration is still roadmap work
- [ ] Full team collaboration voice/presence channels remains roadmap work

## Notes

- All changes above were validated locally with `npm run ci` and pushed to `main`.
- GitHub Actions CI is currently green on the latest push that updated this status.
