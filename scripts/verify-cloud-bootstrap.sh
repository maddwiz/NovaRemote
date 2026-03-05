#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TMP_ROOT="$(mktemp -d)"
API_DIR="${TMP_ROOT}/NovaRemoteCloud"
DASHBOARD_DIR="${TMP_ROOT}/NovaRemoteCloudDashboard"

cleanup() {
  rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT

echo "Bootstrapping cloud repos into temp dir: ${TMP_ROOT}"
bash "${ROOT_DIR}/scripts/bootstrap-cloud-stack.sh" --api "${API_DIR}" --dashboard "${DASHBOARD_DIR}" >/dev/null

assert_file() {
  local file_path="$1"
  if [[ ! -f "${file_path}" ]]; then
    echo "Expected file missing: ${file_path}"
    exit 1
  fi
}

assert_contains() {
  local file_path="$1"
  local pattern="$2"
  if ! rg -F -q -- "${pattern}" "${file_path}"; then
    echo "Expected pattern '${pattern}' not found in ${file_path}"
    exit 1
  fi
}

assert_file "${API_DIR}/src/server.ts"
assert_file "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml"
assert_file "${API_DIR}/contracts/NOVAREMOTE_CLOUD_CONTRACT_SOURCE.txt"
assert_file "${DASHBOARD_DIR}/src/App.tsx"
assert_file "${DASHBOARD_DIR}/contracts/novaremote-cloud-openapi.v1.yaml"
assert_file "${DASHBOARD_DIR}/contracts/NOVAREMOTE_CLOUD_CONTRACT_SOURCE.txt"

assert_contains "${API_DIR}/src/server.ts" "/v1/team/invites"
assert_contains "${API_DIR}/src/server.ts" "/v1/team/invites/:inviteId"
assert_contains "${API_DIR}/src/server.ts" "/v1/audit/exports"

assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/team/invites/{inviteId}"
assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/audit/exports"

echo "Cloud bootstrap verification passed."
