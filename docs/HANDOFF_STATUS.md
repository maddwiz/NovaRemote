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

- [ ] Spatial voice routing additions:
  - [ ] `create_session` (`ai`/`shell`) with target-server resolution
  - [ ] `close_panel`
  - [ ] `resize_panel` (`double`/`half`/`fullscreen`/`normal`)
  - [ ] `move_panel`
  - [ ] `swap_panels`
- [ ] Preserve parser priority order so `open codex` resolves to `create_session` (not focus/send fallback)
- [ ] Expose cross-server session creation through app context/view model (`onCreateSession(serverId, kind)`)
- [ ] Glasses route handling for new actions (create/close/resize/move/swap)
- [ ] Spatial panel state additions:
  - [ ] per-panel scale
  - [ ] fullscreen panel mode
  - [ ] per-panel position map with move/swap helpers
- [ ] `SpatialTerminalLayout` fullscreen render path + scale support
- [ ] Tests:
  - [ ] `useSpatialVoiceRouting.test.ts` coverage for all new commands and priority guarantees
  - [ ] Glasses route integration tests for create/close/resize/move/swap flows

## v1.4 VR Command Center

- [x] In this repo: VR preview route/screen + pooled multi-server controls + tests
- [ ] Separate production VR native app (`NovaRemoteVR`) still a broader standalone track

## v1.5 VM Grouping

- [x] VM metadata on server model (`vmHost`, `vmType`, `vmName`, `vmId`)
- [x] Server grouping by VM host/type in server switcher and server management flows
- [x] Fleet target helpers for VM host/type groups

## v1.6 Team MVP (Enterprise Foundation)

- [ ] `useTeamAuth` (team login, identity lifecycle, invite-code flow for `novaremote_cloud`)
- [ ] `useTokenBroker` (ephemeral per-server tokens + auto-refresh + revocation behavior)
- [ ] Team-aware server source model (`local` vs `team`) in `useServers`
- [ ] Team server governance:
  - [ ] non-admin edit/delete restrictions for team-managed servers
  - [ ] permission-level badges/metadata in server UX
- [ ] `useAuditLog` local queue + periodic cloud sync
- [ ] Wire audit events into command, fleet, file, process, and safety confirmation flows
- [ ] Team screen (read-only MVP): members + roles + team context
- [ ] Team/Enterprise packaging in monetization/paywall + seat-based product plumbing
- [ ] Team-enforced safety policy overrides (managed settings cannot be disabled locally)

## v2.0+ NovaAdapt / Team Roadmap

- [~] Early NovaAdapt runtime/panel scaffolding exists
- [x] Voice remove-agent routing in shared parser + glasses + VR runtime callbacks
- [x] Voice set-agent-status routing in shared parser + glasses + VR runtime callbacks
- [x] Manual VR agent status controls (idle/monitoring/executing/waiting_approval) across scoped pooled targets
- [ ] Enterprise IAM expansion:
  - [ ] SSO (`SAML`/`OIDC`) providers
  - [ ] centralized team/user role admin UX
- [ ] Compliance expansion:
  - [ ] mandatory session recording policies
  - [ ] cloud audit export (`CSV`/`JSON`)
- [ ] Fleet governance expansion:
  - [ ] command blocklist + policy enforcement
  - [ ] fleet approval workflows
  - [ ] inactivity timeout / session auto-disconnect policies
- [ ] Separate NovaRemote Cloud backend + web admin dashboard rollout
- [ ] Full agent lifecycle + NovaSpine memory orchestration is still roadmap work
- [ ] Full team collaboration voice/presence channels remains roadmap work

## Notes

- All changes above were validated locally with `npm run ci` and pushed to `main`.
- GitHub Actions CI is currently green on the latest push that updated this status.
