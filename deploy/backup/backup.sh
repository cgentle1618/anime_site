#!/usr/bin/env bash
# Nightly: stamp the database, dump it, put the dump in R2, mirror
# static/library/, prune old dumps.
#
# The cover-image directory is deliberately NOT here - it is 283 MB against a
# metered hotspot, it changes only when entries are added, and it is
# re-fetchable from the metadata APIs. It has its own weekly job.
# static/library/ is here because it is tiny and is the one store nothing
# anywhere can re-fetch.
#
# POSTGRES_USER, POSTGRES_DB, R2_BUCKET and HC_BACKUP_URL are not assigned
# here - load_env and load_backup_env (deploy/backup/lib.sh) source them at
# runtime from .env and .env.backup respectively, and load_backup_env refuses
# to continue if R2_BUCKET or HC_BACKUP_URL is missing or empty.
# shellcheck disable=SC2154

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
load_backup_env HC_BACKUP_URL
acquire_lock
start_job "media-backup" "${HC_BACKUP_URL}"

stamp="$(date +%Y%m%d-%H%M%S)"
dump="$(mktemp "/tmp/media-${stamp}.XXXXXX.dump")"
git_rev="$(git -C "${REPO_DIR}" rev-parse HEAD)"

# --- Stamp -----------------------------------------------------------------
# Written INTO the database so it travels inside the dump. A metadata file
# uploaded beside the dump cannot do this job: a fresh file pairs happily with
# a stale dump and the check passes.
#
# Its own schema, so `alembic revision --autogenerate` cannot see it - env.py
# leaves include_schemas at its False default - and cannot propose a
# drop_table for it.
echo "==> Stamping"
"${COMPOSE[@]}" exec -T db psql -v ON_ERROR_STOP=1 -q \
    -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -v git_rev="${git_rev}" <<'SQL'
CREATE SCHEMA IF NOT EXISTS backup;
CREATE TABLE IF NOT EXISTS backup.stamp (
    id            int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    taken_at      timestamptz NOT NULL,
    git_revision  text NOT NULL,
    alembic_head  text NOT NULL,
    source_tables text NOT NULL
);
INSERT INTO backup.stamp (id, taken_at, git_revision, alembic_head, source_tables)
VALUES (
    1,
    now(),
    :'git_rev',
    (SELECT version_num FROM alembic_version),
    (SELECT string_agg(tablename, ',' ORDER BY tablename)
       FROM pg_tables WHERE schemaname = 'public')
)
ON CONFLICT (id) DO UPDATE
    SET taken_at      = EXCLUDED.taken_at,
        git_revision  = EXCLUDED.git_revision,
        alembic_head  = EXCLUDED.alembic_head,
        source_tables = EXCLUDED.source_tables;
SQL

# --- Dump ------------------------------------------------------------------
# No downtime: pg_dump takes an MVCC snapshot and never blocks writers.
echo "==> Dumping"
"${COMPOSE[@]}" exec -T db \
    pg_dump -U "${POSTGRES_USER}" -Fc -d "${POSTGRES_DB}" > "${dump}"

# A truncated dump is worse than none, because it looks like an option right
# up until it is needed. Same guard deploy.sh uses.
if [ ! -s "${dump}" ]; then
    echo "Dump is empty. Refusing to upload." >&2
    rm -f "${dump}"
    exit 1
fi
echo "    $(du -h "${dump}" | cut -f1)"

# --- Upload ----------------------------------------------------------------
# copyto, not sync: every night is its own object and sync would delete the
# previous ones. The history is the point.
echo "==> Uploading"
rclone copyto "${dump}" "r2:${R2_BUCKET}/db/daily/media-${stamp}.dump"
if [ "$(date +%d)" = "01" ]; then
    rclone copyto "${dump}" "r2:${R2_BUCKET}/db/monthly/media-${stamp}.dump"
fi

# The local copy goes. A nightly dump on the same SSD as the database is the
# reassurance this whole system exists to stop relying on, and deploy.sh
# already keeps five pre-deploy dumps there for rollback.
rm -f "${dump}"

# --- static/library/ -------------------------------------------------------
# --backup-dir so a local deletion lands somewhere recoverable rather than
# being mirrored into the only other copy.
echo "==> Syncing static/library/"
rclone sync "${REPO_DIR}/static/library" "r2:${R2_BUCKET}/library" \
    --backup-dir "r2:${R2_BUCKET}/_archive/library/${stamp}" \
    --checksum --stats-one-line

echo "==> Verifying static/library/"
rclone check "${REPO_DIR}/static/library" "r2:${R2_BUCKET}/library" --checksum

# --- Prune -----------------------------------------------------------------
# In R2, so retention lives in one place rather than half local and half
# remote. By age rather than by count: simpler, and the schedule makes them
# equivalent.
echo "==> Pruning"
rclone delete "r2:${R2_BUCKET}/db/daily"   --min-age 30d
rclone delete "r2:${R2_BUCKET}/db/monthly" --min-age 366d
