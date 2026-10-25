#!/bin/bash
set -a
source "$HOME/.markedfox/env"
set +a
cd "$HOME/.markedfox/app"
export NODE_ENV=production PORT=3000 HOSTNAME=127.0.0.1
exec /Users/yousef/.local/node/bin/node server.js
