#!/usr/bin/env bash
# Recover from a failed deploy, as far as is safe without a human.
#
# THIS SCRIPT NEVER RESTORES DATA. It reverses schema and swaps the image back.
# `alembic downgrade` is not a restore - reversing a dropped column recreates it
# empty - so a migration that dropped data leaves that data only in the
# pre-deploy dump. Restoring automatically would discard every write made since
# that dump in order to recover from a failure that usually did not touch data
# at all. That trade is a human's to make, so tier 3 stages it and stops.
#
# Exit codes:
#   0  the site is healthy again
#   3  frozen; a human is needed. deploy/README.md has the restore procedure.
#
# Run it by hand exactly as the workflow does. That is the point: a procedure
# verified by a different piece of code is verified by nothing, and the rollback
# documented on this box was wrong in a way only executing it revealed.

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
BACKUP_DIR="${HOME}/backups"

freeze() {
    echo "== FROZEN. Nothing further was changed. ==" >&2
    if [ -n "${dump:-}" ]; then
        echo "   pre-deploy dump: ${dump}" >&2
        [ -f "${dump}.revision" ] && echo "   code was at:     $(cat "${dump}.revision")" >&2
        [ -f "${dump}.alembic" ] && echo "   schema was at:   $(cat "${dump}.alembic")" >&2
    fi
    echo "   restore procedure: deploy/README.md" >&2
    exit 3
}

# The newest pre-deploy dump is the one this deploy took. deploy.sh writes two
# files beside it: the git revision and - the one tier 2 needs - the alembic
# revision the DATABASE was at, read from alembic_version itself.
# shellcheck disable=SC2012  # ls -t is the intent; filenames here are stamps
dump="$(ls -1t "${BACKUP_DIR}"/pre-deploy-*.dump 2>/dev/null | head -1)"
if [ -z "${dump}" ]; then
    echo "No pre-deploy dump found in ${BACKUP_DIR}." >&2
    freeze
fi
[ -f "${dump}.revision" ] || { echo "No ${dump}.revision" >&2; freeze; }

previous_rev="$(cat "${dump}.revision")"
echo "==> Deploy failed. Rolling back toward ${previous_rev}"

# Did THIS deploy add revisions? Compare the code that was deployed against the
# code checked out now.
added="$(git diff --name-only "${previous_rev}" HEAD -- alembic/versions/ || true)"

if [ -n "${added}" ]; then
    echo "==> This deploy added revisions:"
    echo "${added}"

    # A revision whose author declared it irreversible must not be downgraded -
    # reversing it would invent data rather than restore it. The marker is the
    # same literal line tests/api/test_migration_round_trip.py asserts the
    # spelling of.
    while IFS= read -r path; do
        [ -n "${path}" ] || continue
        if [ -f "${path}" ] && grep -qE '^irreversible = True$' "${path}"; then
            echo "${path} declares irreversible = True; refusing to downgrade." >&2
            freeze
        fi
    done <<< "${added}"

    [ -f "${dump}.alembic" ] || {
        echo "No ${dump}.alembic - the schema's pre-deploy revision was never" >&2
        echo "recorded, so there is no safe downgrade target." >&2
        freeze
    }
    target="$(cat "${dump}.alembic")"
    [ -n "${target}" ] || freeze

    echo "==> Downgrading to ${target}"
    # Run from the NEW image on purpose: it is the only one holding the revision
    # files being reversed. media-app:previous has never heard of them, which is
    # exactly why swapping the image first crash-loops - `alembic upgrade head`
    # in entrypoint.sh cannot locate a revision its own files do not contain.
    #
    # --no-deps so this does not start a second app container alongside the
    # failed one.
    "${COMPOSE[@]}" run --rm --no-deps app alembic downgrade "${target}" || freeze
fi

echo "==> Restoring the previous image"
if ! docker image inspect media-app:previous >/dev/null 2>&1; then
    echo "No media-app:previous image - nothing to swap to." >&2
    freeze
fi

git checkout --quiet "${previous_rev}"
docker tag media-app:previous media-app:local
"${COMPOSE[@]}" up -d || freeze

echo "==> Re-checking health"
./deploy/health.sh 180 || freeze

echo
echo "== Rolled back to ${previous_rev} and healthy. =="
if [ -n "${added}" ]; then
    echo "== SCHEMA was reversed. DATA was NOT restored. Verify your data. =="
    echo "== The pre-deploy dump is ${dump} if you need it. =="
fi
