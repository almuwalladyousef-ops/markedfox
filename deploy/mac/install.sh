#!/bin/bash
# Builds the app, copies it to the internal disk (launchd cannot read the external
# volume), installs launchd jobs.
set -euo pipefail
cd "$(dirname "$0")/../.."
M="$HOME/.markedfox"
mkdir -p "$M" "$HOME/Library/LaunchAgents"
[ -f "$M/env" ] || { cp .env.local "$M/env"; chmod 600 "$M/env"; }
npm run build
rm -rf "$M/app.new" && cp -R .next/standalone "$M/app.new"
cp -R public "$M/app.new/public"
mkdir -p "$M/app.new/.next" && cp -R .next/static "$M/app.new/.next/static"
cp scripts/run-scheduler.mjs deploy/mac/run-web.sh deploy/mac/run-tick.sh "$M/"
chmod +x "$M"/*.sh
rm -rf "$M/app.old"; [ -d "$M/app" ] && mv "$M/app" "$M/app.old"; mv "$M/app.new" "$M/app"
for name in web tick; do
  sed "s#__DIR__#$M#g;s#__HOME__#$HOME#g;s#/deploy/mac/#/#g" "deploy/mac/com.markedfox.$name.plist" > "$HOME/Library/LaunchAgents/com.markedfox.$name.plist"
  launchctl bootout "gui/$(id -u)/com.markedfox.$name" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.markedfox.$name.plist"
done
echo done
