#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_REPO="${NOVAREMOTE_VR_REPO:-${ROOT_DIR}/../NovaRemoteVR}"
REMOTE_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --remote)
      if [[ $# -lt 2 ]]; then
        echo "Missing URL after --remote"
        exit 1
      fi
      REMOTE_URL="$2"
      shift 2
      ;;
    *)
      TARGET_REPO="$1"
      shift
      ;;
  esac
done

mkdir -p "${TARGET_REPO}"
TARGET_REPO="$(cd "${TARGET_REPO}" && pwd)"

mkdir -p \
  "${TARGET_REPO}/docs/vr" \
  "${TARGET_REPO}/contracts" \
  "${TARGET_REPO}/api" \
  "${TARGET_REPO}/auth" \
  "${TARGET_REPO}/terminals" \
  "${TARGET_REPO}/layout" \
  "${TARGET_REPO}/voice" \
  "${TARGET_REPO}/input" \
  "${TARGET_REPO}/hud" \
  "${TARGET_REPO}/clients/quest-unity" \
  "${TARGET_REPO}/clients/visionos" \
  "${TARGET_REPO}/shared" \
  "${TARGET_REPO}/scripts"

if [[ ! -d "${TARGET_REPO}/.git" ]]; then
  git -C "${TARGET_REPO}" init >/dev/null 2>&1 || true
fi

if [[ ! -f "${TARGET_REPO}/README.md" ]]; then
  cat > "${TARGET_REPO}/README.md" <<'DOC'
# NovaRemoteVR

Standalone immersive client for NovaRemote protocol contracts.

## Structure

- `docs/` architecture notes and release checks
- `contracts/` synced protocol files from NovaRemote
- `api/` protocol client + transport adapters
- `auth/` token/session auth workflows
- `terminals/` terminal panel rendering and stream projection
- `layout/` workspace presets (`arc`, `grid`, `cockpit`, `custom`)
- `voice/` command routing and intent resolution
- `input/` hand/controller interaction layer
- `hud/` overlays, status, and command surfaces
- `clients/quest-unity/` Quest OpenXR client
- `clients/visionos/` Vision Pro client
- `shared/` generated and shared message models

## Contract Sync

From the NovaRemote repo, run:

```bash
npm run vr:sync-contracts -- /absolute/path/to/NovaRemoteVR
```
DOC
fi

if [[ ! -f "${TARGET_REPO}/.gitignore" ]]; then
  cat > "${TARGET_REPO}/.gitignore" <<'DOC'
# OS
.DS_Store

# Logs
*.log

# Node
node_modules/

# Unity
[Ll]ibrary/
[Tt]emp/
[Oo]bj/
[Bb]uild/
[Bb]uilds/
[Ll]ogs/
[Uu]ser[Ss]ettings/

# Xcode / visionOS
DerivedData/
*.xcworkspace
xcuserdata/
DOC
fi

if [[ ! -f "${TARGET_REPO}/docs/vr/README.md" ]]; then
  cat > "${TARGET_REPO}/docs/vr/README.md" <<'DOC'
# VR Docs

This directory receives protocol contracts from NovaRemote and stores VR-specific architecture notes.
DOC
fi

if [[ ! -f "${TARGET_REPO}/clients/quest-unity/README.md" ]]; then
  cat > "${TARGET_REPO}/clients/quest-unity/README.md" <<'DOC'
# Quest Unity Client

Initial scope:
- OpenXR scene bootstrap
- Session stream panel rendering
- Voice route command dispatch

Add Unity project files in this directory.
DOC
fi

if [[ ! -f "${TARGET_REPO}/clients/visionos/README.md" ]]; then
  cat > "${TARGET_REPO}/clients/visionos/README.md" <<'DOC'
# visionOS Client

Initial scope:
- SwiftUI + RealityKit shell
- Protocol client integration
- Spatial panel focus and command routing

Add Xcode project files in this directory.
DOC
fi

if [[ ! -f "${TARGET_REPO}/shared/README.md" ]]; then
  cat > "${TARGET_REPO}/shared/README.md" <<'DOC'
# Shared Models

Use this directory for generated protocol models and shared message contracts consumed by clients.
DOC
fi

if [[ ! -f "${TARGET_REPO}/api/README.md" ]]; then
  cat > "${TARGET_REPO}/api/README.md" <<'DOC'
# API Module

Shared NovaRemote companion API client logic and transport helpers.
DOC
fi

if [[ ! -f "${TARGET_REPO}/auth/README.md" ]]; then
  cat > "${TARGET_REPO}/auth/README.md" <<'DOC'
# Auth Module

Token lifecycle, secure storage adapters, and session bootstrap.
DOC
fi

if [[ ! -f "${TARGET_REPO}/terminals/README.md" ]]; then
  cat > "${TARGET_REPO}/terminals/README.md" <<'DOC'
# Terminals Module

3D terminal panel models, stream state, and rendering contracts.
DOC
fi

if [[ ! -f "${TARGET_REPO}/layout/README.md" ]]; then
  cat > "${TARGET_REPO}/layout/README.md" <<'DOC'
# Layout Module

Workspace presets and panel transform strategies (`arc`, `grid`, `cockpit`, `custom`).
DOC
fi

if [[ ! -f "${TARGET_REPO}/voice/README.md" ]]; then
  cat > "${TARGET_REPO}/voice/README.md" <<'DOC'
# Voice Module

Voice intent parsing, routing, and command dispatch planning.
DOC
fi

if [[ ! -f "${TARGET_REPO}/input/README.md" ]]; then
  cat > "${TARGET_REPO}/input/README.md" <<'DOC'
# Input Module

Hand tracking, controllers, and gesture interaction abstractions.
DOC
fi

if [[ ! -f "${TARGET_REPO}/hud/README.md" ]]; then
  cat > "${TARGET_REPO}/hud/README.md" <<'DOC'
# HUD Module

Heads-up overlays, notifications, and operator controls.
DOC
fi

"${ROOT_DIR}/scripts/sync-vr-contracts.sh" "${TARGET_REPO}"

if [[ -n "${REMOTE_URL}" ]]; then
  if git -C "${TARGET_REPO}" remote get-url origin >/dev/null 2>&1; then
    git -C "${TARGET_REPO}" remote set-url origin "${REMOTE_URL}"
  else
    git -C "${TARGET_REPO}" remote add origin "${REMOTE_URL}"
  fi
fi

echo "Bootstrapped NovaRemoteVR repository scaffold at: ${TARGET_REPO}"
if [[ -n "${REMOTE_URL}" ]]; then
  echo "Configured origin remote: ${REMOTE_URL}"
fi
echo "Next steps:"
echo "1. Build client projects in clients/quest-unity and clients/visionos."
echo "2. Commit scaffold + synced contracts in the NovaRemoteVR repo."
