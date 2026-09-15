#!/usr/bin/env bash
# Weekly: prove the backup by restoring it.
#
# A backup that has never been restored is a guess. This fetches the newest
# dump FROM R2 - not from disk - restores it with the same restore.sh a
# person would use in a disaster, and asserts the stamp that travelled
# inside it.
#
# The stamp assertion is the one that matters. A three-week-old dump restores
# perfectly and reports entirely plausible row counts. It fails here on a
# date.
#
# R2_BUCKET and HC_VERIFY_URL are not assigned here - load_backup_env
# (deploy/backup/lib.sh) sources them at runtime from .env.backup, and refuses
# to continue if either is missing or empty.
# shellcheck disable=SC2154

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
load_backup_env HC_VERIFY_URL
acquire_lock
start_job "media-verify" "${HC_VERIFY_URL}"

CONTAINER="media-verify-$$"
WORK="$(mktemp -d)"
# Every exit path, including a failed assertion, must take the container with
# it - a leaked postgres container would otherwise sit there until someone
# noticed. rm -rf can't be the whole story either: it must run even if
# docker rm itself errors (container already gone, daemon hiccup), so its
# own failure is swallowed with `|| true` rather than aborting the trap
# before WORK is cleaned up. `rm -rf` carries the same `|| true` for the same
# reason one step further on: the trap body runs under `set -e`, so a non-zero
# rm (a busy mount, a permission the container left behind) would exit the trap
# before _finish_job and the drill would report nothing at all.
#
# `trap ... EXIT` REPLACES a previously installed EXIT trap rather than
# stacking with it, and start_job already installed one (`_finish_job`,
# which pings Healthchecks and flushes the log). Overwriting it here would
# make the drill silently stop reporting its own outcome - the exact failure
# start_job exists to prevent. So this trap does the container/workdir
# cleanup FIRST (a hung Healthchecks call must not leave a leaked container
# behind it) and then calls _finish_job itself, with the exit code captured
# before either cleanup command can change $?.
trap 'rc=$?; docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true; rm -rf "${WORK}" || true; _finish_job "${rc}"' EXIT

# --- Fetch the newest dump from R2 ------------------------------------------
# `rclone lsf | sort | tail -1` is a pipeline, so with `pipefail` (set above)
# its exit status is rclone's, not sort's or tail's - an rclone failure does
# not get silently swallowed by a downstream command that always succeeds.
# The assignment is deliberately NOT written inside an `if` or `[ -n ... ]`
# test: that shape only inspects stdout, and stdout is indistinguishable
# between "rclone errored" and "the bucket is legitimately empty" - exactly
# the fail-open shape restore.sh's app-running guard had. Capturing $?
# explicitly and checking it before ever looking at the value keeps those two
# cases apart.
echo "==> Finding the newest dump in R2"
set +e
newest="$(rclone lsf "r2:${R2_BUCKET}/db/daily" --files-only | sort | tail -1)"
rc=$?
set -e
if [ "${rc}" -ne 0 ]; then
    echo "rclone lsf failed (rc=${rc}); refusing rather than assuming an empty bucket." >&2
    exit 1
fi
[ -n "${newest}" ] || { echo "No dumps found in R2." >&2; exit 1; }
echo "    ${newest}"

rclone copyto "r2:${R2_BUCKET}/db/daily/${newest}" "${WORK}/verify.dump"
[ -s "${WORK}/verify.dump" ] || { echo "Downloaded dump is empty." >&2; exit 1; }

# --- A throwaway that cannot reach anything ---------------------------------
# --network none, not a carefully-pointed variable: the container is
# incapable of reaching production or anything else, by construction.
echo "==> Starting an isolated postgres:17"
docker run -d --rm --name "${CONTAINER}" --network none \
    -e POSTGRES_PASSWORD=verify postgres:17 >/dev/null

ready=0
for _ in $(seq 1 60); do
    if docker exec "${CONTAINER}" pg_isready -U postgres -q; then
        ready=1
        break
    fi
    sleep 1
done
[ "${ready}" -eq 1 ] || { echo "Throwaway postgres never became ready." >&2; exit 1; }

docker exec "${CONTAINER}" createdb -U postgres verifydb

# --- Restore, via the real script -------------------------------------------
# The whole point of this drill: it executes the same restore.sh a person
# runs at 2 a.m. with the SSD dead, not a reimplementation of it. restore.sh
# already treats a non-zero exit (including "pg_restore: error" on stderr
# with a zero exit code) as fatal; letting that propagate under set -e is
# enough, so it is not duplicated here.
"$(dirname "$0")/restore.sh" \
    --dump "${WORK}/verify.dump" \
    --into "container:${CONTAINER}" \
    --database verifydb

# Each q() call is a plain assignment, not inside `if`/`&&`/`||`, so under
# set -e a failing psql (bad connection, syntax error, missing table) aborts
# the whole drill immediately rather than letting an empty or partial result
# read as a legitimate answer.
q() { docker exec "${CONTAINER}" psql -U postgres -d verifydb -tAc "$1"; }

# --- Assertion 1: the stamp is tonight's ------------------------------------
echo "==> Asserting the stamp"
fresh="$(q "SELECT now() - taken_at < interval '48 hours' FROM backup.stamp;")"
if [ "${fresh}" != "t" ]; then
    echo "STALE DUMP: stamp says $(q 'SELECT taken_at FROM backup.stamp;')" >&2
    exit 1
fi

stamped_head="$(q "SELECT alembic_head FROM backup.stamp;")"
actual_head="$(q "SELECT version_num FROM alembic_version;")"
# stamped_head and actual_head are two independently-sourced q() results, and
# either can come back as a legitimately EMPTY string on a query that
# SUCCEEDS - zero rows in backup.stamp, or a version_num column that exists
# but was never populated - without tripping set -e. "" == "" would then pass
# the comparison below and report success on a restore that taught this drill
# nothing. Unlike the freshness check above (which compares against the fixed
# literal "t") these two compare only against each other, so each is checked
# non-empty FIRST, with its own message naming which one was empty.
[ -n "${stamped_head}" ] || { echo "backup.stamp.alembic_head is EMPTY." >&2; exit 1; }
[ -n "${actual_head}" ] || { echo "Restored alembic_version is EMPTY." >&2; exit 1; }
if [ "${stamped_head}" != "${actual_head}" ]; then
    echo "MISMATCH: stamp says ${stamped_head}, restored says ${actual_head}" >&2
    exit 1
fi
echo "    taken_at fresh, alembic head ${actual_head}, revision $(q 'SELECT git_revision FROM backup.stamp;')"

# --- Assertion 2: the dump is complete --------------------------------------
# source_tables is what production actually had when the dump was taken, so a
# partial dump shows up here as a missing name.
echo "==> Asserting the table set"
expected="$(q "SELECT source_tables FROM backup.stamp;")"
restored="$(q "SELECT string_agg(tablename, ',' ORDER BY tablename)
                 FROM pg_tables WHERE schemaname = 'public';")"
# Same vacuous-empty hazard as above: an empty public schema after a
# broken-but-non-erroring restore reads back as "" from string_agg, same as
# an empty backup.stamp.source_tables would. Check each non-empty before
# comparing them to each other, with a distinct message per side.
[ -n "${expected}" ] || { echo "backup.stamp.source_tables is EMPTY." >&2; exit 1; }
[ -n "${restored}" ] || { echo "Restored public schema has NO TABLES." >&2; exit 1; }
if [ "${expected}" != "${restored}" ]; then
    echo "TABLE SET DIFFERS." >&2
    diff <(tr ',' '\n' <<<"${expected}") <(tr ',' '\n' <<<"${restored}") >&2 || true
    exit 1
fi
echo "    $(tr ',' '\n' <<<"${restored}" | wc -l) tables"

# --- Assertion 3: the core tables carry data --------------------------------
for t in users role; do
    n="$(q "SELECT count(*) FROM \"${t}\";")"
    [ "${n}" -gt 0 ] || { echo "Table ${t} restored EMPTY." >&2; exit 1; }
    echo "    ${t}: ${n}"
done

# --- Reported, not asserted --------------------------------------------------
# Counts are read just before pg_dump takes its snapshot, so a write landing
# in that gap would fail the drill for no real reason. A backup system that
# cries wolf gets ignored, which is its own kind of silent failure. They go in
# the success ping so week-to-week shape stays visible.
echo "==> Row counts"
q "SELECT relname || ': ' || n_live_tup FROM pg_stat_user_tables
     ORDER BY n_live_tup DESC LIMIT 15;"
