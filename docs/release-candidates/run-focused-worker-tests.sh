#!/usr/bin/env bash
set -euo pipefail
# Run from project root. Explicit local-only socket/port; no managed PG env use.
base=/tmp/worker-local-pg
mkdir -p "$base/data" "$base/socket"
as_local() {
  if [ "$(id -u)" = 0 ]; then
    chown -R 1000:1000 "$base"
    setpriv --reuid=1000 --regid=1000 --clear-groups "$@"
  else
    "$@"
  fi
}
started=0
if ! pg_isready -h "$base/socket" -p 55439 -U local_worker >/dev/null 2>&1; then
  if [ ! -f "$base/data/PG_VERSION" ]; then
    as_local initdb -D "$base/data" -A trust -U local_worker > "$base/init.log"
  fi
  as_local pg_ctl -D "$base/data" -l "$base/server.log" \
    -o "-k $base/socket -p 55439 -h 127.0.0.1" start
  started=1
fi
cleanup() {
  if [ "$started" = 1 ]; then as_local pg_ctl -D "$base/data" stop -m fast; fi
}
trap cleanup EXIT
bunx vitest run src/lib/__tests__/enrichment-suppression.test.ts \
  src/lib/__tests__/suppression-lookup.test.ts src/lib/__tests__/enrichment-concurrency.test.ts