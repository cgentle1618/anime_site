#!/usr/bin/env bash
# Shared plumbing for the backup jobs.
#
# Two properties matter more than anything else here and both live in
# start_job(): every script reports either success or failure to its own
# Healthchecks check, and all four jobs serialise on one lock. The second
# matters because Persistent=true fires every missed run at boot
# simultaneously after an outage, and the drill must not start before the
# backup it verifies has finished.

REPO_DIR="${REPO_DIR:-${HOME}/anime_site}"
COMPOSE=(docker compose -f "${REPO_DIR}/docker-compose.prod.yml")
LOCK_FILE="${HOME}/.cache/media-backup.lock"
LOG_FILE=""

# Loads the app's .env (POSTGRES_*) and the backup's own .env.backup
# (Healthchecks URLs, bucket name). Kept in two files because
# docker-compose.prod.yml gives the app service `env_file: .env`, so anything
# put there is handed to the web application - including, otherwise, write
# credentials for the bucket holding its own backups.
load_env() {
    [ -f "${REPO_DIR}/.env" ] || { echo "No ${REPO_DIR}/.env" >&2; return 1; }
    [ -f "${REPO_DIR}/.env.backup" ] || { echo "No ${REPO_DIR}/.env.backup" >&2; return 1; }
    # shellcheck disable=SC1091
    set -a; . "${REPO_DIR}/.env"; . "${REPO_DIR}/.env.backup"; set +a
}

acquire_lock() {
    mkdir -p "$(dirname "${LOCK_FILE}")"
    exec 200>"${LOCK_FILE}"
    flock -w 3600 200 || { echo "Lock held for over an hour; giving up." >&2; return 1; }
}

# hc_ping <url> [suffix] [body-file]
# A failed ping must never fail the job it is reporting on - the dead-man's
# switch catches a missing ping on its own, and turning a network blip into a
# backup failure would be the tail wagging the dog.
hc_ping() {
    local url="${1:-}" suffix="${2:-}" body="${3:-/dev/null}"
    [ -n "${url}" ] || return 0
    curl -fsS -m 10 --retry 3 --retry-delay 5 \
        --data-binary "@${body}" "${url}${suffix}" >/dev/null 2>&1 || true
}

# start_job <name> <healthchecks-url>
# Opens the log, installs the EXIT trap, pings /start.
start_job() {
    local name="$1"
    HC_URL="$2"
    LOG_FILE="$(mktemp "/tmp/${name}.XXXXXX.log")"
    # tee runs in a backgrounded process substitution behind a pipe, so the
    # shell never waits for it on its own. Save the original descriptors here
    # so _finish_job can restore them before reading LOG_FILE - restoring
    # closes tee's end of the pipe, which is what lets it see EOF, flush, and
    # exit. Skipping that step races the EXIT trap against tee's own buffer:
    # the last lines echoed before a `set -e` abort - the ones that explain
    # the failure - can still be sitting in the pipe, unwritten, when
    # _finish_job's `tail` reads the file.
    exec 3>&1 4>&2
    exec > >(tee -a "${LOG_FILE}") 2>&1
    TEE_PID=$!
    trap '_finish_job $?' EXIT
    hc_ping "${HC_URL}" "/start"
    echo "==> ${name} starting $(date --iso-8601=seconds)"
}

_finish_job() {
    local rc="$1"
    if [ "${rc}" -eq 0 ]; then
        echo "==> done $(date --iso-8601=seconds)"
    else
        echo "==> FAILED rc=${rc} $(date --iso-8601=seconds)"
    fi
    # Restore the original stdout/stderr - this closes tee's pipe - then wait
    # for tee to drain it and exit, so LOG_FILE is complete before anything
    # below reads it.
    exec 1>&3 2>&4
    wait "${TEE_PID}" 2>/dev/null || true
    if [ "${rc}" -eq 0 ]; then
        hc_ping "${HC_URL}" "" "${LOG_FILE}"
    else
        tail -20 "${LOG_FILE}" > "${LOG_FILE}.tail"
        hc_ping "${HC_URL}" "/fail" "${LOG_FILE}.tail"
        rm -f "${LOG_FILE}.tail"
    fi
    rm -f "${LOG_FILE}"
}
