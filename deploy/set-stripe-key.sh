#!/usr/bin/env bash
#
# Put the Stripe restricted server key into .env.local without it ever being
# echoed, logged, or pasted into a chat transcript, then ship it to the box.
#
#   bash deploy/set-stripe-key.sh
#
# Prompts silently (the terminal does not echo what you type), validates the
# shape only, writes STRIPE_SECRET_KEY into .env.local, syncs to the droplet
# and restarts the app, then runs the health check and the billing smoke.
#
# The value is never printed. Failures report key names and shapes, never
# contents — the same rule deploy/sync-env.sh follows.

set -euo pipefail
cd "$(dirname "$0")/.."

LOCAL_ENV=".env.local"
[[ -f "$LOCAL_ENV" ]] || { echo "no $LOCAL_ENV in $(pwd)" >&2; exit 1; }

printf 'Paste the Stripe restricted key (rk_live_… or sk_live_…), then Enter.\n'
printf 'Nothing you type is shown: '
read -rs KEY
printf '\n'

[[ -n "$KEY" ]] || { echo "nothing entered — aborted, no file changed" >&2; exit 1; }
case "$KEY" in
  rk_live_*|sk_live_*|rk_test_*|sk_test_*) ;;
  *) echo "that does not look like a Stripe secret key (expected rk_live_… or sk_live_…) — aborted, no file changed" >&2; exit 1 ;;
esac

umask 077
if grep -q '^STRIPE_SECRET_KEY=' "$LOCAL_ENV"; then
  tmp="$(mktemp)"
  grep -v '^STRIPE_SECRET_KEY=' "$LOCAL_ENV" > "$tmp"
  mv "$tmp" "$LOCAL_ENV"
  echo "replaced the existing STRIPE_SECRET_KEY line"
else
  echo "adding STRIPE_SECRET_KEY"
fi
printf '\n# Stripe restricted server key (Customers/Checkout/Portal write,\n# Subscriptions read). Set by deploy/set-stripe-key.sh.\nSTRIPE_SECRET_KEY=%s\n' "$KEY" >> "$LOCAL_ENV"
unset KEY

echo
echo "==> Syncing to the droplet"
bash deploy/sync-env.sh

echo
echo "==> Health check"
curl -sS -o /dev/null -w 'https://markedfox.com/ -> %{http_code}\n' https://markedfox.com/

echo
echo "==> Billing smoke against production"
APP_URL=https://markedfox.com node scripts/billing-smoke.mjs
