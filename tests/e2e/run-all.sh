#!/usr/bin/env bash
# Run the e2e suites (each starts its own Postgres + fake Supabase).
# smoke.js goes first on its own (it empties tests/e2e/shots/), then the rest N at a time.
# More than ~3 at once makes the timing checks (slow network, replays) miss on a busy machine.
#
#   bash tests/e2e/run-all.sh                 # all suites
#   SUITES="plan heads" N=1 bash tests/e2e/run-all.sh
#
# One log per suite in $OUT (default /tmp/naqra-e2e). Exit 1 if any suite failed.
cd "$(dirname "${BASH_SOURCE[0]}")/../.." || exit 1
[ -z "${NODE_PATH:-}" ] && NODE_PATH="$(npm root -g)" && export NODE_PATH
OUT="${OUT:-/tmp/naqra-e2e}"
rm -rf "$OUT"; mkdir -p "$OUT"
SUITES="${SUITES:-smoke reader ui heads notebook play young quests offdays plan planedit shelf notes together focus goals native library goodreads me worm private book-hero}"
export OUT
one() {
  local s=$1 t0 rc
  t0=$(date +%s)
  timeout 1500 node "tests/e2e/$s.js" >"$OUT/$s.log" 2>&1; rc=$?
  echo "$s rc=$rc $(( $(date +%s) - t0 ))s $(grep -aE "^==== " "$OUT/$s.log" | tail -1)"
  [ $rc = 0 ] || touch "$OUT/.failed"
}
export -f one
REST=""
for s in $SUITES; do
  if [ "$s" = smoke ]; then one smoke; else REST="$REST $s"; fi
done
[ -n "$REST" ] && printf '%s\n' $REST | xargs -P "${N:-3}" -I{} bash -c 'one {}'
[ ! -e "$OUT/.failed" ]
