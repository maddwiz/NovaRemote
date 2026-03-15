#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TMP_ROOT="$(mktemp -d)"
VR_DIR="${TMP_ROOT}/NovaRemoteVR"

cleanup() {
  rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT

echo "Bootstrapping VR repo into temp dir: ${TMP_ROOT}"
bash "${ROOT_DIR}/scripts/bootstrap-vr-repo.sh" "${VR_DIR}" >/dev/null

assert_file() {
  local file_path="$1"
  if [[ ! -f "${file_path}" ]]; then
    echo "Expected file missing: ${file_path}"
    exit 1
  fi
}

assert_dir() {
  local dir_path="$1"
  if [[ ! -d "${dir_path}" ]]; then
    echo "Expected directory missing: ${dir_path}"
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

assert_dir "${VR_DIR}/contracts"
assert_dir "${VR_DIR}/docs/vr"
assert_dir "${VR_DIR}/docs/qa"
assert_dir "${VR_DIR}/docs/release"
assert_dir "${VR_DIR}/docs/ops"
assert_dir "${VR_DIR}/.github/workflows"
assert_dir "${VR_DIR}/api"
assert_dir "${VR_DIR}/auth"
assert_dir "${VR_DIR}/terminals"
assert_dir "${VR_DIR}/layout"
assert_dir "${VR_DIR}/voice"
assert_dir "${VR_DIR}/input"
assert_dir "${VR_DIR}/hud"
assert_dir "${VR_DIR}/shared"
assert_dir "${VR_DIR}/clients/quest-unity"
assert_dir "${VR_DIR}/clients/quest-unity/Assets/NovaRemoteVR"
assert_dir "${VR_DIR}/clients/quest-unity/Packages"
assert_dir "${VR_DIR}/clients/quest-unity/ProjectSettings"
assert_dir "${VR_DIR}/clients/visionos"
assert_dir "${VR_DIR}/scripts"

assert_file "${VR_DIR}/README.md"
assert_file "${VR_DIR}/.gitignore"
assert_file "${VR_DIR}/package.json"
assert_file "${VR_DIR}/docs/vr/README.md"
assert_file "${VR_DIR}/docs/qa/QUEST_QA_CHECKLIST.md"
assert_file "${VR_DIR}/docs/release/QUEST_RELEASE_CHECKLIST.md"
assert_file "${VR_DIR}/docs/ops/QUEST_OPERATOR_SETUP.md"
assert_file "${VR_DIR}/docs/ops/ROLLBACK.md"
assert_file "${VR_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md"
assert_file "${VR_DIR}/contracts/novaremote-client-protocol.v1.json"
assert_file "${VR_DIR}/contracts/NOVAREMOTE_CONTRACT_SOURCE.txt"
assert_file "${VR_DIR}/scripts/verify-contract-sync.sh"
assert_file "${VR_DIR}/scripts/verify-quest-scaffold.mjs"
assert_file "${VR_DIR}/.github/workflows/contracts-sync.yml"
assert_file "${VR_DIR}/api/README.md"
assert_file "${VR_DIR}/auth/README.md"
assert_file "${VR_DIR}/terminals/README.md"
assert_file "${VR_DIR}/layout/README.md"
assert_file "${VR_DIR}/voice/README.md"
assert_file "${VR_DIR}/input/README.md"
assert_file "${VR_DIR}/hud/README.md"
assert_file "${VR_DIR}/shared/README.md"
assert_file "${VR_DIR}/clients/quest-unity/README.md"
assert_file "${VR_DIR}/clients/quest-unity/Assets/NovaRemoteVR/README.md"
assert_file "${VR_DIR}/clients/visionos/README.md"

assert_contains "${VR_DIR}/README.md" "Standalone immersive client for NovaRemote protocol contracts."
assert_contains "${VR_DIR}/README.md" "clients/quest-unity"
assert_contains "${VR_DIR}/README.md" "clients/visionos"
assert_contains "${VR_DIR}/README.md" "docs/qa/"
assert_contains "${VR_DIR}/README.md" "npm run ci"
assert_contains "${VR_DIR}/.gitignore" "[Ll]ibrary/"
assert_contains "${VR_DIR}/.gitignore" "DerivedData/"
assert_contains "${VR_DIR}/scripts/verify-contract-sync.sh" "VR contract sync verification passed."
assert_contains "${VR_DIR}/scripts/verify-quest-scaffold.mjs" "Quest scaffold verification passed."
assert_contains "${VR_DIR}/package.json" "\"quest:verify\""
assert_contains "${VR_DIR}/package.json" "\"ci\""
assert_contains "${VR_DIR}/.github/workflows/contracts-sync.yml" "verify-contract-sync"
assert_contains "${VR_DIR}/.github/workflows/contracts-sync.yml" "npm run ci"
assert_contains "${VR_DIR}/contracts/NOVAREMOTE_CONTRACT_SOURCE.txt" "protocol_doc=docs/vr/VR_PROTOCOL_CONTRACT.md"
assert_contains "${VR_DIR}/contracts/NOVAREMOTE_CONTRACT_SOURCE.txt" "json_schema=docs/contracts/novaremote-client-protocol.v1.json"
assert_contains "${VR_DIR}/clients/quest-unity/README.md" "Packages/manifest.json"
assert_contains "${VR_DIR}/clients/quest-unity/Assets/NovaRemoteVR/README.md" "Scenes/"

if ! cmp -s "${ROOT_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md" "${VR_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md"; then
  echo "VR protocol contract doc in scaffold does not match source contract."
  exit 1
fi

if ! cmp -s "${ROOT_DIR}/docs/contracts/novaremote-client-protocol.v1.json" "${VR_DIR}/contracts/novaremote-client-protocol.v1.json"; then
  echo "VR protocol schema in scaffold does not match source schema."
  exit 1
fi

bash "${ROOT_DIR}/scripts/sync-vr-contracts.sh" "${VR_DIR}" >/dev/null
bash "${VR_DIR}/scripts/verify-contract-sync.sh" >/dev/null
node "${VR_DIR}/scripts/verify-quest-scaffold.mjs" >/dev/null

echo "VR bootstrap verification passed."
