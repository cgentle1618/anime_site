#!/usr/bin/env bash
# Nightly: run the application's own Google Sheets Backup pipeline.
#
# A SEPARATE job from the dump, with its own Healthchecks check, never folded
# into backup.sh. Google's API being down or the app container being unhealthy
# must fail this and leave the R2 backup completely untouched - two jobs, two
# alerts, independent failure domains.
#
# It is scheduled AFTER the dump (04:00 for media-backup, 04:10 here) because
# execute_backup overwrites every tab. Automating it removes the implicit
# human gate, so on an ordinary night the R2 dump is already written before
# Sheets is overwritten, and Google Sheets' own version history holds the
# previous revision as a second fallback behind that.
#
# That ordering is enforced by the schedule gap, the shared flock in lib.sh
# (acquire_lock), and, since deploy/backup/units/media-sheets.service adds
# After=media-backup.service, systemd job ordering too - which is what keeps
# the claim true when Persistent=true fires both timers together at boot
# after an outage instead of ten minutes apart. None of those three make this
# job wait on media-backup.service's SUCCESS, on purpose: the two jobs have
# independent failure domains (see above), so sheets.sh still runs, and still
# reports to its own Healthchecks check, on a night media-backup.service
# fails. That is fine for what this job actually writes - execute_backup
# reads the live database directly, not the R2 dump, so a failed R2 upload
# does not make tonight's Sheets copy any less correct. What does not hold
# that night is the "already captured in R2 first" guarantee above: the
# previous night's R2 dump is untouched, but there is no fresh one to fall
# back to until media-backup.service next succeeds.
#
# Note the asymmetry, and do not let it become a false belief: the dump is the
# backup of record and is restore-verified weekly. The sheet is a current,
# independent, UNVERIFIED second copy. The only honest check available here is
# that the pipeline reported success.
#
# HC_SHEETS_URL is not assigned here - load_backup_env (deploy/backup/lib.sh)
# sources it at runtime from .env.backup, and refuses to continue if it is
# missing or empty.
# shellcheck disable=SC2154

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
load_backup_env HC_SHEETS_URL
acquire_lock
start_job "media-sheets" "${HC_SHEETS_URL}"

echo "==> Running the Google Sheets Backup pipeline"
# execute_backup(db, action_type) is a plain synchronous function - no Request,
# no HTTP, no auth. "Auto" is already an action_type in use
# (app/routers/_factory.py:112).
"${COMPOSE[@]}" exec -T app python -c "
from app.database import SessionLocal
from app.services.pipelines.backup import execute_backup

db = SessionLocal()
try:
    result = execute_backup(db, 'Auto')
finally:
    db.close()
print(result)
"
