# NovaRemote Handoff Status

Updated: 2026-03-04

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

## v1.4 VR Command Center

- [~] In this repo: VR preview route/screen + pooled multi-server controls + tests
- [ ] Separate production VR native app (`NovaRemoteVR`) still a broader standalone track

## v1.5 VM Grouping

- [x] VM metadata on server model (`vmHost`, `vmType`, `vmName`, `vmId`)
- [x] Server grouping by VM host/type in server switcher and server management flows
- [x] Fleet target helpers for VM host/type groups

## v2.0+ NovaAdapt / Team Roadmap

- [~] Early NovaAdapt runtime/panel scaffolding exists
- [ ] Full agent lifecycle + NovaSpine memory orchestration is still roadmap work
- [ ] Full team collaboration voice/presence channels remains roadmap work

## Notes

- All changes above were validated locally with `npm run ci` and pushed to `main`.
- GitHub Actions CI is currently green on the latest push that updated this status.
