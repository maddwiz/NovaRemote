#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SOURCE_OPENAPI="${ROOT_DIR}/docs/contracts/novaremote-cloud-openapi.v1.yaml"

API_REPO="${1:-${NOVAREMOTE_CLOUD_REPO:-${ROOT_DIR}/../NovaRemoteCloud}}"
DASHBOARD_REPO="${2:-${NOVAREMOTE_CLOUD_DASHBOARD_REPO:-${ROOT_DIR}/../NovaRemoteCloudDashboard}}"

if [[ ! -f "${SOURCE_OPENAPI}" ]]; then
  echo "Missing source cloud contract at ${SOURCE_OPENAPI}"
  exit 1
fi

SOURCE_COMMIT_SHORT="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
SOURCE_COMMIT_FULL="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)"
SYNCED_AT_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

sync_repo() {
  local repo_dir="$1"
  local repo_label="$2"
  if [[ ! -d "${repo_dir}" ]]; then
    echo "Skipping ${repo_label}; directory not found: ${repo_dir}"
    return 0
  fi
  mkdir -p "${repo_dir}/contracts"
  cp "${SOURCE_OPENAPI}" "${repo_dir}/contracts/novaremote-cloud-openapi.v1.yaml"
  cat > "${repo_dir}/contracts/NOVAREMOTE_CLOUD_CONTRACT_SOURCE.txt" <<META
source_repo=${ROOT_DIR}
source_commit_short=${SOURCE_COMMIT_SHORT}
source_commit_full=${SOURCE_COMMIT_FULL}
synced_at_utc=${SYNCED_AT_UTC}
source_contract=docs/contracts/novaremote-cloud-openapi.v1.yaml
META
  echo "Synced cloud contract to ${repo_label}: ${repo_dir}/contracts/novaremote-cloud-openapi.v1.yaml"
}

sync_repo "${API_REPO}" "cloud-api"
sync_repo "${DASHBOARD_REPO}" "cloud-dashboard"
