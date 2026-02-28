# NovaRemote (iPhone App)

NovaRemote is a separate mobile app (Expo/React Native) for controlling Codex tmux terminals on your Mac through the existing `codex_remote` API.

This does **not** modify your existing `codex_remote` service behavior.

## Current MVP Features

- Secure token + server URL storage (`expo-secure-store`)
- Session discovery from `/codex/sessions`
- Multi-session open/hide control
- Live terminal polling from `/tmux/tail`
- Start Codex sessions from phone (`/codex/start`)
- Send messages to Codex (`/codex/message`)
- Stop current run with Ctrl-C (`/codex/stop`)
- Open same session on Mac Terminal (`/mac/attach`)

## Run Locally

```bash
cd "/Users/desmondpottle/Documents/New project/NovaRemote"
npm install
npm run start
```

Then open on iPhone via Expo Go (same network / Tailscale reachability to your Mac host).

## Default Host

The app defaults to:

- `http://desmonds-macbook-pro.tail9961a2.ts.net:8787`

Change it in the app if needed.

## Native iOS Wiring (Current State)

Already wired:
- iOS bundle id: `com.desmondpottle.novaremote`
- EAS profiles in `eas.json`:
  - `development-simulator`
  - `preview`
  - `production`
- Native project scaffold generated in `ios/`

Validated on this machine:
- Xcode CLI tools are configured.
- `pod install` runs successfully.
- `xcodebuild` simulator build passes.

For clean native regen and simulator run:

```bash
cd "/Users/desmondpottle/Documents/New project/NovaRemote"
npm run prebuild:ios
npm run ios:sim
```

If you regenerate iOS files later, `npm run fix:ios:path-spaces` reapplies path-with-spaces Xcode script fixes.

## Build Toward App Store

1. Run `npx eas login`.
2. Run `npx eas build:configure`.
3. Build preview: `npm run eas:build:ios:preview`.
4. Build production: `npm run eas:build:ios:prod`.
5. Add legal pages (privacy policy + terms) and final app metadata/screenshots.
