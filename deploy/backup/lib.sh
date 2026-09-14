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

# The two config files load separately, and the split is deliberate on both
# sides.
#
# They are two files because docker-compose.prod.yml gives the app service
# `env_file: .env`, so anything put there is handed to the web application -
# including, otherwise, write credentials for the bucket holding its own
# backups.
#
# They are two FUNCTIONS because restore.sh needs only the first. A box being
# rebuilt after a disaster has .env recovered by hand and very possibly no
# .env.backup at all, and the restore must not be blocked on a file holding
# credentials it never reads.

# load_env: the app's own .env (POSTGRES_USER, POSTGRES_DB). All restore.sh
# needs.
load_env() {
    [ -f "${REPO_DIR}/.env" ] || { echo "No ${REPO_DIR}/.env" >&2; return 1; }
    # shellcheck disable=SC1091
    set -a; . "${REPO_DIR}/.env"; set +a
}

# load_backup_env <HC_VARIABLE_NAME>
# The backup jobs' own .env.backup (Healthchecks URLs, bucket name), plus the
# validation that makes a typo in it loud.
#
# Without this, `start_job "x" "${HC_VERIFY_URL}"` with that name misspelled in
# .env.backup aborts on `set -u` BEFORE start_job installs the reporting trap:
# one typo, and the job says nothing at all, on every run, for the life of the
# box - a false belief of coverage, which is worse than no backup. Here the
# same typo is a named message in the journal instead.
#
# A ping is still impossible when the ping URL itself is what is missing. That
# case is caught from outside by the Healthchecks grace window, as a missed
# check rather than a failure alert - see docs/deployment-selfhost.md.
load_backup_env() {
    local hc_var="${1:?load_backup_env needs the name of the HC_*_URL variable for this job}" var
    [ -f "${REPO_DIR}/.env.backup" ] || { echo "No ${REPO_DIR}/.env.backup" >&2; return 1; }
    # shellcheck disable=SC1091
    set -a; . "${REPO_DIR}/.env.backup"; set +a
    # `${!name:-}`, never a bare `${!name}`: under `set -u` the bare form
    # aborts with "unbound variable" and loses the message below, which is the
    # entire point of this function.
    for var in R2_BUCKET "${hc_var}"; do
        [ -n "${!var:-}" ] || {
            echo "${var} is missing or empty in ${REPO_DIR}/.env.backup" >&2
            return 1
        }
    done
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
