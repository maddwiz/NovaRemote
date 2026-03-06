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
assert_file "${API_DIR}/.env.example"
assert_file "${API_DIR}/Dockerfile"
assert_file "${API_DIR}/render.yaml"
assert_file "${API_DIR}/.github/workflows/ci.yml"
assert_file "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml"
assert_file "${API_DIR}/contracts/NOVAREMOTE_CLOUD_CONTRACT_SOURCE.txt"
assert_file "${DASHBOARD_DIR}/src/App.tsx"
assert_file "${DASHBOARD_DIR}/Dockerfile"
assert_file "${DASHBOARD_DIR}/render.yaml"
assert_file "${DASHBOARD_DIR}/.github/workflows/ci.yml"
assert_file "${DASHBOARD_DIR}/contracts/novaremote-cloud-openapi.v1.yaml"
assert_file "${DASHBOARD_DIR}/contracts/NOVAREMOTE_CLOUD_CONTRACT_SOURCE.txt"

assert_contains "${API_DIR}/src/server.ts" "/v1/team/invites"
assert_contains "${API_DIR}/src/server.ts" "/v1/team/invites/:inviteId"
assert_contains "${API_DIR}/src/server.ts" "/v1/team/servers"
assert_contains "${API_DIR}/src/server.ts" "/v1/team/servers/:serverId"
assert_contains "${API_DIR}/src/server.ts" "/v1/team/sso/providers"
assert_contains "${API_DIR}/src/server.ts" "/v1/team/sso/providers/:provider"
assert_contains "${API_DIR}/src/server.ts" "NOVA_CLOUD_STATE_FILE"
assert_contains "${API_DIR}/src/server.ts" "app.get(\"/v1/audit/events\""
assert_contains "${API_DIR}/src/server.ts" "app.get(\"/v1/audit/exports\""
assert_contains "${API_DIR}/src/server.ts" "/v1/audit/exports/:exportId"
assert_contains "${API_DIR}/src/server.ts" "/v1/audit/exports"
assert_contains "${API_DIR}/src/server.ts" "/v1/auth/refresh"
assert_contains "${API_DIR}/src/server.ts" "/v1/auth/logout"
assert_contains "${API_DIR}/src/server.ts" "function requireTeamPermission"
assert_contains "${API_DIR}/.env.example" "NOVA_CLOUD_STATE_FILE"

assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/team/invites/{inviteId}"
assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/team/servers/{serverId}"
assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/team/sso/providers/{provider}"
assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/audit/events"
assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/audit/exports/{exportId}"
assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/audit/exports"
assert_contains "${API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml" "/v1/auth/logout"

assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/team/sso/providers"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/team/fleet/approvals/\${approvalId}/\${action}"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/team/invites"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/team/servers"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/team/servers/\${serverId}"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "Save Server"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/team/members/\${memberId}"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/team/members/\${memberId}/servers"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/team/settings"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/auth/login"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/auth/sso/exchange"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/auth/refresh"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/auth/logout"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/audit/events?limit=200"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/audit/exports?limit=20"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "/v1/audit/exports/\${exportId}"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "Delete Export"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "Password Sign-In"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "Refresh Session"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "Permissions:"
assert_contains "${DASHBOARD_DIR}/src/App.tsx" "Request JSON Export"
assert_contains "${API_DIR}/render.yaml" "healthCheckPath: /healthz"
assert_contains "${DASHBOARD_DIR}/render.yaml" "staticPublishPath: dist"

echo "Cloud bootstrap verification passed."
