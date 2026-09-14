#!/usr/bin/env bash
# Weekly: mirror static/covers/ to R2.
#
# Weekly rather than nightly, and separate from the database job, because this
# is 283 MB across 1,986 files on a metered phone hotspot. rclone sync only
# transfers what differs - but it must still LIST the bucket to know that,
# which is about 1 MB a night to learn that nothing changed.
#
# The asymmetry is deliberate: a cover up to seven days stale is an
# inconvenience and is re-fetchable from the metadata APIs. A database seven
# days stale is not, which is why the dump stays nightly.
#
# R2_BUCKET and HC_COVERS_URL are not assigned here - load_backup_env
# (deploy/backup/lib.sh) sources them at runtime from .env.backup, and refuses
# to continue if either is missing or empty.
# shellcheck disable=SC2154

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
load_backup_env HC_COVERS_URL
acquire_lock
start_job "media-covers" "${HC_COVERS_URL}"

stamp="$(date +%Y%m%d-%H%M%S)"

echo "==> Syncing static/covers/"
rclone sync "${REPO_DIR}/static/covers" "r2:${R2_BUCKET}/covers" \
    --backup-dir "r2:${R2_BUCKET}/_archive/covers/${stamp}" \
    --checksum --stats-one-line

# Checksums come from the bucket listing, so this verifies all 283 MB without
# downloading a byte of it.
echo "==> Verifying"
rclone check "${REPO_DIR}/static/covers" "r2:${R2_BUCKET}/covers" --checksum

echo "==> $(rclone size "r2:${R2_BUCKET}/covers")"
