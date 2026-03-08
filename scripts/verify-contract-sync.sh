#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

TMP_ROOT="$(mktemp -d)"
VR_DIR="${TMP_ROOT}/NovaRemoteVR"
CLOUD_API_DIR="${TMP_ROOT}/NovaRemoteCloud"
CLOUD_DASHBOARD_DIR="${TMP_ROOT}/NovaRemoteCloudDashboard"

cleanup() {
  rm -rf "${TMP_ROOT}"
}
trap cleanup EXIT

assert_file() {
  local file_path="$1"
  if [[ ! -f "${file_path}" ]]; then
    echo "Missing required file: ${file_path}"
    exit 1
  fi
}

echo "Bootstrapping contract targets in ${TMP_ROOT}"
bash "${ROOT_DIR}/scripts/bootstrap-vr-repo.sh" "${VR_DIR}" >/dev/null
bash "${ROOT_DIR}/scripts/bootstrap-cloud-stack.sh" --api "${CLOUD_API_DIR}" --dashboard "${CLOUD_DASHBOARD_DIR}" >/dev/null

echo "Syncing contracts into temporary targets"
bash "${ROOT_DIR}/scripts/sync-vr-contracts.sh" "${VR_DIR}" >/dev/null
bash "${ROOT_DIR}/scripts/sync-cloud-contracts.sh" "${CLOUD_API_DIR}" "${CLOUD_DASHBOARD_DIR}" >/dev/null

assert_file "${ROOT_DIR}/docs/contracts/novaremote-client-protocol.v1.json"
assert_file "${ROOT_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md"
assert_file "${ROOT_DIR}/docs/contracts/novaremote-cloud-openapi.v1.yaml"
assert_file "${VR_DIR}/contracts/novaremote-client-protocol.v1.json"
assert_file "${VR_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md"
assert_file "${CLOUD_API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml"
assert_file "${CLOUD_DASHBOARD_DIR}/contracts/novaremote-cloud-openapi.v1.yaml"

if ! cmp -s "${ROOT_DIR}/docs/contracts/novaremote-client-protocol.v1.json" "${VR_DIR}/contracts/novaremote-client-protocol.v1.json"; then
  echo "VR schema contract drift detected."
  exit 1
fi

if ! cmp -s "${ROOT_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md" "${VR_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md"; then
  echo "VR protocol document drift detected."
  exit 1
fi

if ! cmp -s "${ROOT_DIR}/docs/contracts/novaremote-cloud-openapi.v1.yaml" "${CLOUD_API_DIR}/contracts/novaremote-cloud-openapi.v1.yaml"; then
  echo "Cloud API OpenAPI contract drift detected."
  exit 1
fi

if ! cmp -s "${ROOT_DIR}/docs/contracts/novaremote-cloud-openapi.v1.yaml" "${CLOUD_DASHBOARD_DIR}/contracts/novaremote-cloud-openapi.v1.yaml"; then
  echo "Cloud dashboard OpenAPI contract drift detected."
  exit 1
fi

bash "${VR_DIR}/scripts/verify-contract-sync.sh" >/dev/null

echo "Contract sync verification passed."

