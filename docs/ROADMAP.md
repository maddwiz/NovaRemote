# NovaRemote Product Roadmap

Updated: 2026-03-11

## Milestones

| Version | Track | Scope | Status |
|---|---|---|---|
| v1.2 | Connection Pool + Server Switcher | Multi-server pooled state, concurrent websockets, instant server switching, switcher rail, unread badges, pooled fleet base-path reuse | Complete |
| v1.3 | Spatial AR (Glasses) | Multi-panel glasses workspace, pooled panel sourcing, expanded brand presets, shared spatial voice routing | Complete |
| v1.3.1 | Voice Session + Panel Management (Glasses/VR) | Hands-free create/close/resize/move/swap panel flows, prompt-aware session creation, pooled server-target fallback, parser priority guarantees | Complete |
| v1.4 | VR Command Center | In-repo VR workspace/runtime preview and pooled controls; separate native VR repo bootstrap + contract sync scaffolding | In progress (native production client pending) |
| v1.5 | VM Grouping + Fleet Scoping | VM metadata model, server grouping by VM host/type, VM-aware fleet target helpers | Complete |
| v1.6 | Team MVP (Enterprise Foundation) | Team auth, token broker, team server governance, audit log + exports, team screen, tier-aware paywall, enforced safety/fleet/session policies | Complete (app-side) |
| v2.0 | Enterprise Readiness | SSO/OIDC/SAML lifecycle, fleet approval governance, compliance export workflows, cloud/dashboard scaffolding and bootstrap verification | In progress (production rollout/hardening pending) |
| v2.0+ | NovaAdapt + NovaSpine | In-app agent runtime integration, context snapshots, approvals, voice controls, autonomous monitoring workflows, plus the new server-backed `/agents/*` bridge with a dedicated Agents tab, live plan/job streaming, audit-event refreshes, remote-first plan/workflow creation, and AppShell remote-first agent action routing | In progress (server-runtime migration underway) |
| v2.1 | Team Collaboration | Presence-aware collaboration and voice channels across team workspaces with dedicated voice backplane transport/reconciliation | Complete (in-app) |

## Notes

- The two added handoffs are now represented as:
  - `v1.3.1`: Voice Session Management for Glasses/VR mode.
  - `v1.6` through `v2.0`: Enterprise Readiness and Team Licenses rollout.
- Server-backed NovaAdapt work is now split into:
  - completed in-app orchestration
  - in-progress companion-server bridge + dedicated `Agents` surface
  - remote-first workflow/plan creation from the new `Agents` tab
  - live audit-event refreshes feeding the bridge runtime surface
  - remote-first AppShell assistant/runtime agent actions with local fallback only when the server bridge is unavailable
  - focused-server monitoring now defers to the server runtime when it is online, leaving the phone runtime as fallback only
  - legacy focused-only agent approval shortcuts have been removed from the terminals context in favor of server-scoped bridge callbacks
  - focused-server agent CRUD/approval execution now also refuses to fall through to the phone runtime while the server bridge reports an online runtime
  - the dedicated `Agents` screen now avoids mounting the phone-side NovaAdapt runtime unless the bridge/runtime is unavailable
  - remaining sidecar packaging / NovaSpine rollout / protocol cleanup
- Implementation detail and per-item completion are tracked in [docs/HANDOFF_STATUS.md](./HANDOFF_STATUS.md).
