# NovaRemote

NovaRemote is an Expo + React Native app for controlling remote tmux/Codex sessions through a companion server.

## Current Features

- Multi-server profile management with secure storage (`expo-secure-store`)
- Session discovery (`GET /tmux/sessions`)
- Live terminal streaming (`WS /tmux/stream`) with polling fallback (`GET /tmux/tail`)
- AI mode (`POST /codex/start`, `POST /codex/message`)
- Shell mode (`POST /tmux/session`, `POST /shell/run`, `POST /tmux/send`)
- Session controls (`POST /tmux/ctrl`, `POST /mac/attach`)

## Local Run

```bash
cd /path/to/NovaRemote
npm install
npm run start
```

Open in Expo Go on your device and add a server profile in-app:

- Server URL example: `https://your-server:8787`
- Default CWD example: `/path/to/your/project`
- Token: your companion server bearer token

## iOS/Android IDs

- iOS bundle id: `com.novaai.novaremote`
- Android package: `com.novaai.novaremote`

## Native iOS Build

```bash
cd /path/to/NovaRemote
npm run prebuild:ios
npm run ios:sim
```

## App Store Prep (Checklist)

1. Configure EAS credentials and build profiles.
2. Finalize privacy policy + terms URLs.
3. Build preview/prod artifacts with EAS.
4. Capture store screenshots and finalize metadata.
