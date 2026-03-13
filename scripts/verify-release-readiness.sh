#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  "PRODUCT_SPEC.md"
  "ARCHITECTURE.md"
  "FILEMAP.md"
  "RELEASE_CRITERIA.md"
  "RUNBOOK.md"
  "DEPLOY.md"
  "ROLLBACK.md"
  "SECURITY_REVIEW.md"
  "PERF_REPORT.md"
  "CHANGELOG.md"
  "FINAL_SUMMARY.json"
  "FINAL_HANDOFF.md"
  "docs/HANDOFF_STATUS.md"
  "docs/ROADMAP.md"
  "docs/NOVAADAPT_SERVER_ROLLOUT.md"
  "docs/contracts/novaremote-client-protocol.v1.json"
  "docs/contracts/novaremote-cloud-openapi.v1.yaml"
)

echo "Checking release artifacts..."
for relative_path in "${required_files[@]}"; do
  full_path="${ROOT_DIR}/${relative_path}"
  if [[ ! -f "${full_path}" ]]; then
    echo "Missing required release artifact: ${relative_path}" >&2
    exit 1
  fi
done

echo "Validating FINAL_SUMMARY.json..."
SUMMARY_PATH="${ROOT_DIR}/FINAL_SUMMARY.json" node <<'NODE'
const fs = require("fs");

const summaryPath = process.env.SUMMARY_PATH;
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

const requiredTopLevel = ["updated", "repo", "branch", "ci", "repo_side_status", "remaining_primary_work", "external_tracks"];
for (const key of requiredTopLevel) {
  if (!(key in summary)) {
    throw new Error(`FINAL_SUMMARY.json missing key: ${key}`);
  }
}

if (!summary.ci || summary.ci.passed !== true) {
  throw new Error("FINAL_SUMMARY.json must report ci.passed === true");
}

if (!Array.isArray(summary.remaining_primary_work) || summary.remaining_primary_work.length === 0) {
  throw new Error("FINAL_SUMMARY.json must include remaining_primary_work entries");
}

if (typeof summary.external_tracks !== "object" || summary.external_tracks === null) {
  throw new Error("FINAL_SUMMARY.json external_tracks must be an object");
}
NODE

echo "Running full repo verification..."
(
  cd "${ROOT_DIR}"
  npm run ci
)

echo "Release readiness verification passed."
