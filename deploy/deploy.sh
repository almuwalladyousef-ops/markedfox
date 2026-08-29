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
#
# The build happens in a SEPARATE tree and is swapped in at the end.
#
# It used to happen in place, in the directory the live process was serving
# from, and that was a real fault rather than an untidiness: `next build`
# rewrites .next over several minutes on this box, and every request the old
# process served during those minutes came back 500 with
# `ChunkLoadError: Cannot find module .../chunks/ssr/...`. The chunk was not
# missing — it had been replaced under a process that had already resolved the
# manifest naming the old one. Anyone with the app open watched it break for
# the length of a deploy, and the note in CLAUDE.md claiming the old release
# kept serving was describing something the script did not do.
#
# Now the live tree is untouched until one `mv`, and the previous build is
# kept beside it so a build that boots badly can be put back.

set -euo pipefail

APP_USER="markedfox"
APP_DIR="/srv/markedfox"
CURRENT="${APP_DIR}/current"
# Where the new release is compiled. A second checkout, kept between deploys so
# `npm ci` and Turbopack both have their caches.
BUILD="${APP_DIR}/build"
BRANCH="${DEPLOY_BRANCH:-main}"
SKIP_SNAPSHOT=0

for arg in "$@"; do
  case "$arg" in
    --skip-snapshot) SKIP_SNAPSHOT=1 ;;
    *) echo "Unknown argument: $arg" >&2; exit 1 ;;
  esac
done

# This script lives inside the tree it updates, and bash reads a script by byte
# offset as it runs — so `git reset --hard` on CURRENT can move the ground under
# the interpreter and send it into the middle of a line. Running from a copy
# costs nothing and removes the whole class of problem.
if [[ "${DEPLOY_REEXEC:-0}" != "1" ]]; then
  SELF="$(mktemp /tmp/markedfox-deploy.XXXXXX.sh)"
  cp "$0" "$SELF"
  chmod +x "$SELF"
  DEPLOY_REEXEC=1 DEPLOY_SELF_COPY="$SELF" exec bash "$SELF" "$@"
fi
# Only ever removes the copy, never a real checkout, however the script is run.
trap '[[ -n "${DEPLOY_SELF_COPY:-}" ]] && rm -f "$DEPLOY_SELF_COPY"' EXIT

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
# Everything from here to the swap happens in BUILD. The live process keeps
# serving its own intact tree throughout.
if [[ ! -d "${BUILD}/.git" ]]; then
  log "Creating the build tree"
  ORIGIN_URL="$(sudo -u "$APP_USER" git -C "$CURRENT" remote get-url origin)"
  sudo -u "$APP_USER" git clone --branch "$BRANCH" "$ORIGIN_URL" "$BUILD"
fi

log "Fetching ${BRANCH}"
sudo -u "$APP_USER" git -C "$BUILD" fetch --prune origin
# Hard reset rather than merge: the box is not a place anyone edits code, and a
# conflicted working tree during a deploy is worse than losing local changes.
sudo -u "$APP_USER" git -C "$BUILD" reset --hard "origin/${BRANCH}"
sudo -u "$APP_USER" git -C "$BUILD" clean -fd -e node_modules -e .next
DEPLOYED_SHA="$(sudo -u "$APP_USER" git -C "$BUILD" rev-parse --short HEAD)"

# ── build ───────────────────────────────────────────────────────────────────
log "Installing dependencies"
# Build needs devDependencies; they are pruned again afterwards.
sudo -u "$APP_USER" npm --prefix "$BUILD" ci --no-audit --no-fund

log "Building"
set -a; source "${APP_DIR}/.env.production"; set +a
sudo -u "$APP_USER" --preserve-env npm --prefix "$BUILD" run build

# Standalone output does not include static assets or public/ — Next leaves
# that to the deployer so they can go to a CDN. Here they are served by the
# same process, so copy them beside server.js.
log "Assembling standalone output"
sudo -u "$APP_USER" bash -c "
  cd '$BUILD' &&
  mkdir -p .next/standalone/.next &&
  rm -rf .next/standalone/.next/static .next/standalone/public &&
  cp -r .next/static .next/standalone/.next/static &&
  { [[ -d public ]] && cp -r public .next/standalone/public || true; }
"

# ── bring the live checkout's source to the same commit ─────────────────────
# Before the stop, on purpose: this is network and disk, and none of it is
# load-bearing for the running process — the standalone server reads only
# .next/standalone, which nothing here touches.
#
# The source is updated at all because it is what the next `sudo bash
# /srv/markedfox/current/deploy/deploy.sh` executes, and what anyone reading
# the box will believe is deployed. (This run is executing from a copy in
# /tmp — see the top — so rewriting the file underneath is safe.)
#
# CURRENT/node_modules is deliberately left as it is. Nothing at runtime reads
# it: the web service runs the standalone bundle, which carries its own
# dependencies, and scripts/run-scheduler.mjs imports nothing. Dependencies for
# building live in the build tree.
log "Updating the live checkout's source"
sudo -u "$APP_USER" git -C "$CURRENT" fetch --prune origin
sudo -u "$APP_USER" git -C "$CURRENT" reset --hard "origin/${BRANCH}"

# ── swap ────────────────────────────────────────────────────────────────────
# The only moment the live tree changes, and the service is down for all of it:
# two renames on one filesystem, then a boot. Seconds, against the several
# minutes an in-place build used to leave the old process serving a tree that
# was being rewritten under it.
log "Swapping in the new build"
systemctl stop markedfox.service

sudo -u "$APP_USER" rm -rf "${CURRENT}/.next.prev"
if [[ -d "${CURRENT}/.next" ]]; then
  sudo -u "$APP_USER" mv "${CURRENT}/.next" "${CURRENT}/.next.prev"
fi
sudo -u "$APP_USER" mv "${BUILD}/.next" "${CURRENT}/.next"

log "Starting the service"
systemctl start markedfox.service

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

# A deploy that leaves the site down must fail loudly — and, now that the
# previous build is still sitting there, must put it back rather than leaving
# the site down while somebody restores a snapshot.
echo "FAILED: the app did not answer within 30s." >&2

if [[ -d "${CURRENT}/.next.prev" ]]; then
  echo "Rolling back to the previous build." >&2
  systemctl stop markedfox.service || true
  sudo -u "$APP_USER" rm -rf "${CURRENT}/.next.failed"
  sudo -u "$APP_USER" mv "${CURRENT}/.next" "${CURRENT}/.next.failed" || true
  sudo -u "$APP_USER" mv "${CURRENT}/.next.prev" "${CURRENT}/.next"
  systemctl start markedfox.service
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null --max-time 2 http://127.0.0.1:3000/; then
      echo "Rolled back and healthy. The failed build is in .next.failed." >&2
      break
    fi
    sleep 1
  done
fi

echo "Logs:" >&2
journalctl -u markedfox.service -n 40 --no-pager >&2
exit 1
