# Monetization + Scale Plan

This document captures the monetization primitives now shipped in-app and the next steps for scaling.

## Shipped in this pass

- Anonymous analytics toggle and event tracking scaffold
- Referral program scaffold (share + claim code)
- Pro team feature scaffold: shared server profile templates (export/import/apply)
- Store launch scripts for both iOS and Android (`eas` build/submit commands)

## 1) Anonymous analytics

Client behavior:

- Generates a random anonymous ID and stores it in SecureStore
- No raw tokens, prompts, or full command output are sent
- Events are best-effort POSTed to `POST /analytics/event` when enabled
- Toggle is user-controlled in the `Servers` > `Growth / Monetization` panel

Recommended server contract:

```http
POST /analytics/event
Authorization: Bearer <TOKEN>
Content-Type: application/json
```

Body example:

```json
{
  "event": "session_started",
  "at": "2026-03-01T21:10:00.000Z",
  "anon_id": "anon-abc123",
  "platform": "ios",
  "props": {
    "kind": "ai",
    "engine": "external"
  }
}
```

## 2) Referral program

Client behavior:

- Generates per-device referral code
- Shares links via `novaremote://referral?code=...`
- Supports code claim in-app (one claimed code per install)

Recommended backend evolution:

- Add `POST /referrals/claim` for server-validated claims
- Add `GET /referrals/status` for rewards state
- Issue entitlement credits via RevenueCat webhooks or backend reconciliation

## 3) Pro team features (shared profiles)

Client behavior:

- Exports server templates (without tokens) as JSON payload
- Imports shared template payloads
- Applies templates into the server form for quick setup

Template payload intentionally excludes secrets:

- includes: name/baseUrl/defaultCwd/backend/ssh host+user+port
- excludes: bearer token

Recommended backend/cloud evolution:

- Add signed team workspaces and role-based template sharing
- Add managed sync endpoint for multi-device team template replication

## 4) Store launch automation

Use scripts from `package.json`:

- iOS build: `npm run eas:build:ios:prod`
- Android build: `npm run eas:build:android:prod`
- iOS submit: `npm run eas:submit:ios`
- Android submit: `npm run eas:submit:android`

For human checklists see:

- `docs/APP_STORE_PREP.md`
- `docs/PLAY_STORE_PREP.md`
