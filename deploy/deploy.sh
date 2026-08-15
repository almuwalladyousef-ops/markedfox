#!/usr/bin/env bash
#
# Deploy the current main branch. Run as root on the droplet:
#
#   sudo bash /srv/markedfox/current/deploy/deploy.sh
#
# Takes a DigitalOcean snapshot first, because provider snapshots are the
# rollback strategy — there is no blue/green and no Vercel to revert to.
#
#   --skip-snapshot   deploy without one (development only, never for a release)

set -euo pipefail

APP_USER="markedfox"
APP_DIR="/srv/markedfox"
CURRENT="${APP_DIR}/current"
BRANCH="${DEPLOY_BRANCH:-main}"
SKIP_SNAPSHOT=0

for arg in "$@"; do
  case "$arg" in
    --skip-snapshot) SKIP_SNAPSHOT=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!! %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash deploy/deploy.sh" >&2
  exit 1
fi

# ── snapshot ────────────────────────────────────────────────────────────────
if [[ $SKIP_SNAPSHOT -eq 1 ]]; then
  warn "Skipping the snapshot. This deploy has no rollback point."
else
  log "Taking a DigitalOcean snapshot"
  # doctl is a snap and cannot write its config under /root, so the token is
  # read from the environment instead: DIGITALOCEAN_ACCESS_TOKEN lives in
  # /srv/markedfox/.env.production beside the app secrets.
  set -a; source "${APP_DIR}/.env.production"; set +a
  export DIGITALOCEAN_ACCESS_TOKEN
  if [[ -z "${DIGITALOCEAN_ACCESS_TOKEN:-}" ]]; then
    echo "DIGITALOCEAN_ACCESS_TOKEN is not set in ${APP_DIR}/.env.production." >&2
    echo "Add it, or re-run with --skip-snapshot if you accept no rollback point." >&2
    exit 1
  fi
  if ! command -v doctl >/dev/null 2>&1; then
    echo "doctl is not installed, so no rollback point can be taken." >&2
    echo "Install it, or re-run with --skip-snapshot if you accept that." >&2
    exit 1
  fi
  # The droplet asks the metadata service for its own ID, so this script needs
  # no per-box configuration.
  DROPLET_ID="$(curl -s --max-time 5 http://169.254.169.254/metadata/v1/id || true)"
  if [[ -z "$DROPLET_ID" ]]; then
    echo "Could not read the droplet ID from the metadata service." >&2
    exit 1
  fi
  SNAPSHOT_NAME="markedfox-predeploy-$(date -u +%Y%m%d-%H%M%S)"
  doctl compute droplet-action snapshot "$DROPLET_ID" \
    --snapshot-name "$SNAPSHOT_NAME" --wait
  echo "Snapshot taken: ${SNAPSHOT_NAME}"
fi

# ── fetch ───────────────────────────────────────────────────────────────────
log "Fetching ${BRANCH}"
sudo -u "$APP_USER" git -C "$CURRENT" fetch --prune origin
# Hard reset rather than merge: the box is not a place anyone edits code, and a
# conflicted working tree during a deploy is worse than losing local changes.
sudo -u "$APP_USER" git -C "$CURRENT" reset --hard "origin/${BRANCH}"
DEPLOYED_SHA="$(sudo -u "$APP_USER" git -C "$CURRENT" rev-parse --short HEAD)"

# ── build ───────────────────────────────────────────────────────────────────
log "Installing dependencies"
sudo -u "$APP_USER" npm --prefix "$CURRENT" ci --omit=dev --no-audit --no-fund

log "Building"
# Build needs devDependencies; they are pruned again afterwards.
sudo -u "$APP_USER" npm --prefix "$CURRENT" ci --no-audit --no-fund
set -a; source "${APP_DIR}/.env.production"; set +a
sudo -u "$APP_USER" --preserve-env npm --prefix "$CURRENT" run build

# Standalone output does not include static assets or public/ — Next leaves
# that to the deployer so they can go to a CDN. Here they are served by the
# same process, so copy them beside server.js.
log "Assembling standalone output"
sudo -u "$APP_USER" bash -c "
  cd '$CURRENT' &&
  mkdir -p .next/standalone/.next &&
  rm -rf .next/standalone/.next/static .next/standalone/public &&
  cp -r .next/static .next/standalone/.next/static &&
  { [[ -d public ]] && cp -r public .next/standalone/public || true; }
"

sudo -u "$APP_USER" npm --prefix "$CURRENT" prune --omit=dev

# ── restart ─────────────────────────────────────────────────────────────────
log "Restarting the service"
systemctl restart markedfox.service

# ── verify ──────────────────────────────────────────────────────────────────
log "Waiting for the app to answer"
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:3000/; then
    echo "Healthy after ${i}s — deployed ${DEPLOYED_SHA}"
    systemctl is-active markedfox.service
    exit 0
  fi
  sleep 1
done

# A deploy that leaves the site down must fail loudly, not exit 0 quietly.
echo "FAILED: the app did not answer within 30s." >&2
echo "Logs:" >&2
journalctl -u markedfox.service -n 40 --no-pager >&2
exit 1
