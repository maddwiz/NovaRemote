#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

SOURCE_PROTOCOL_DOC="${ROOT_DIR}/docs/vr/VR_PROTOCOL_CONTRACT.md"
SOURCE_SCHEMA_JSON="${ROOT_DIR}/docs/contracts/novaremote-client-protocol.v1.json"

TARGET_REPO="${1:-${NOVAREMOTE_VR_REPO:-${ROOT_DIR}/../NovaRemoteVR}}"
TARGET_REPO="$(cd "${TARGET_REPO}" 2>/dev/null && pwd || true)"

if [[ -z "${TARGET_REPO}" || ! -d "${TARGET_REPO}" ]]; then
  echo "Target NovaRemoteVR repo not found."
  echo "Usage: scripts/sync-vr-contracts.sh /absolute/path/to/NovaRemoteVR"
  echo "Or set NOVAREMOTE_VR_REPO=/absolute/path/to/NovaRemoteVR"
  exit 1
fi

if [[ ! -f "${SOURCE_PROTOCOL_DOC}" || ! -f "${SOURCE_SCHEMA_JSON}" ]]; then
  echo "Source contract files are missing from NovaRemote docs/."
  exit 1
fi

TARGET_DOC_DIR="${TARGET_REPO}/docs/vr"
TARGET_CONTRACTS_DIR="${TARGET_REPO}/contracts"

mkdir -p "${TARGET_DOC_DIR}" "${TARGET_CONTRACTS_DIR}"

cp "${SOURCE_PROTOCOL_DOC}" "${TARGET_DOC_DIR}/VR_PROTOCOL_CONTRACT.md"
cp "${SOURCE_SCHEMA_JSON}" "${TARGET_CONTRACTS_DIR}/novaremote-client-protocol.v1.json"

SOURCE_COMMIT_SHA="$(git -C "${ROOT_DIR}" rev-parse --short HEAD 2>/dev/null || echo unknown)"
SOURCE_COMMIT_FULL="$(git -C "${ROOT_DIR}" rev-parse HEAD 2>/dev/null || echo unknown)"
SYNCED_AT_UTC="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

cat > "${TARGET_CONTRACTS_DIR}/NOVAREMOTE_CONTRACT_SOURCE.txt" <<META
source_repo=${ROOT_DIR}
source_commit_short=${SOURCE_COMMIT_SHA}
source_commit_full=${SOURCE_COMMIT_FULL}
synced_at_utc=${SYNCED_AT_UTC}
protocol_doc=docs/vr/VR_PROTOCOL_CONTRACT.md
json_schema=docs/contracts/novaremote-client-protocol.v1.json
META

echo "Synced VR contract files to: ${TARGET_REPO}"
echo "- ${TARGET_DOC_DIR}/VR_PROTOCOL_CONTRACT.md"
echo "- ${TARGET_CONTRACTS_DIR}/novaremote-client-protocol.v1.json"
echo "- ${TARGET_CONTRACTS_DIR}/NOVAREMOTE_CONTRACT_SOURCE.txt"
