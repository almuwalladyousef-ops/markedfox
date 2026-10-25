#!/bin/bash
# Builds the app, copies it to the internal disk (launchd cannot read the external
# volume), installs launchd jobs, and rolls back to the previous build if the new
# one does not answer.
set -euo pipefail
cd "$(dirname "$0")/../.."
# An SSH session's PATH has no node; this is where the mini keeps it.
export PATH="$HOME/.local/node/bin:$PATH"
M="$HOME/.markedfox"
DOMAIN="gui/$(id -u)"
mkdir -p "$M" "$HOME/Library/LaunchAgents"
[ -f "$M/env" ] || { cp .env.local "$M/env"; chmod 600 "$M/env"; }

# Build before touching anything live: a failed build leaves the site as it was.
npm run build
rm -rf "$M/app.new" && cp -R .next/standalone "$M/app.new"
cp -R public "$M/app.new/public"
mkdir -p "$M/app.new/.next" && cp -R .next/static "$M/app.new/.next/static"
cp scripts/run-scheduler.mjs deploy/mac/run-web.sh deploy/mac/run-tick.sh "$M/"
chmod +x "$M"/*.sh

# (Re)load one launchd job. `bootout` returns before the job is gone, and a
# bootstrap that lands too soon fails with "5: Input/output error" — which
# once left the site down with the old app stopped and the new one never
# started. So wait for it to clear, then retry the bootstrap.
reload() {
  local name="com.markedfox.$1" plist="$HOME/Library/LaunchAgents/com.markedfox.$1.plist"
  sed "s#__DIR__#$M#g;s#__HOME__#$HOME#g;s#/deploy/mac/#/#g" "deploy/mac/$name.plist" > "$plist"
  launchctl bootout "$DOMAIN/$name" 2>/dev/null || true
  for _ in $(seq 1 40); do
    launchctl print "$DOMAIN/$name" >/dev/null 2>&1 || break
    sleep 0.25
  done
  for attempt in 1 2 3 4 5; do
    launchctl bootstrap "$DOMAIN" "$plist" 2>/dev/null && return 0
    sleep "$attempt"
  done
  echo "could not load $name" >&2
  return 1
}

healthy() {
  for _ in $(seq 1 60); do
    curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:3000/ && return 0
    sleep 1
  done
  return 1
}

rm -rf "$M/app.old"; [ -d "$M/app" ] && mv "$M/app" "$M/app.old"; mv "$M/app.new" "$M/app"

if reload web && healthy; then
  reload tick
  echo "done — new build is serving"
  exit 0
fi

echo "new build did not come up; rolling back to the previous one" >&2
if [ -d "$M/app.old" ]; then
  rm -rf "$M/app.failed"; mv "$M/app" "$M/app.failed"; mv "$M/app.old" "$M/app"
fi
reload web && healthy && echo "rolled back — previous build is serving" >&2
exit 1
