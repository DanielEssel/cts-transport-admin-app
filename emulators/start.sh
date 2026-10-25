#!/usr/bin/env bash
# Starts the local Auth + Firestore emulators for the admin demo, loads the
# passenger repo's firestore.rules into the Firestore emulator, and seeds the
# demo admin accounts. Local only: the project is "demo-ctsgo-admin", which
# has no real backend. Data is in memory and is gone when this stops.
#
# Usage: emulators/start.sh            (Ctrl+C to stop)
#        RULES_FILE=path/to/firestore.rules emulators/start.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PROJECT=demo-ctsgo-admin
RULES_FILE="${RULES_FILE:-$HERE/../../passenger/cts-transport-passenger-app-clean/firestore.rules}"
[ -f "$RULES_FILE" ] || { echo "Rules file not found: $RULES_FILE" >&2; exit 1; }

# No "rules" in firebase.json: firebase-tools would watch the file, which
# fails on machines out of inotify watches. The rules are loaded below.
firebase emulators:start --only auth,firestore --project "$PROJECT" --config "$HERE/firebase.json" &
EMU=$!
trap 'kill $EMU 2>/dev/null; wait $EMU 2>/dev/null' EXIT INT TERM

for _ in $(seq 1 60); do
  curl -sf http://127.0.0.1:8085/ >/dev/null && curl -sf http://127.0.0.1:9099/ >/dev/null && break
  sleep 1
done
node "$HERE/load-rules.mjs" "$RULES_FILE"
node "$HERE/seed-admins.mjs"
echo "Emulators ready. Start the app with: npm run dev:emulator"
wait $EMU
