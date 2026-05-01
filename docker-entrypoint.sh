#!/bin/sh
set -e

if [ "$RUN_MIGRATIONS_ON_START" = "true" ]; then
  npm run migrate
fi

exec node dist/src/server.js
