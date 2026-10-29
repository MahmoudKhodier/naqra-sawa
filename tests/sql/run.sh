#!/usr/bin/env bash
# Throwaway PostgreSQL 16 cluster -> Supabase stubs -> migration (twice,
# to prove it re-runs) -> SQL assertions -> concurrency check.
#
#   tests/sql/run.sh            # exit 0 = all green
#   KEEP=1 tests/sql/run.sh     # keep the cluster running for poking at it
#   VERBOSE=1 tests/sql/run.sh  # print every ok line, not just failures
#
# Env: PG_BIN (default /usr/lib/postgresql/16/bin), PG_OS_USER (default
# postgres; used to run the server when this script runs as root).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# All migrations in order (or just the one in $MIGRATION).
MIGRATIONS="${MIGRATION:-$(ls "$ROOT"/supabase/migrations/*.sql | sort | tr '\n' ' ')}"
PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
PG_OS_USER="${PG_OS_USER:-postgres}"
PORT=5432  # unix socket only, in a private dir: never clashes

# Postgres refuses to run as root: run the server as an unprivileged user.
if [ "$(id -u)" = 0 ]; then
  if ! id "$PG_OS_USER" >/dev/null 2>&1; then
    PG_OS_USER=pgtest
    id pgtest >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin pgtest
  fi
  as_pg() { runuser -u "$PG_OS_USER" -- "$@"; }
else
  as_pg() { "$@"; }
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/naqra-pgtest.XXXXXX")"
DATA="$TMP/data"
SOCK="$TMP/sock"
mkdir -p "$SOCK"
[ "$(id -u)" = 0 ] && chown -R "$PG_OS_USER" "$TMP"
chmod 755 "$TMP"

cleanup() {
  if [ "${KEEP:-0}" = 1 ]; then
    echo "KEEP=1: cluster left running. Connect with:"
    echo "  psql -h $SOCK -p $PORT -U supabase_admin postgres"
    echo "Stop with: runuser -u $PG_OS_USER -- $PG_BIN/pg_ctl -D $DATA stop; rm -rf $TMP"
    return
  fi
  as_pg "$PG_BIN/pg_ctl" -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "== initdb ($TMP)"
as_pg "$PG_BIN/initdb" -D "$DATA" -U supabase_admin -A trust -E UTF8 --locale=C -N >"$TMP/initdb.log" 2>&1 \
  || { cat "$TMP/initdb.log"; exit 1; }
cat >>"$DATA/postgresql.conf" <<EOF
listen_addresses = ''
wal_level = logical
unix_socket_directories = '$SOCK'
port = $PORT
fsync = off
synchronous_commit = off
full_page_writes = off
EOF
as_pg "$PG_BIN/pg_ctl" -D "$DATA" -l "$TMP/server.log" -w start >/dev/null \
  || { cat "$TMP/server.log"; exit 1; }

export PGHOST="$SOCK" PGPORT="$PORT" PGDATABASE=postgres PSQLRC=/dev/null
psql_admin() { "$PG_BIN/psql" -X -q -U supabase_admin "$@"; }
psql_pg()    { "$PG_BIN/psql" -X -q -U postgres "$@"; }
q()          { psql_admin -At -v ON_ERROR_STOP=1 -c "$1"; }

echo "== Supabase stubs"
psql_admin -v ON_ERROR_STOP=1 -f "$HERE/supabase_stubs.sql" >/dev/null 2>"$TMP/stubs.err" \
  || { cat "$TMP/stubs.err"; exit 1; }

for MIGRATION in $MIGRATIONS; do
  echo "== $(basename "$MIGRATION"), as postgres (1st run)"
  psql_pg -v ON_ERROR_STOP=1 --single-transaction -f "$MIGRATION" >/dev/null 2>"$TMP/run1.err" \
    || { cat "$TMP/run1.err"; exit 1; }
done
for MIGRATION in $MIGRATIONS; do
  echo "== $(basename "$MIGRATION"), as postgres (2nd run: must be re-runnable)"
  psql_pg -v ON_ERROR_STOP=1 --single-transaction -f "$MIGRATION" >/dev/null 2>"$TMP/rerun.err" \
    || { cat "$TMP/rerun.err"; exit 1; }
done

echo "== test.sql"
OUT="$TMP/out.txt"
# No ON_ERROR_STOP: keep going, every unexpected error is counted below.
psql_admin -At -f "$HERE/test.sql" >"$OUT" 2>&1 || true

echo "== concurrency: two doc_merge calls on the same row at the same time"
{
  q "insert into public.docs (circle_id, col, id, data)
     values (t.id('c1'), 'notes', 'conc', '{\"replies\": {}, \"likes\": {}}')" >/dev/null
  # A merges, then holds the row lock for 2 s before committing
  psql_admin -At -c "begin;
    select t.login('A');
    select 1 from doc_merge(t.id('c1'), 'notes', 'conc', '{\"replies\": {\"rA\": {\"t\": \"from A\"}}, \"likes\": {\"A\": true}}');
    select pg_sleep(2);
    commit;" >/dev/null 2>"$TMP/conc1.err" &
  P1=$!
  sleep 0.5
  # B merges different keys while A still holds the lock
  psql_admin -At -c "begin;
    select t.login('B');
    select 1 from doc_merge(t.id('c1'), 'notes', 'conc', '{\"replies\": {\"rB\": {\"t\": \"from B\"}}, \"likes\": {\"B\": true}}');
    commit;" >/dev/null 2>"$TMP/conc2.err" &
  P2=$!
  sleep 0.7
  q "select t.ok(count(*) = 1, 'concurrency: B''s doc_merge is waiting on A''s row lock')
       from pg_stat_activity where wait_event_type = 'Lock' and query like '%doc_merge%'"
  wait "$P1" && wait "$P2" && echo "ok - concurrency: both transactions committed" \
    || echo "not ok - concurrency: a transaction failed # $(cat "$TMP/conc1.err" "$TMP/conc2.err")"
  q "select t.is(data, '{\"replies\": {\"rA\": {\"t\": \"from A\"}, \"rB\": {\"t\": \"from B\"}}, \"likes\": {\"A\": true, \"B\": true}}'::jsonb,
            'concurrency: both replies and both likes survive')
       from public.docs where circle_id = t.id('c1') and col = 'notes' and id = 'conc'"
} >>"$OUT" 2>&1 || true

PASS=$(grep -c '^ok' "$OUT" || true)
FAIL=$(grep -c '^not ok' "$OUT" || true)
ERRS=$(grep -cE '(^psql:.*(ERROR|FATAL)|^ERROR:)' "$OUT" || true)

if [ "${VERBOSE:-0}" = 1 ]; then
  grep -E '^(ok|not ok)' "$OUT" || true
fi
if [ "$FAIL" != 0 ] || [ "$ERRS" != 0 ]; then
  echo "---- failures / unexpected errors ----"
  grep -nE '(^not ok|ERROR|FATAL)' -A2 "$OUT" || true
fi
echo "== $PASS passed, $FAIL failed, $ERRS unexpected SQL errors"
if [ "$FAIL" != 0 ] || [ "$ERRS" != 0 ] || [ "$PASS" = 0 ]; then
  exit 1
fi
