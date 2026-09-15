#!/usr/bin/env bash
# Deploy the current branch to this box, reversibly.
#
# The dump is the point of this script. entrypoint.sh runs `alembic upgrade
# head` on every start, so by the time a bad migration is visible it has
# already run - and `alembic downgrade` is not a restore: reversing a dropped
# column recreates it empty. Dumping before the pull is what makes a migration
# reversible at all.
#
# Rollback is in deploy/README.md, and it is three steps rather than two: the
# code has to be reverted along with the data, or the next start re-applies the
# migration that caused the problem. That is why the revision is recorded
# beside each dump.

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
BACKUP_DIR="${HOME}/backups"
KEEP=5

if [ ! -f .env ]; then
    echo "No .env in $(pwd). See deploy/README.md for the template." >&2
    exit 1
fi

mkdir -p "${BACKUP_DIR}"

set -a
# shellcheck disable=SC1091  # runtime file; not present at lint time
. ./.env
set +a

stamp="$(date +%Y%m%d-%H%M%S)"
dump="${BACKUP_DIR}/pre-deploy-${stamp}.dump"

echo "==> Dumping to ${dump}"
"${COMPOSE[@]}" exec -T db \
    pg_dump -U "${POSTGRES_USER}" -Fc -d "${POSTGRES_DB}" > "${dump}"

# A truncated or empty dump is worse than none, because it looks like a
# rollback option right up until it is needed.
if [ ! -s "${dump}" ]; then
    echo "Dump is empty. Refusing to deploy." >&2
    rm -f "${dump}"
    exit 1
fi

# The revision this dump belongs to. Rolling back means checking this out
# before restoring, so it travels with the dump rather than in someone's head.
git rev-parse HEAD > "${dump}.revision"
echo "    dump belongs to $(cat "${dump}.revision")"

echo "==> Tagging the outgoing image as media-app:previous"
if docker image inspect media-app:local >/dev/null 2>&1; then
    docker tag media-app:local media-app:previous
else
    echo "    no current image - first deploy"
fi

echo "==> Pulling"
git pull --ff-only

echo "==> Building and starting"
"${COMPOSE[@]}" up -d --build

echo "==> Pruning dumps, keeping ${KEEP}"
# shellcheck disable=SC2012
ls -1t "${BACKUP_DIR}"/pre-deploy-*.dump 2>/dev/null | tail -n +$((KEEP + 1)) \
    | while read -r old; do rm -f "${old}" "${old}.revision"; done

"${COMPOSE[@]}" ps
echo
echo "==> Done. If this went wrong, rollback is in deploy/README.md."
