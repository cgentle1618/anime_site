#!/usr/bin/env bash
# Daily: has main actually reached the box?
#
# This covers the one deploy failure GitHub cannot see. A runner that is offline
# when a merge lands queues the job silently, so the merge never deploys - and
# that looks exactly like success: the workflow shows no failure, the site stays
# up serving the previous release, and nothing anywhere says the new code is not
# running.
#
# A dead-man's switch on the DEPLOY job cannot cover it. Healthchecks fires when
# a ping does not arrive within an expected period, deploys are irregular by
# nature so there is no period to configure, and a job that never started cannot
# ping. A DAILY check has a regular period, so the switch works - which is why
# this watches for drift rather than watching deploys.
#
# It lives in deploy/backup/ rather than deploy/ because of what it IS: a
# scheduled job that sources lib.sh and takes the shared lock, like the other
# four. deploy/ holds the deploy machinery a human runs during an incident. As a
# side effect the CI shellcheck glob, install.sh's units/*.timer loop and its
# User=/path rewrite all pick this up with no edit to any of them.
#
# HC_DRIFT_URL and R2_BUCKET are not assigned here - load_backup_env sources
# them at runtime from .env.backup and refuses to continue if either is missing
# or empty.
# shellcheck disable=SC2154

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
# Validates HC_DRIFT_URL before start_job installs the reporting trap. hc_ping()
# returns 0 on an empty URL - correct for an optional ping, wrong as a config
# check - so without this a typo would make this job succeed silently forever
# while alerting nobody, which is the exact false belief of coverage it exists
# to prevent.
load_backup_env HC_DRIFT_URL
acquire_lock
start_job "media-drift" "${HC_DRIFT_URL}"

# A deploy takes a few minutes, and a merge at 09:59 is not a problem at 10:00.
# Six hours is long enough that ordinary lateness never pages the owner and
# short enough that a merge missed overnight is on their screen the next
# morning.
GRACE_HOURS=6

cd "${REPO_DIR}"

git fetch origin main --quiet

local_rev="$(git rev-parse HEAD)"
remote_rev="$(git rev-parse origin/main)"

if [ "${local_rev}" = "${remote_rev}" ]; then
    echo "in sync at ${local_rev}"
    exit 0
fi

# Diverged. Age is measured from the COMMIT on main rather than from when this
# check first noticed, so a box that was off for a week reports the true age on
# its first run back instead of restarting the clock.
merged_at="$(git log -1 --format=%ct "${remote_rev}")"
age_hours=$(( ( $(date +%s) - merged_at ) / 3600 ))

if [ "${age_hours}" -lt "${GRACE_HOURS}" ]; then
    echo "diverged, main is ${age_hours}h old - inside the ${GRACE_HOURS}h grace window"
    exit 0
fi

echo "this box is at ${local_rev}" >&2
echo "main is at      ${remote_rev}, merged ${age_hours}h ago" >&2
echo "main has not reached this box. The self-hosted runner may be offline," >&2
echo "the deploy may have failed, or the checkout may have left main." >&2
exit 1
