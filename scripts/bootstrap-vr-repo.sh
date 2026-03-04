#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_REPO="${1:-${NOVAREMOTE_VR_REPO:-${ROOT_DIR}/../NovaRemoteVR}}"

mkdir -p "${TARGET_REPO}"
TARGET_REPO="$(cd "${TARGET_REPO}" && pwd)"

mkdir -p \
  "${TARGET_REPO}/docs/vr" \
  "${TARGET_REPO}/contracts" \
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

"${ROOT_DIR}/scripts/sync-vr-contracts.sh" "${TARGET_REPO}"

echo "Bootstrapped NovaRemoteVR repository scaffold at: ${TARGET_REPO}"
echo "Next steps:"
echo "1. Create initial Quest and Vision Pro app skeletons inside clients/."
echo "2. Commit scaffold + synced contracts in the NovaRemoteVR repo."

