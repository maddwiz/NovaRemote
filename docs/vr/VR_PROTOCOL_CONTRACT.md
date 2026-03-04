# NovaRemote VR Protocol Contract (v1)

This document defines the shared client/server contract for `NovaRemote` (phone) and `NovaRemoteVR` (Quest/Vision).

Status: Draft for implementation
Version: `1.0.0`
Compatibility target: existing companion server API (no breaking server changes required)

## 1. Design Goals

- Keep the companion server API stable for phone + VR clients.
- Allow concurrent clients for the same server/session set.
- Support low-latency terminal streaming in 3D panels.
- Keep auth and capability negotiation identical across clients.

## 2. Transport and Auth

### 2.1 HTTP

- Base URL: `https://<host>:<port>`
- Auth: `Authorization: Bearer <token>`
- Content-Type: `application/json`

### 2.2 WebSocket Stream

- Endpoint:
  - `wss://<host>/tmux/stream?session=<name>`
  - or `wss://<host>/terminal/stream?session=<name>`
- Initial client auth frame:

```json
{ "type": "auth", "token": "<token>" }
```

- Stream message types:
  - `snapshot`
  - `delta`
  - `session_closed`
  - `error`

## 3. Capability Discovery

Clients must discover capabilities on connect and cache per `baseUrl + token` fingerprint.

Preferred order:
1. `GET /capabilities`
2. `GET /health`
3. probe fallback endpoints

Minimum capabilities required for VR:
- `terminal` (true)
- `stream` (true preferred; fallback poll allowed)

Optional VR capabilities:
- `codex`
- `files`
- `collaboration`
- `spectate`

## 4. Required Endpoint Contract

### 4.1 Session Inventory

- `GET /tmux/sessions` or `GET /terminal/sessions`
- Response:

```json
{
  "sessions": [
    { "name": "main", "created_at": "2026-03-04T01:23:45Z" }
  ]
}
```

### 4.2 Session Create

- `POST /tmux/session` or `POST /terminal/session`
- Request:

```json
{ "session": "term-202603040123", "cwd": "/workspace" }
```

### 4.3 Send

- `POST /tmux/send` or `POST /terminal/send`
- Request:

```json
{ "session": "main", "text": "npm run build", "enter": true }
```

### 4.4 Control

- `POST /tmux/ctrl` or `POST /terminal/ctrl`
- Request:

```json
{ "session": "main", "key": "C-c" }
```

### 4.5 Tail (poll fallback)

- `GET /tmux/tail?session=<name>&lines=<n>` or terminal equivalent
- Response:

```json
{ "session": "main", "output": "..." }
```

## 5. Stream Message Contract

Each message must include `session`.

```json
{
  "type": "snapshot",
  "session": "main",
  "data": "full output"
}
```

```json
{
  "type": "delta",
  "session": "main",
  "data": "new chunk"
}
```

```json
{
  "type": "session_closed",
  "session": "main",
  "data": ""
}
```

```json
{
  "type": "error",
  "session": "main",
  "data": "error text"
}
```

## 6. Concurrency Rules

- Multiple clients may attach to the same server and session simultaneously.
- Stream drops on one client must not terminate server-side session state.
- Reconnect backoff is client-side and independent per stream.
- Server should remain stateless regarding client identity for terminal streams.

## 7. Error Contract

HTTP errors should return JSON when possible:

```json
{ "detail": "message", "code": "OPTIONAL_MACHINE_CODE" }
```

Status guidance:
- `401/403`: auth failure
- `404`: endpoint unavailable or session missing
- `429`: rate-limited
- `5xx`: transient server failures

## 8. Version Negotiation

Recommended optional header:

- Request: `X-Nova-Client-Protocol: 1.0.0`
- Response: `X-Nova-Server-Protocol: 1.x`

Current behavior if missing headers:
- Assume protocol v1 baseline and use capability probing.

## 9. VR Client Behavioral Requirements

- Keep one websocket per open panel/session.
- Cap reconnect delay (`<= 30s`) with exponential backoff.
- Bound tail buffer size per panel (line/byte cap).
- Route command sends by `serverId + session` (never by session alone).
- Do not force focus switch for cross-server send execution.
- Support layout snap interactions from input and voice:
  - Gesture: `snap_layout` with presets `arc|grid|stacked|cockpit`.
  - Voice: `layout <preset>` and `snap <preset>`.
- Support panel visual voice controls scoped to focused or explicitly targeted panel:
  - `mini panel`, `expand panel`, `opacity 45%`
  - `mini for <target>`, `expand <target>`, `set <target> opacity to 45%`
  - Target resolution should match server/session aliases (for example `homelab`, `build worker`).

## 10. Security Requirements

- Token never logged in plaintext.
- Token stored in secure enclave/keystore.
- TLS required in production.
- Optional cert pinning for enterprise deployments.

## 11. Backward Compatibility

- This contract is additive to current phone client behavior.
- Existing companion servers remain compatible if they already support tmux/terminal endpoints.
- VR-specific features should degrade gracefully to poll mode when `stream=false`.

## 12. Compliance Test Matrix

For each target server profile:

- Capability probe resolves terminal API base path.
- Session create/send/control/tail pass.
- Stream snapshot + delta parse pass.
- Stream reconnect pass.
- Concurrent phone + VR streams pass.

## 13. Workspace Snapshot Contract

VR clients may persist panel workspace state per server scope.

Snapshot shape:

```json
{
  "version": "1.0.0",
  "preset": "custom",
  "overviewMode": false,
  "focusedPanelId": "home::build-01",
  "panelIds": ["home::build-01", "dgx::main"],
  "pinnedPanelIds": ["home::build-01"],
  "panelVisuals": {
    "home::build-01": { "mini": true, "opacity": 0.55 }
  },
  "customTransforms": {
    "home::build-01": { "x": 0.4, "y": 1.82, "z": -1.5, "yaw": 18, "width": 1.3, "height": 0.75 }
  }
}
```

Rules:

- `preset` supports: `arc`, `grid`, `stacked`, `cockpit`, `custom`.
- `focusedPanelId` may be `null` if there are no panels.
- `panelIds` order is the rendered panel order.
- `pinnedPanelIds` must be a subset of `panelIds`.
- `overviewMode` toggles expanded overview (`true`) versus focus mode (`false`).
- `panelVisuals` keys must be panel IDs in `panelIds`.
  - `mini` is the mini-panel toggle.
  - `opacity` is clamped between `0.2` and `1.0`.
- `customTransforms` keys must be panel IDs in `panelIds`.
- Each transform requires `x`, `y`, `z`, `yaw`; optional fields are `pitch`, `roll`, `width`, `height`, `index`.
