#!/usr/bin/env bash
#
# Installs the Caddy config and systemd units. Run as root from a checkout:
#
#   sudo bash deploy/install-units.sh
#
# Safe to re-run after editing any of them.

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/install-units.sh" >&2
  exit 1
fi

log "Installing the Caddyfile"
install -m 644 "${REPO_DIR}/deploy/Caddyfile" /etc/caddy/Caddyfile
# Fails loudly on a syntax error rather than reloading into a broken config.
caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
systemctl reload caddy || systemctl restart caddy

log "Installing systemd units"
install -m 644 "${REPO_DIR}/deploy/systemd/markedfox.service" /etc/systemd/system/
install -m 644 "${REPO_DIR}/deploy/systemd/markedfox-scheduler.service" /etc/systemd/system/
install -m 644 "${REPO_DIR}/deploy/systemd/markedfox-scheduler.timer" /etc/systemd/system/

systemctl daemon-reload
systemctl enable markedfox.service
systemctl enable --now markedfox-scheduler.timer

log "Status"
systemctl is-enabled markedfox.service && echo "  markedfox.service: enabled"
systemctl list-timers markedfox-scheduler.timer --no-pager || true

cat <<'NEXT'

Units installed. The web service is enabled but not started — deploy.sh starts
it once there is a build to serve:

  sudo -u markedfox bash deploy/deploy.sh

NEXT
