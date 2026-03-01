#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_SOURCE_DIR="$(cd "${SCRIPT_DIR}/../../codex_remote" 2>/dev/null && pwd || true)"
TARGET_DIR="${1:-${HOME}/codex_remote}"
CONFIG_DIR="${HOME}/.codexremote"
CONFIG_FILE="${CONFIG_DIR}/config.env"
START_SCRIPT="${CONFIG_DIR}/start_codexremote.sh"
SERVICE_DIR="${HOME}/.config/systemd/user"
SERVICE_FILE="${SERVICE_DIR}/codexremote.service"

ensure_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

ensure_python_version() {
  python3 - <<'PY'
import sys

if sys.version_info < (3, 6):
    raise SystemExit("python3 >= 3.6 is required for secrets-based token generation.")
PY
}

copy_local_source() {
  mkdir -p "${TARGET_DIR}"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude ".git/" \
      --exclude ".venv/" \
      --exclude "__pycache__/" \
      "${LOCAL_SOURCE_DIR}/" "${TARGET_DIR}/"
  else
    rm -rf "${TARGET_DIR}"
    mkdir -p "${TARGET_DIR}"
    cp -R "${LOCAL_SOURCE_DIR}/." "${TARGET_DIR}/"
    rm -rf "${TARGET_DIR}/.git" "${TARGET_DIR}/.venv"
  fi
}

clone_or_update_remote() {
  ensure_command git
  if [[ ! -d "${TARGET_DIR}/.git" ]]; then
    git clone https://github.com/maddwiz/codex_remote.git "${TARGET_DIR}"
  else
    git -C "${TARGET_DIR}" pull --ff-only
  fi
}

ensure_command python3
ensure_python_version

if [[ -d "${LOCAL_SOURCE_DIR}/app" ]]; then
  echo "Using local codex_remote source: ${LOCAL_SOURCE_DIR}"
  copy_local_source
else
  echo "Local codex_remote source not found; cloning from GitHub."
  clone_or_update_remote
fi

if [[ ! -f "${TARGET_DIR}/requirements.txt" || ! -d "${TARGET_DIR}/app" ]]; then
  echo "Target directory does not look like codex_remote: ${TARGET_DIR}" >&2
  exit 1
fi

cd "${TARGET_DIR}"

python3 -m venv .venv
# shellcheck disable=SC1091
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt

mkdir -p "${CONFIG_DIR}"

if [[ -f "${CONFIG_FILE}" ]] && grep -q '^export CODEXREMOTE_TOKEN=' "${CONFIG_FILE}"; then
  # shellcheck disable=SC1090
  source "${CONFIG_FILE}"
  TOKEN="${CODEXREMOTE_TOKEN}"
else
  if command -v openssl >/dev/null 2>&1; then
    TOKEN="$(openssl rand -hex 48)"
  else
    TOKEN="$(python - <<'PY'
import secrets
print(secrets.token_hex(48))
PY
)"
  fi
fi

cat > "${CONFIG_FILE}" <<CFG
export CODEXREMOTE_TOKEN="${TOKEN}"
export CODEXREMOTE_BIND_HOST="0.0.0.0"
export CODEXREMOTE_BIND_PORT="8787"
export CODEXREMOTE_TMUX_BIN="tmux"
export CODEXREMOTE_CODEX_BIN="codex"
export CODEXREMOTE_CODEX_ARGS="exec --dangerously-bypass-approvals-and-sandbox"
export CODEXREMOTE_DEFAULT_CWD="${HOME}"
export CODEXREMOTE_AUDIT_LOG="${CONFIG_DIR}/audit.log"
CFG
chmod 600 "${CONFIG_FILE}"

cat > "${START_SCRIPT}" <<SCRIPT
#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="${TARGET_DIR}"
CONFIG_FILE="\${HOME}/.codexremote/config.env"
if [[ -f "\${CONFIG_FILE}" ]]; then
  # shellcheck disable=SC1090
  source "\${CONFIG_FILE}"
fi
cd "\${ROOT_DIR}"
exec "\${ROOT_DIR}/.venv/bin/python" -m uvicorn app.server:app --host "\${CODEXREMOTE_BIND_HOST:-0.0.0.0}" --port "\${CODEXREMOTE_BIND_PORT:-8787}"
SCRIPT
chmod 755 "${START_SCRIPT}"

mkdir -p "${SERVICE_DIR}"
cat > "${SERVICE_FILE}" <<SERVICE
[Unit]
Description=Codex Remote Companion Server
After=network-online.target

[Service]
Type=simple
WorkingDirectory=${TARGET_DIR}
ExecStart=${START_SCRIPT}
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
SERVICE

if command -v systemctl >/dev/null 2>&1; then
  systemctl --user daemon-reload
  systemctl --user enable --now codexremote.service >/dev/null 2>&1 || true
fi

echo ""
echo "Codex Remote install complete"
echo "Source: ${TARGET_DIR}"
echo "Config: ${CONFIG_FILE}"
echo "Token: ${TOKEN}"
echo ""
echo "Manual start: ${START_SCRIPT}"
echo "Service (if systemd user session is available): systemctl --user status codexremote.service"
echo "Health: http://127.0.0.1:8787/health"
echo ""
echo "Use token in NovaRemote server profile bearer token field."
