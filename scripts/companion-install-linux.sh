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

BIND_HOST="${NOVA_BIND:-0.0.0.0}"
PORT="${NOVA_PORT:-8787}"
LAN_IP=""

if command -v hostname >/dev/null 2>&1; then
  LAN_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
fi
if [[ -z "${LAN_IP}" ]] && command -v ip >/dev/null 2>&1; then
  LAN_IP="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1)}' | head -1)"
fi
LAN_IP="${LAN_IP:-127.0.0.1}"

SERVER_NAME_RAW="$(hostname -s 2>/dev/null || echo MyServer)"
DEEP_LINK="$(
  SERVER_NAME_RAW="${SERVER_NAME_RAW}" LAN_IP="${LAN_IP}" PORT="${PORT}" TOKEN="${TOKEN}" python3 - <<'PY'
import os
import urllib.parse

name = os.environ.get("SERVER_NAME_RAW", "MyServer")
url = f"http://{os.environ.get('LAN_IP', '127.0.0.1')}:{os.environ.get('PORT', '8787')}"
token = os.environ.get("TOKEN", "")
query = urllib.parse.urlencode(
    {"name": name, "url": url, "token": token},
    quote_via=urllib.parse.quote,
)
print(f"novaremote://add-server?{query}")
PY
)"

echo ""
echo "Quick setup deep link (scan in NovaRemote):"
echo "${DEEP_LINK}"
echo ""
echo "Resolved bind host hint: ${BIND_HOST}"
echo "Resolved LAN IP for QR: ${LAN_IP}"

if command -v qrencode >/dev/null 2>&1; then
  echo ""
  echo "Scan this QR code with NovaRemote:"
  echo ""
  qrencode -t ANSIUTF8 "${DEEP_LINK}"
  echo ""
elif python3 -c "import qrcode" >/dev/null 2>&1; then
  echo ""
  echo "Scan this QR code with NovaRemote:"
  NOVA_DEEP_LINK="${DEEP_LINK}" python3 - <<'PY'
import os
import qrcode

qr = qrcode.QRCode(box_size=1, border=1)
qr.add_data(os.environ["NOVA_DEEP_LINK"])
qr.make()
qr.print_ascii(invert=True)
PY
  echo ""
else
  echo ""
  echo "Install 'qrencode' (apt install qrencode) to display a scannable QR code in this terminal."
  echo "Deep link (paste into phone browser): ${DEEP_LINK}"
  echo ""
fi
