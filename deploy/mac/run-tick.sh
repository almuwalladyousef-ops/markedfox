#!/bin/bash
set -a
source "$HOME/.markedfox/env"
set +a
cd "$HOME/.markedfox"
exec /Users/yousef/.local/node/bin/node run-scheduler.mjs
