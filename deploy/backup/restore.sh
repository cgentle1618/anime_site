#!/usr/bin/env bash
# The one restore implementation. Two callers:
#
#   verify.sh   --into container:<name>   weekly, automatic, isolated
#   a human     --into production         in a disaster, explicitly confirmed
#
# They differ in guards, never in logic. That is the point: the weekly drill
# executes the same code a person runs at 2 a.m. with the SSD dead, so the
# disaster path is proven every Wednesday instead of being assumed.
#
# POSTGRES_USER and POSTGRES_DB are not assigned here - load_env
# (deploy/backup/lib.sh) sources them at runtime from .env.
# shellcheck disable=SC2154

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

usage() {
    cat >&2 <<'USAGE'
Usage:
  restore.sh --dump <path> --into production --confirm
  restore.sh --dump <path> --into container:<name> --database <name>
USAGE
    exit 2
}

DUMP="" INTO="" DATABASE="" CONFIRM=0
while [ $# -gt 0 ]; do
    case "$1" in
        --dump)     DUMP="$2"; shift 2 ;;
        --into)     INTO="$2"; shift 2 ;;
        --database) DATABASE="$2"; shift 2 ;;
        --confirm)  CONFIRM=1; shift ;;
        *)          usage ;;
    esac
done
[ -n "${DUMP}" ] && [ -n "${INTO}" ] || usage
[ -s "${DUMP}" ] || { echo "Dump ${DUMP} is missing or empty." >&2; exit 1; }

load_env

case "${INTO}" in
    production)
        DATABASE="${POSTGRES_DB}"
        PSQL_USER="${POSTGRES_USER}"
        EXEC=("${COMPOSE[@]}" exec -T db)

        if [ "${CONFIRM}" -ne 1 ]; then
            echo "Refusing: --into production requires --confirm." >&2
            exit 1
        fi

        # app/main.py calls create_all at import. An app container started
        # against the database during a restore creates every table and makes
        # pg_restore collide. Stop it first:
        #     docker compose -f docker-compose.prod.yml stop app
        if [ -n "$("${COMPOSE[@]}" ps -q app)" ]; then
            echo "Refusing: the app service is running." >&2
            echo "  Stop it first - create_all at import will collide with pg_restore." >&2
            exit 1
        fi

        echo "About to REPLACE the contents of '${DATABASE}' on this box."
        "${EXEC[@]}" psql -U "${PSQL_USER}" -d "${DATABASE}" -c \
            "SELECT relname, n_live_tup FROM pg_stat_user_tables
              ORDER BY n_live_tup DESC LIMIT 10;"
        ;;
    container:*)
        container="${INTO#container:}"
        [ -n "${DATABASE}" ] || { echo "--into container: needs --database" >&2; exit 2; }
        # Belt and braces on top of verify.sh's --network none: never let a
        # throwaway restore aim at the production database name.
        if [ "${DATABASE}" = "${POSTGRES_DB}" ]; then
            echo "Refusing: throwaway target may not be '${POSTGRES_DB}'." >&2
            exit 1
        fi
        PSQL_USER="postgres"
        EXEC=(docker exec -i "${container}")
        ;;
    *)  usage ;;
esac

echo "==> Restoring into ${INTO} / ${DATABASE}"
err="$(mktemp)"
trap 'rm -f "${err}"' EXIT

set +e
"${EXEC[@]}" pg_restore -U "${PSQL_USER}" -d "${DATABASE}" \
    --clean --if-exists --no-owner < "${DUMP}" 2> "${err}"
rc=$?
set -e

cat "${err}" >&2

# Exit code alone is not a pass: pg_restore exits 0 with errors on stderr.
if grep -q "pg_restore: error" "${err}"; then
    echo "pg_restore reported errors. Restore FAILED." >&2
    exit 1
fi
[ "${rc}" -eq 0 ] || { echo "pg_restore exited ${rc}." >&2; exit "${rc}"; }

echo "==> Restore complete"
