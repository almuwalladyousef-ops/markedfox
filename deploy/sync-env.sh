#!/usr/bin/env bash
#
# Push new/changed keys from the local .env.local to the droplet's
# .env.production. Run from the repo root on the owner's machine:
#
#   bash deploy/sync-env.sh
#   bash deploy/sync-env.sh --dry-run     show what would change, change nothing
#
# Exists because the two files drift silently. The server has its own env, and
# adding a platform credential locally does nothing until it reaches the box —
# which is exactly how THREADS_APP_ID went missing in production while being
# present on the laptop.
#
# Keys the server owns and the laptop must never overwrite are listed in
# SERVER_ONLY below. Values are never printed: this reports key names and
# whether they changed, nothing more.
#
# Key names may contain digits (R2_ACCOUNT_ID and friends). An earlier version
# matched only [A-Z_]+ and therefore skipped every R2 variable in silence —
# the exact drift this script exists to catch, so the pattern is [A-Z0-9_]+
# in all three places it appears.

set -euo pipefail

HOST="${MARKEDFOX_HOST:-deploy@159.203.32.105}"
REMOTE_ENV="/srv/markedfox/.env.production"
LOCAL_ENV=".env.local"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

# Generated on, or scoped to, the server. Never copied from the laptop.
SERVER_ONLY=(
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY
  DIGITALOCEAN_ACCESS_TOKEN
  NEXT_PUBLIC_SITE_URL
)

# Local-only tooling credentials with no business on a web server.
SKIP=(
  SUPABASE_DB_PASSWORD
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ZONE_ID
  DIGITALOCEAN_TOKEN
)

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

[[ -f "$LOCAL_ENV" ]] || { echo "No $LOCAL_ENV here — run from the repo root." >&2; exit 1; }

log "Reading remote keys"
REMOTE_KEYS="$(ssh -o BatchMode=yes "$HOST" "sudo grep -oE '^[A-Z0-9_]+=' $REMOTE_ENV | tr -d =" || true)"

ADDITIONS=()
while IFS= read -r line; do
  [[ "$line" =~ ^[A-Z0-9_]+= ]] || continue
  key="${line%%=*}"
  value="${line#*=}"
  [[ -n "$value" ]] || continue

  skip=0
  for s in "${SERVER_ONLY[@]}" "${SKIP[@]}"; do
    [[ "$key" == "$s" ]] && skip=1 && break
  done
  [[ $skip -eq 1 ]] && continue

  if grep -qx "$key" <<< "$REMOTE_KEYS"; then
    # Compare by hash so no secret is printed or transmitted for the check.
    local_hash="$(printf '%s' "$value" | shasum -a 256 | cut -c1-12)"
    # -n is essential: without it ssh consumes the while-loop's stdin and the
    # loop silently processes only the first line.
    remote_hash="$(ssh -n -o BatchMode=yes "$HOST" "sudo grep '^${key}=' $REMOTE_ENV | head -1 | cut -d= -f2- | tr -d '\n' | sha256sum | cut -c1-12" 2>/dev/null || echo none)"
    if [[ "$local_hash" == "$remote_hash" ]]; then
      printf '  %-38s unchanged\n' "$key"
      continue
    fi
    printf '  %-38s CHANGED\n' "$key"
  else
    printf '  %-38s NEW\n' "$key"
  fi
  ADDITIONS+=("$line")
done < "$LOCAL_ENV"

if [[ ${#ADDITIONS[@]} -eq 0 ]]; then
  log "Nothing to sync"
  exit 0
fi

if [[ $DRY_RUN -eq 1 ]]; then
  log "Dry run — ${#ADDITIONS[@]} key(s) would be written"
  exit 0
fi

log "Writing ${#ADDITIONS[@]} key(s)"
# Rewrite each key in place, appending only if absent. Piped over stdin so the
# values never appear in a command line or in `ps`.
printf '%s\n' "${ADDITIONS[@]}" | ssh -o BatchMode=yes "$HOST" "sudo tee /tmp/mf-env-add >/dev/null && sudo bash -c '
  while IFS= read -r line; do
    key=\"\${line%%=*}\"
    if grep -q \"^\${key}=\" $REMOTE_ENV; then
      grep -v \"^\${key}=\" $REMOTE_ENV > /tmp/mf-env-new
      echo \"\$line\" >> /tmp/mf-env-new
      mv /tmp/mf-env-new $REMOTE_ENV
    else
      echo \"\$line\" >> $REMOTE_ENV
    fi
  done < /tmp/mf-env-add
  rm -f /tmp/mf-env-add
  chown markedfox:markedfox $REMOTE_ENV
  chmod 600 $REMOTE_ENV
'"

log "Restarting the app so it picks them up"
ssh -o BatchMode=yes "$HOST" 'sudo systemctl restart markedfox && sleep 2 && systemctl is-active markedfox'

log "Server keys now"
ssh -o BatchMode=yes "$HOST" "sudo grep -oE '^[A-Z0-9_]+=' $REMOTE_ENV | tr -d = | sed 's/^/  /'"
