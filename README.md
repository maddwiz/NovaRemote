# NovaRemote

NovaRemote is an Expo + React Native app for controlling remote tmux/Codex sessions through a companion server.

## Features

- Multi-server profiles with secure storage
- AI and shell session control
- Live terminal streaming + polling fallback
- ANSI color rendering
- Command history (per server/session, persisted)
- Session tags + tag filtering
- Fullscreen terminal search (highlighted matches)
- Snippets/macros (Pro)
- Remote file explorer (list/read/tail and path-to-terminal actions)
- Capability detection per server (tmux/codex/files/shell/mac-attach)
- Fleet mode (run one shell command across selected servers)
- Biometric app unlock (Face ID / Touch ID)
- Optional dangerous-command confirmation guardrail
- Pull-to-refresh + connection health metrics
- First-run in-app tutorial overlay
- Shareable server config links/QR (token excluded)
- iPad split-view layout (Pro)
- RevenueCat paywall scaffolding (free tier: 1 server, 2 sessions)
- Onboarding wizard with connection test

## Requirements

- Companion API server (see `docs/SERVER_SETUP.md`)
- Expo SDK 55 environment

## Local Run

```bash
cd /path/to/NovaRemote
npm install
npm run start
```

## Optional Environment Variables

RevenueCat is optional in development. To enable purchase flows:

- `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
- `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`

Without these keys, paywall UI still renders but purchasing/restoring is disabled.

## Companion Server Setup

See `docs/SERVER_SETUP.md` for endpoint contracts and auth requirements.

## App Store / Launch Checklist

See `docs/APP_STORE_PREP.md`.
