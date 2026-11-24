#!/usr/bin/env sh
set -e

# Ensure data directory exists
mkdir -p "${DATA_DIR:-/app/data}"

# If an argument is provided, execute it; otherwise run default service
if [ "$#" -gt 0 ]; then
  exec "$@"
else
  exec node dist/index.js
fi
