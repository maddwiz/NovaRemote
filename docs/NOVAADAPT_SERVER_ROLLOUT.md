# NovaRemote Server-Side NovaAdapt Rollout

Updated: 2026-03-11

## Current Progress

### Completed in app

- external LLM replies stream for supported providers
- `useNovaAdaptBridge` thin client targets companion `/agents/*`
- companion-backed health, memory status, plans, jobs, and workflows are visible in-app
- active plans and jobs now stream live into the app over SSE
- NovaAdapt audit events now trigger quiet bridge refreshes for relevant plan/job/memory mutations
- a dedicated `Agents` screen now exists in NovaRemote for the server-backed runtime
- the dedicated `Agents` screen now creates approval plans and persistent workflows directly on the server runtime
- workflow resume actions are now available from the mobile runtime surface
- AppShell assistant/runtime agent actions now route remote-first through the bridge, translating create/update/queue/approve/deny operations into server plans/workflow resume actions
- the old in-app NovaAdapt runtime is now fallback-only on the dedicated `Agents` screen and remains available in `Terminals` during migration

### Completed in companion bridge

- NovaAdapt health passthrough
- allowlisted `/agents/*` JSON proxy routes
- workflow proxy routes
- plan/job SSE proxy routes
- audit-event SSE proxy route
- validated sidecar stack with `codex_remote + NovaAdapt + NovaSpine`
- repo-local sidecar validator in `codex_remote/scripts/validate_nova_sidecars.py` now supports both package checks and live runtime checks (`--live-check`)
- repo-local lifecycle wrappers now exist for sidecar bring-up and teardown: `scripts/start_nova_sidecars.sh` and `scripts/stop_nova_sidecars.sh`
- validated host forwarding for `/agents/workflows/status`, `/agents/workflows/list`, `/agents/workflows/item`, and `/agents/workflows/start`

### Still pending

- move the last remaining non-bridge agent CRUD/update paths from phone runtime to server runtime
- finish release-hardening around the validated sidecar packaging/runbooks for `codex_remote + NovaAdapt + NovaSpine`
- add richer runtime event transport if NovaAdapt grows beyond plan/job SSE
- clean auth/protocol surface and publish the companion server openly

## Goal

Move NovaAdapt from the current in-app orchestration model toward a server-resident runtime without breaking NovaRemote's existing terminal, voice, fleet, and multi-server UX.

## Recommended Architecture

Use a sidecar/service split first, not a hard merge.

```text
NovaRemote mobile app
  -> companion server / transport API
  -> NovaAdapt runtime service
  -> NovaSpine memory service (optional but preferred)
```

### Responsibilities

- NovaRemote app:
  - approvals
  - agent dashboard
  - voice / wearable / AR / VR control
  - live terminal and file views
  - push-driven operator actions
- Companion server:
  - auth
  - terminal transport
  - session/files/process APIs
  - bridge and websocket fanout
  - routing to NovaAdapt runtime
- NovaAdapt runtime:
  - planning
  - job execution
  - undo/rollback
  - persistent agent state
  - long-running autonomous workflows
- NovaSpine:
  - memory ingest
  - recall
  - augment
  - long-horizon context store

## Why Not Do a Hard Merge First

A single-image direct merge raises deployment, rollback, and debugging risk immediately.

Sidecar rollout is safer because it gives:

- separate failure boundaries
- easier upgrades and rollback
- optional NovaSpine enablement
- simpler observability
- cleaner open-source boundary for the companion server

## API Contract to Target

The app should treat NovaAdapt as a server capability exposed through the companion server.

### Minimum runtime endpoints

- `GET /novaadapt/health`
- `GET /novaadapt/agents`
- `POST /novaadapt/agents`
- `PATCH /novaadapt/agents/{id}`
- `POST /novaadapt/agents/{id}/approve`
- `POST /novaadapt/agents/{id}/deny`
- `POST /novaadapt/agents/{id}/pause`
- `POST /novaadapt/agents/{id}/resume`
- `GET /novaadapt/jobs`
- `GET /novaadapt/jobs/{id}`
- `GET /novaadapt/jobs/{id}/stream`
- `GET /novaadapt/plans/{id}/stream`
- `POST /novaadapt/undo`
- `GET /novaadapt/history`

### Memory endpoints

Prefer NovaSpine over local in-app snapshots when server memory is enabled.

- `GET /memory/status`
- `POST /memory/recall`
- `POST /memory/ingest`
- `POST /memory/augment`

NovaAdapt already supports NovaSpine over HTTP through:

- `NOVAADAPT_MEMORY_BACKEND=novaspine-http`
- `NOVAADAPT_SPINE_URL`
- `NOVAADAPT_SPINE_TOKEN`

## Rollout Phases

### Phase A: Preserve Current App UX, Move Execution Outward

- keep current NovaRemote agent UI
- replace in-app agent execution with thin HTTP/WebSocket calls
- keep fallback UI paths until runtime parity is verified

### Phase B: Add Server Push + Live Runtime State

- approval notifications
- job/plan event streams
- shared team visibility
- lock-screen decision flows

### Phase C: Enable NovaSpine Server Memory

- ingest approvals, runs, summaries, and operator feedback
- use `/memory/augment` for plan context
- use `/memory/recall` for agent follow-up chat and incident history

### Phase D: Collapse Packaging Only If It Still Helps

If deployment experience is materially better, publish a bundled image later.
Until then, prefer compose or supervisor-managed services.

## Open-Source Companion Server Recommendation

Yes, open source it.

Do it after these conditions are true:

- auth/token model is documented and stable
- terminal/file/process/codex routes are documented
- NovaAdapt bridge boundary is stable
- secrets and private infra assumptions are removed
- CI covers build, tests, and protocol compatibility

What should remain separate if commercialized:

- hosted team cloud
- billing / entitlement services
- managed push / team admin SaaS

## Success Criteria

- phone can be offline and agents continue to run
- operator approvals still work from NovaRemote
- terminal/fleet/file features do not regress
- NovaSpine memory is optional but first-class
- rollback is one service-level change, not a full mobile rewrite
