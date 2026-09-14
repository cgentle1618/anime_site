#!/usr/bin/env bash
# Nightly: run the application's own Google Sheets Backup pipeline.
#
# A SEPARATE job from the dump, with its own Healthchecks check, never folded
# into backup.sh. Google's API being down or the app container being unhealthy
# must fail this and leave the R2 backup completely untouched - two jobs, two
# alerts, independent failure domains.
#
# It runs AFTER the dump because execute_backup overwrites every tab.
# Automating it removes the implicit human gate, so ordering it second means a
# corrupt night is already captured in R2 first, and Google Sheets' own version
# history holds the previous revision.
#
# Note the asymmetry, and do not let it become a false belief: the dump is the
# backup of record and is restore-verified weekly. The sheet is a current,
# independent, UNVERIFIED second copy. The only honest check available here is
# that the pipeline reported success.
#
# HC_SHEETS_URL is not assigned here - load_env (deploy/backup/lib.sh) sources
# it at runtime from .env.backup.
# shellcheck disable=SC2154

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
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
