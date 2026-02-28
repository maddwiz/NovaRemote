# NovaRemote Companion Server Setup

NovaRemote is a client. It requires a companion API server that manages tmux sessions and Codex/shell execution.

## Requirements

- `tmux` installed on the host running the companion server
- A bearer token configured on the server
- Network path from your phone/device to the server (`https://...` preferred; `http://...` for trusted LAN/Tailscale)

Optional for AI mode:

- Codex CLI (or equivalent backend command) installed on the server host

## Auth Model

NovaRemote uses bearer token auth for HTTP requests:

- `Authorization: Bearer <TOKEN>`

For WebSocket streaming (`/tmux/stream`), NovaRemote now does both:

1. Sends `Authorization: Bearer <TOKEN>` during WS handshake (header)
2. Sends a first message after connect:

```json
{ "type": "auth", "token": "<TOKEN>" }
```

Compatibility note:

- Legacy servers that only accept `token` as a URL query parameter for WS auth may reject live streams.
- HTTP endpoints (including polling fallback with `/tmux/tail`) continue to work.

## Required Endpoints

### `GET /tmux/sessions`

Purpose: list tmux sessions.

Response:

```json
{
  "sessions": [
    {
      "name": "codex-20260228-abc123",
      "created_at": "2026-02-28T03:01:20Z",
      "attached": true,
      "windows": 1
    }
  ]
}
```

### `GET /tmux/tail?session=<name>&lines=<n>`

Purpose: fetch recent output for a session.

Response:

```json
{
  "session": "codex-20260228-abc123",
  "output": "...terminal text..."
}
```

### `WS /tmux/stream?session=<name>`

Purpose: live stream session output.

Server messages:

```json
{ "type": "snapshot", "session": "...", "data": "full buffer" }
```

```json
{ "type": "delta", "session": "...", "data": "incremental text" }
```

```json
{ "type": "session_closed", "session": "...", "data": "" }
```

```json
{ "type": "error", "session": "...", "data": "error detail" }
```

### `POST /tmux/session`

Purpose: create a shell session.

Request:

```json
{ "session": "term-20260228-abcd", "cwd": "/path/to/project" }
```

Response:

```json
{ "ok": true, "session": "term-20260228-abcd" }
```

### `POST /tmux/send`

Purpose: send text/keystrokes to a session.

Request:

```json
{ "session": "term-20260228-abcd", "text": "npm test", "enter": true }
```

Response:

```json
{ "ok": true, "session": "term-20260228-abcd" }
```

### `POST /tmux/ctrl`

Purpose: send control keys (`Ctrl-C`, etc.).

Request:

```json
{ "session": "term-20260228-abcd", "key": "C-c" }
```

Response:

```json
{ "ok": true, "session": "term-20260228-abcd", "key": "C-c" }
```

### `POST /codex/start`

Purpose: start AI/Codex interactive session.

Request:

```json
{
  "cwd": "/path/to/project",
  "initial_prompt": "optional prompt",
  "open_on_mac": true
}
```

Response:

```json
{
  "ok": true,
  "session": "codexchat-20260228-abc123",
  "tail": "...",
  "open_on_mac": {
    "requested": true,
    "opened": true,
    "error": null
  }
}
```

### `POST /codex/message`

Purpose: send a follow-up message to AI session.

Request:

```json
{ "session": "codexchat-20260228-abc123", "message": "Fix test failures" }
```

Response:

```json
{ "ok": true, "session": "codexchat-20260228-abc123", "tail": "..." }
```

### `POST /shell/run`

Purpose: run one shell command in a session and return output tail.

Request:

```json
{
  "session": "term-20260228-abcd",
  "command": "git status",
  "wait_ms": 400,
  "tail_lines": 380
}
```

Response:

```json
{ "ok": true, "session": "term-20260228-abcd", "output": "..." }
```

### `POST /mac/attach`

Purpose: open the session in macOS Terminal.app on the host machine.

Request:

```json
{ "session": "codexchat-20260228-abc123" }
```

Response:

```json
{ "ok": true, "session": "codexchat-20260228-abc123" }
```

## Optional Endpoints (Files Tab)

These power NovaRemote's remote file explorer.

### `GET /files/list?path=<dir>&hidden=<bool>`

Purpose: list directory entries.

Response:

```json
{
  "path": "/path/to/project",
  "entries": [
    {
      "name": "src",
      "path": "/path/to/project/src",
      "is_dir": true,
      "size": 4096,
      "mtime": 1700000000.0
    }
  ]
}
```

### `GET /files/read?path=<file>`

Purpose: read text file content (server may cap bytes).

Response:

```json
{
  "path": "/path/to/project/README.md",
  "content": "...file text..."
}
```

### `GET /files/tail?path=<file>&lines=<n>`

Purpose: fetch last N lines from text file.

Response:

```json
{
  "path": "/path/to/project/logs/app.log",
  "lines": 200,
  "content": "...tail lines..."
}
```

## Quick Start (Codex Remote Reference Server)

If you are using the included `codex_remote` server from the parent workspace:

```bash
cd ../codex_remote
./install_mac.sh
```

Then set your NovaRemote server profile to:

- URL: `https://your-server:8787` (or `http://<tailscale-or-lan-host>:8787`)
- Token: the generated server token
- Default CWD: your preferred project path on the server host

## Network Guidance

- Best: private network (Tailscale, VPN, trusted LAN)
- If exposed publicly, place TLS + auth controls in front of the service
- Never embed bearer tokens in share links or screenshots
