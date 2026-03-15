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
  "${TARGET_REPO}/docs/qa" \
  "${TARGET_REPO}/docs/release" \
  "${TARGET_REPO}/docs/ops" \
  "${TARGET_REPO}/contracts" \
  "${TARGET_REPO}/.github/workflows" \
  "${TARGET_REPO}/api" \
  "${TARGET_REPO}/auth" \
  "${TARGET_REPO}/terminals" \
  "${TARGET_REPO}/layout" \
  "${TARGET_REPO}/voice" \
  "${TARGET_REPO}/input" \
  "${TARGET_REPO}/hud" \
  "${TARGET_REPO}/clients/quest-unity" \
  "${TARGET_REPO}/clients/quest-unity/Assets/NovaRemoteVR" \
  "${TARGET_REPO}/clients/quest-unity/Packages" \
  "${TARGET_REPO}/clients/quest-unity/ProjectSettings" \
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
- `docs/qa/` manual Quest validation and beta checks
- `docs/release/` release and launch-readiness checklists
- `docs/ops/` operator/tester setup and rollback notes

## Contract Sync

From the NovaRemote repo, run:

```bash
npm run vr:sync-contracts -- /absolute/path/to/NovaRemoteVR
```

## Bootstrap Validation

Inside `NovaRemoteVR`, run:

```bash
npm run ci
```

This is also wired into `.github/workflows/contracts-sync.yml`.
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

if [[ ! -f "${TARGET_REPO}/package.json" ]]; then
  cat > "${TARGET_REPO}/package.json" <<'DOC'
{
  "name": "novaremote-vr",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "contracts:verify-sync": "bash ./scripts/verify-contract-sync.sh",
    "quest:verify": "node ./scripts/verify-quest-scaffold.mjs",
    "ci": "npm run contracts:verify-sync && npm run quest:verify"
  }
}
DOC
fi

if [[ ! -f "${TARGET_REPO}/docs/vr/README.md" ]]; then
  cat > "${TARGET_REPO}/docs/vr/README.md" <<'DOC'
# VR Docs

This directory receives protocol contracts from NovaRemote and stores VR-specific architecture notes.
DOC
fi

if [[ ! -f "${TARGET_REPO}/docs/qa/QUEST_QA_CHECKLIST.md" ]]; then
  cat > "${TARGET_REPO}/docs/qa/QUEST_QA_CHECKLIST.md" <<'DOC'
# Quest QA Checklist

Use this checklist before inviting external Quest testers:

- sign-in / token bootstrap succeeds on a clean install
- capability discovery resolves `terminal` and `stream`
- create, focus, move, resize, and close terminal panels work
- text send and control-key routing reach the correct `serverId + session`
- websocket reconnect recovers after a network flap
- phone + Quest concurrent usage is safe against the same session set
- voice route commands cover focus, send, layout, and panel control basics
- comfort/accessibility defaults are reviewed for seated and standing use
- critical error paths surface actionable recovery copy
DOC
fi

if [[ ! -f "${TARGET_REPO}/docs/release/QUEST_RELEASE_CHECKLIST.md" ]]; then
  cat > "${TARGET_REPO}/docs/release/QUEST_RELEASE_CHECKLIST.md" <<'DOC'
# Quest Release Checklist

- contract sync provenance updated from NovaRemote
- `npm run ci` passes
- Quest client scene/bootstrap is current with OpenXR integration notes
- tester onboarding guide is current
- rollback steps are current
- known issues and launch recommendation are current
- beta build signing / distribution notes reviewed
DOC
fi

if [[ ! -f "${TARGET_REPO}/docs/ops/QUEST_OPERATOR_SETUP.md" ]]; then
  cat > "${TARGET_REPO}/docs/ops/QUEST_OPERATOR_SETUP.md" <<'DOC'
# Quest Operator Setup

Document the minimum operator path here:

1. install the Quest build
2. provide companion server URL + token
3. confirm capability discovery
4. open the default workspace layout
5. run the smoke-test panel and voice flows
DOC
fi

if [[ ! -f "${TARGET_REPO}/docs/ops/ROLLBACK.md" ]]; then
  cat > "${TARGET_REPO}/docs/ops/ROLLBACK.md" <<'DOC'
# Quest Rollback

If a Quest beta build regresses:

1. stop distributing the current build
2. roll back to the last verified beta build
3. re-sync contracts from the last known-good NovaRemote commit if protocol drift is involved
4. record the failing scenario and affected companion capability profile
DOC
fi

if [[ ! -f "${TARGET_REPO}/scripts/verify-contract-sync.sh" ]]; then
  cat > "${TARGET_REPO}/scripts/verify-contract-sync.sh" <<'DOC'
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

CONTRACT_DOC="${ROOT_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md"
CONTRACT_SCHEMA="${ROOT_DIR}/contracts/novaremote-client-protocol.v1.json"
SOURCE_STAMP="${ROOT_DIR}/contracts/NOVAREMOTE_CONTRACT_SOURCE.txt"

assert_file() {
  local file_path="$1"
  if [[ ! -f "${file_path}" ]]; then
    echo "Missing required file: ${file_path}"
    exit 1
  fi
}

assert_contains() {
  local file_path="$1"
  local pattern="$2"
  if command -v rg >/dev/null 2>&1; then
    if rg -F -q -- "${pattern}" "${file_path}"; then
      return 0
    fi
  elif grep -F -q -- "${pattern}" "${file_path}"; then
    return 0
  fi
  if ! grep -F -q -- "${pattern}" "${file_path}"; then
    echo "Expected pattern '${pattern}' not found in ${file_path}"
    exit 1
  fi
}

assert_file "${CONTRACT_DOC}"
assert_file "${CONTRACT_SCHEMA}"
assert_file "${SOURCE_STAMP}"

assert_contains "${SOURCE_STAMP}" "protocol_doc=docs/vr/VR_PROTOCOL_CONTRACT.md"
assert_contains "${SOURCE_STAMP}" "json_schema=docs/contracts/novaremote-client-protocol.v1.json"

if command -v rg >/dev/null 2>&1; then
  if ! rg -q -- '"\$schema"|"title"|"type"' "${CONTRACT_SCHEMA}"; then
    echo "Contract schema file does not look like JSON schema: ${CONTRACT_SCHEMA}"
    exit 1
  fi
elif ! grep -Eq -- '"\$schema"|"title"|"type"' "${CONTRACT_SCHEMA}"; then
  echo "Contract schema file does not look like JSON schema: ${CONTRACT_SCHEMA}"
  exit 1
fi

echo "VR contract sync verification passed."
DOC
  chmod +x "${TARGET_REPO}/scripts/verify-contract-sync.sh"
fi

if [[ ! -f "${TARGET_REPO}/scripts/verify-quest-scaffold.mjs" ]]; then
  cat > "${TARGET_REPO}/scripts/verify-quest-scaffold.mjs" <<'DOC'
#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function assertFile(relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`Missing required file: ${relativePath}`);
  }
}

function assertContains(relativePath, pattern) {
  const fullPath = path.join(rootDir, relativePath);
  const content = fs.readFileSync(fullPath, "utf8");
  if (!content.includes(pattern)) {
    throw new Error(`Expected '${pattern}' in ${relativePath}`);
  }
}

[
  "package.json",
  "docs/qa/QUEST_QA_CHECKLIST.md",
  "docs/release/QUEST_RELEASE_CHECKLIST.md",
  "docs/ops/QUEST_OPERATOR_SETUP.md",
  "docs/ops/ROLLBACK.md",
  "clients/quest-unity/README.md",
  "clients/quest-unity/Assets/NovaRemoteVR/README.md",
].forEach(assertFile);

assertContains("package.json", "\"quest:verify\"");
assertContains("clients/quest-unity/README.md", "Packages/manifest.json");
assertContains("clients/quest-unity/README.md", "Assets/NovaRemoteVR");
assertContains("clients/quest-unity/Assets/NovaRemoteVR/README.md", "Scenes");

console.log("Quest scaffold verification passed.");
DOC
  chmod +x "${TARGET_REPO}/scripts/verify-quest-scaffold.mjs"
fi

if [[ ! -f "${TARGET_REPO}/.github/workflows/contracts-sync.yml" ]]; then
  cat > "${TARGET_REPO}/.github/workflows/contracts-sync.yml" <<'DOC'
name: Contract Sync

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify-contract-sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Verify Quest VR scaffold
        run: npm run ci
DOC
fi

if [[ ! -f "${TARGET_REPO}/clients/quest-unity/README.md" ]]; then
  cat > "${TARGET_REPO}/clients/quest-unity/README.md" <<'DOC'
# Quest Unity Client

Initial scope:
- OpenXR scene bootstrap
- Session stream panel rendering
- Voice route command dispatch

Expected launch-grade skeleton:

- `Packages/manifest.json` for OpenXR and Quest package dependencies
- `Assets/NovaRemoteVR/` for scripts, scenes, prefabs, and config assets
- `ProjectSettings/` for checked-in Unity project configuration

Add the Unity project files in this directory and keep Quest-first scope here.
DOC
fi

if [[ ! -f "${TARGET_REPO}/clients/quest-unity/Assets/NovaRemoteVR/README.md" ]]; then
  cat > "${TARGET_REPO}/clients/quest-unity/Assets/NovaRemoteVR/README.md" <<'DOC'
# NovaRemoteVR Quest Assets

Recommended checked-in structure:

- `Scenes/` entry and test scenes
- `Scripts/` Quest runtime, auth, layout, input, and HUD code
- `Prefabs/` reusable panel, keyboard, and HUD prefabs
- `Resources/` fallback config or generated protocol data
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
echo "1. Build the Quest client first under clients/quest-unity."
echo "2. Run npm run ci inside the NovaRemoteVR repo."
echo "3. Commit scaffold + synced contracts in the NovaRemoteVR repo."
