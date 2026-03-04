# NovaRemoteVR Bootstrap Plan

This document defines the initial repository structure and integration contracts for the standalone VR app.

Target repos:
- Existing: `NovaRemote` (phone)
- New: `NovaRemoteVR` (Quest first, Vision Pro second)

## 1. Repository Shape

Recommended top-level folders:

- `docs/` architecture, protocol notes, release checks
- `contracts/` copied protocol schemas from NovaRemote (`docs/contracts`)
- `clients/quest-unity/` Unity + OpenXR app
- `clients/visionos/` SwiftUI + RealityKit app
- `shared/` generated OpenAPI types / message models (language-specific)

Quick scaffold command from `NovaRemote`:

```bash
npm run vr:bootstrap-repo -- /absolute/path/to/NovaRemoteVR
```

This creates the baseline directory structure, starter docs, and then syncs protocol contracts.

## 2. Shared Contract Source of Truth

Source files in `NovaRemote`:
- `docs/vr/VR_PROTOCOL_CONTRACT.md`
- `docs/contracts/novaremote-client-protocol.v1.json`

`NovaRemoteVR` should sync these files and pin to a commit SHA from `NovaRemote`.

Recommended sync command from `NovaRemote`:

```bash
npm run vr:sync-contracts -- /absolute/path/to/NovaRemoteVR
```

This command copies both source files and writes a provenance stamp at:

- `contracts/NOVAREMOTE_CONTRACT_SOURCE.txt`

## 3. Runtime Components

- SessionService:
  - capability probe
  - session list/create/send/control/tail
- StreamService:
  - ws auth
  - snapshot/delta handling
  - reconnect strategy
- SpatialLayoutService:
  - layout presets (arc, grid, cockpit)
  - panel persistence
- VoiceRouterService:
  - server/session targeting
  - explicit route commands

## 4. Input Contract (VR)

Logical actions expected by terminal runtime:
- `focus_panel(panelId)`
- `send_text(serverId, session, text, mode)`
- `send_ctrl(serverId, session, key)`
- `toggle_read_only(panelId, enabled)`
- `move_panel(panelId, transform)`
- `resize_panel(panelId, size)`

No server changes are required for these actions; mapping is client-only.

## 5. Compatibility and Rollout

Phase order:
1. Quest MVP: panel streams + send/control + basic voice route
2. Quest layout presets + persistence
3. Vision Pro parity
4. optional collaboration overlays

Release gate checks before public beta:
- protocol compliance test matrix green
- concurrent phone + VR session usage validated
- reconnect stress test (network flap) validated
- token handling and secure storage review complete

## 6. Definition of Done (VR Track Prep)

- Protocol contract published and versioned.
- JSON schema checked in for client generation.
- Bootstrap structure agreed and documented.
- A sync workflow from `NovaRemote` contract files to `NovaRemoteVR` defined.
