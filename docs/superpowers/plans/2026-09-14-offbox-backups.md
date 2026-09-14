# Off-box Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the production box scheduled, alerting, self-verifying off-box backups to Cloudflare R2, replacing a manual Google Sheets Backup that only runs when somebody remembers.

**Architecture:** Six host-side shell scripts driven by four systemd timers, sharing one `lib.sh` and one `flock`. All four scheduled jobs run in the save direction only; a single `restore.sh` implements the restore and is called both by the weekly drill (into a network-isolated throwaway container) and by a human in a disaster (into production, behind explicit guards). Correctness is proved by a stamp written into the database immediately before each dump and asserted on restore, so a stale dump fails on a date rather than passing on plausible row counts.

**Tech Stack:** Bash, systemd timers, `rclone` (S3-compatible client for R2), `pg_dump`/`pg_restore` inside the existing `postgres:17` container, Healthchecks.io dead-man's switches, pytest for structural tests, shellcheck in CI.

**Spec:** `docs/superpowers/specs/2026-09-14-offbox-backups-design.md`

## Global Constraints

- **Branch is `feat/offbox-backups`.** Never commit to `dev` or `main`. Opening and merging the PR is the owner's call.
- **No AI attribution in any commit message or PR text.** No `Co-Authored-By`, no `Claude-Session`, no `Generated with`, no `claude.ai` link. `CLAUDE.md` overrides the harness reminder that asks for them.
- **Every script starts `set -euo pipefail` and installs an `EXIT` trap that pings `/fail`.** There must be no path out of any script that neither reports success nor reports failure.
- **Every timer sets `Persistent=true`.** The box lives on a phone hotspot and is not always up; a missed run must fire at next boot.
- **Schedule, verbatim:** `media-backup` daily `04:00`, `media-sheets` daily `04:10`, `media-covers` `Wed 04:20`, `media-verify` `Wed 04:40`. Box timezone is `Asia/Taipei`.
- **Retention:** 30 daily dumps, 12 monthly, pruned in R2.
- **Paths on the box:** repo `~/anime_site`, rclone config `~/.config/rclone/rclone.conf` (mode 600), backup env `~/anime_site/.env.backup` (mode 600). rclone remote is named `r2`.
- **Secrets never go in `~/anime_site/.env`** — `docker-compose.prod.yml:51` gives `app` `env_file: .env`, so everything there is injected into the application container.
- **Compose invocation:** `docker compose -f docker-compose.prod.yml`, services `db`, `app`, `cloudflared`. No service publishes a port; do not add one.
- **`ruff.toml` sets `line-length = 100`, `target-version = "py313"`.** Run `venv/Scripts/ruff.exe check .` before every commit.
- **The backend suite takes ~5.5 minutes and must be run in full before every commit**, not at checkpoints. Never run two pytest processes at once. Budget ~12 minutes minimum for any task that touches Python.

---

### Task 1: Foundation — shared library, gitignore, shellcheck in CI

**Files:**
- Create: `deploy/backup/lib.sh`
- Modify: `.gitignore` (add one line after line 3)
- Modify: `.github/workflows/ci.yml` (add a shellcheck step)
- Create: `tests/unit/test_backup_scripts.py`
- Modify: `docs/PROGRESS.md` (claim the plan's tasks)

**Interfaces:**
- Consumes: nothing.
- Produces: `deploy/backup/lib.sh`, sourced by every other script. Exports `REPO_DIR`, `COMPOSE` (bash array), `LOG_FILE`, and the functions `load_env`, `acquire_lock`, `hc_ping url suffix [body_file]`, `start_job check_url_varname`. `start_job` installs the `EXIT` trap and pings `/start`.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/test_backup_scripts.py`:

```python
"""Structural invariants of the backup scripts.

CI cannot run these scripts: they need the production box, an R2 bucket and a
Postgres container. That is the same bind tests/unit/test_prod_compose.py is
in, and the same answer applies - structure is the only thing checkable here,
which is what makes it worth checking.

What is pinned here is the set of properties that are cheap to break in an
edit and expensive to notice at 04:00 with nobody watching.
"""

import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
BACKUP_DIR = ROOT / "deploy" / "backup"
LIB = BACKUP_DIR / "lib.sh"
CI = ROOT / ".github" / "workflows" / "ci.yml"


def test_lib_exists():
    assert LIB.is_file(), f"{LIB} is missing"


def test_lib_defines_the_shared_helpers():
    body = LIB.read_text(encoding="utf-8")
    for fn in ("load_env", "acquire_lock", "hc_ping", "start_job"):
        assert f"{fn}()" in body, f"lib.sh should define {fn}()"


def test_env_backup_is_ignored():
    # The outcome, not the .gitignore line meant to produce it. .gitignore's
    # `.env` entry matches ONLY that filename - it does NOT match
    # .env.backup, which holds the R2 credentials and lives inside the
    # checkout on the box.
    result = subprocess.run(
        ["git", "check-ignore", "-q", ".env.backup"],
        cwd=ROOT,
        capture_output=True,
    )
    assert result.returncode == 0, ".env.backup must be gitignored"


def test_env_example_is_still_tracked():
    # The reason .gitignore gets `.env.backup` and not `.env.*`: the broad
    # pattern would stop ignoring and start hiding a tracked file the setup
    # docs depend on.
    result = subprocess.run(
        ["git", "ls-files", "--error-unmatch", ".env.example"],
        cwd=ROOT,
        capture_output=True,
    )
    assert result.returncode == 0, ".env.example must stay tracked"


def test_ci_runs_shellcheck():
    body = CI.read_text(encoding="utf-8")
    assert "shellcheck" in body, "CI should lint the shell scripts"
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
```

Expected: FAIL. `test_lib_exists` fails on the missing file; `test_env_backup_is_ignored` fails because `.gitignore` line 3 is exactly `.env`; `test_ci_runs_shellcheck` fails because CI has no such step.

- [ ] **Step 3: Add the gitignore line**

In `.gitignore`, immediately after the existing `.env` line, add:

```
.env.backup
```

- [ ] **Step 4: Add shellcheck to CI**

In `.github/workflows/ci.yml`, in the backend job after the `Lint backend` step (`ruff check .`), add:

```yaml
      - name: Lint shell scripts
        run: shellcheck deploy/deploy.sh deploy/backup/*.sh
```

Shellcheck is preinstalled on GitHub's `ubuntu-latest` runners; no install step is needed.

- [ ] **Step 5: Write `deploy/backup/lib.sh`**

```bash
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
    exec > >(tee -a "${LOG_FILE}") 2>&1
    trap '_finish_job $?' EXIT
    hc_ping "${HC_URL}" "/start"
    echo "==> ${name} starting $(date --iso-8601=seconds)"
}

_finish_job() {
    local rc="$1"
    if [ "${rc}" -eq 0 ]; then
        echo "==> done $(date --iso-8601=seconds)"
        hc_ping "${HC_URL}" "" "${LOG_FILE}"
    else
        echo "==> FAILED rc=${rc} $(date --iso-8601=seconds)"
        tail -20 "${LOG_FILE}" > "${LOG_FILE}.tail"
        hc_ping "${HC_URL}" "/fail" "${LOG_FILE}.tail"
        rm -f "${LOG_FILE}.tail"
    fi
    rm -f "${LOG_FILE}"
}
```

- [ ] **Step 6: Claim the plan in `docs/PROGRESS.md`**

Under `## In flight`, add:

```markdown
### Off-box backups to R2 (`feat/offbox-backups`)

| Task | Status |
|---|---|
| 1. Foundation: lib.sh, gitignore, shellcheck in CI | todo |
| 2. Nightly backup: stamp, dump, upload, library | todo |
| 3. restore.sh, one implementation and two callers | todo |
| 4. verify.sh, the weekly restore drill | todo |
| 5. covers.sh, the weekly cover sync | todo |
| 6. sheets.sh, the nightly Google Sheets backup | todo |
| 7. systemd units and install.sh | todo |
| 8. Documentation | todo |
| 9. Delivery and the manual rehearsal | todo |
```

Set task 1 to `wip <your-label>` before starting, and `done <sha>` in the commit that finishes it.

- [ ] **Step 7: Run the tests to verify they pass**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
```

Expected: PASS, 5 tests.

- [ ] **Step 8: Run the full suite and lint**

```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
```

Expected: both clean. The full run is ~5.5 minutes and is required — a scoped run cannot see a test elsewhere that this change invalidated.

- [ ] **Step 9: Commit**

```bash
git add deploy/backup/lib.sh tests/unit/test_backup_scripts.py .gitignore .github/workflows/ci.yml docs/PROGRESS.md
git commit -m "feat(backup): shared shell library, gitignore guard, shellcheck in CI

lib.sh carries the two properties every job needs: a Healthchecks check that
reports success or failure on every exit path, and one flock shared across all
four jobs so a post-outage catch-up cannot run the drill before the backup it
verifies.

.gitignore's .env entry matches only that filename, so .env.backup - which
holds the R2 credentials and lives inside the checkout on the box - was one
git add from being committed." -- deploy/backup/lib.sh tests/unit/test_backup_scripts.py .gitignore .github/workflows/ci.yml docs/PROGRESS.md
```

---

### Task 2: The nightly backup — stamp, dump, upload, library

**Files:**
- Create: `deploy/backup/backup.sh`
- Modify: `tests/unit/test_backup_scripts.py` (append)

**Interfaces:**
- Consumes: `lib.sh` — `load_env`, `acquire_lock`, `start_job`, `COMPOSE`, `REPO_DIR`.
- Produces: R2 objects at `db/daily/media-<YYYYmmdd-HHMMSS>.dump` and, on the 1st, `db/monthly/`. The `backup.stamp` table in production, one row. Later tasks read `backup.stamp` columns `taken_at`, `git_revision`, `alembic_head`, `source_tables`.

**Note on a refinement to the spec.** The spec says the drill asserts "every table the application declares is present." This task implements it as **every table production had at dump time**, captured into the stamp via `pg_tables`. That is strictly better for the thing being proved — it detects a *partial dump* — and it removes a dependency on the `app` container being healthy, which would have contradicted the design's own principle that the backup must work when the app is broken.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_backup_scripts.py`:

```python
BACKUP = BACKUP_DIR / "backup.sh"

SCRIPTS = ["backup.sh", "restore.sh", "verify.sh", "covers.sh", "sheets.sh"]


@pytest.mark.parametrize("name", SCRIPTS)
def test_every_script_is_strict(name):
    path = BACKUP_DIR / name
    if not path.is_file():
        pytest.skip(f"{name} not written yet")
    body = path.read_text(encoding="utf-8")
    assert "set -euo pipefail" in body, f"{name} must be strict"


@pytest.mark.parametrize("name", ["backup.sh", "verify.sh", "covers.sh", "sheets.sh"])
def test_every_scheduled_job_reports_its_own_outcome(name):
    # Strictness alone is not the guarantee. `set -e` makes a job STOP on an
    # error; start_job is what makes it SAY so. A scheduled job that exits
    # non-zero in silence is the exact failure this system exists to remove,
    # so the two are asserted separately rather than in one test whose name
    # covers more than its body.
    path = BACKUP_DIR / name
    if not path.is_file():
        pytest.skip(f"{name} not written yet")
    body = path.read_text(encoding="utf-8")
    assert "start_job" in body, f"{name} must install the reporting trap"


def test_backup_stamps_before_it_dumps():
    body = BACKUP.read_text(encoding="utf-8")
    # The stamp is what makes a stale dump fail on a date instead of passing
    # on plausible row counts. It is worthless if written after the snapshot.
    assert body.index("backup.stamp") < body.index("pg_dump")


def test_backup_refuses_an_empty_dump():
    body = BACKUP.read_text(encoding="utf-8")
    assert "-s " in body or "! -s" in body, "must guard against a truncated dump"


def test_backup_copies_the_dump_and_syncs_the_library():
    body = BACKUP.read_text(encoding="utf-8")
    # copyto, never sync, for the dump: each night is its own object and sync
    # would delete the previous ones.
    assert "rclone copyto" in body
    assert "static/library" in body


def test_the_nightly_does_not_touch_covers():
    # Load-bearing for the data plan: covers are 283 MB and weekly, the dump
    # and library are tiny and nightly. Nothing else would notice this
    # silently reverting, and the box is on a metered hotspot.
    body = BACKUP.read_text(encoding="utf-8")
    assert "static/covers" not in body


def test_library_sync_preserves_deletions():
    body = BACKUP.read_text(encoding="utf-8")
    # static/library/ is the one store nothing anywhere can re-fetch, so a
    # local rm must not propagate to the only other copy within 24 hours.
    assert "--backup-dir" in body
```

- [ ] **Step 2: Run to verify they fail**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
```

Expected: FAIL — `backup.sh` does not exist, so every test touching `BACKUP` errors.

- [ ] **Step 3: Write `deploy/backup/backup.sh`**

```bash
#!/usr/bin/env bash
# Nightly: stamp the database, dump it, put the dump in R2, mirror
# static/library/, prune old dumps.
#
# static/covers/ is deliberately NOT here - it is 283 MB against a metered
# hotspot, it changes only when entries are added, and it is re-fetchable from
# the metadata APIs. It has its own weekly job. static/library/ is here
# because it is tiny and is the one store nothing anywhere can re-fetch.

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
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
```

- [ ] **Step 4: Make it executable and run the tests**

```bash
chmod +x deploy/backup/backup.sh
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
```

Expected: PASS.

- [ ] **Step 5: Shellcheck it**

```bash
shellcheck deploy/backup/backup.sh deploy/backup/lib.sh
```

Expected: clean. If `shellcheck` is not on the development machine, this is verified by CI on the PR — note that in the commit rather than skipping silently.

- [ ] **Step 6: Full suite and lint**

```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
```

- [ ] **Step 7: Commit**

```bash
git add deploy/backup/backup.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
git commit -m "feat(backup): nightly stamp, dump, upload and library mirror

The stamp is written into its own schema before the dump so it travels inside
it. A metadata file beside the dump cannot prove the same thing - a fresh file
pairs with a stale dump and the check passes, which is how a rollback here once
restored old data under new code with every row count correct.

source_tables records what production actually had at dump time, so the drill
detects a partial dump without needing the app container to be healthy.

Covers are deliberately absent: 283 MB on a metered hotspot, weekly, and
re-fetchable. static/library/ is here because nothing can re-fetch it." -- deploy/backup/backup.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
```

---

### Task 3: `restore.sh` — one implementation, two callers

**Files:**
- Create: `deploy/backup/restore.sh`
- Modify: `tests/unit/test_backup_scripts.py` (append)

**Interfaces:**
- Consumes: `lib.sh` — `load_env`, `COMPOSE`, `REPO_DIR`.
- Produces: `restore.sh --dump <path> --into <production|container:NAME> [--database NAME] [--confirm]`. Exit 0 on a clean restore. Task 4 calls it with `--into container:<name> --database verifydb`.

**Why one script.** A README procedure verified by a *different* piece of code is verified by nothing. The drill runs this exact script every week, so the disaster path is the tested path.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_backup_scripts.py`:

```python
RESTORE = BACKUP_DIR / "restore.sh"


def test_restore_refuses_production_without_confirmation():
    body = RESTORE.read_text(encoding="utf-8")
    assert "--confirm" in body, "a production restore must be explicit"


def test_restore_requires_the_app_to_be_stopped():
    # app/main.py calls create_all at import, so an app container racing the
    # restore creates every table and makes pg_restore collide. Learned the
    # hard way and recorded in docs/notes/decisions.md; encoded here so it
    # cannot be forgotten under pressure at 2 a.m.
    body = RESTORE.read_text(encoding="utf-8")
    assert "create_all" in body, "explain WHY the app must be stopped"
    assert "ps -q app" in body or "ps --status=running" in body


def test_restore_treats_pg_restore_stderr_as_fatal():
    # pg_restore can exit 0 with errors on stderr. Exit code alone is not a
    # pass.
    body = RESTORE.read_text(encoding="utf-8")
    assert "pg_restore: error" in body
```

- [ ] **Step 2: Run to verify they fail**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -k restore -v
```

Expected: FAIL — `restore.sh` does not exist.

- [ ] **Step 3: Write `deploy/backup/restore.sh`**

```bash
#!/usr/bin/env bash
# The one restore implementation. Two callers:
#
#   verify.sh   --into container:<name>   weekly, automatic, isolated
#   a human     --into production         in a disaster, explicitly confirmed
#
# They differ in guards, never in logic. That is the point: the weekly drill
# executes the same code a person runs at 2 a.m. with the SSD dead, so the
# disaster path is proven every Wednesday instead of being assumed.

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
```

- [ ] **Step 4: Make it executable and run the tests**

```bash
chmod +x deploy/backup/restore.sh
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
shellcheck deploy/backup/restore.sh
```

Expected: PASS, shellcheck clean.

- [ ] **Step 5: Full suite and lint**

```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
```

- [ ] **Step 6: Commit**

```bash
git add deploy/backup/restore.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
git commit -m "feat(backup): one restore implementation with two callers

The weekly drill and a human in a disaster run the same script, differing only
in guards. A documented procedure verified by a different piece of code is
verified by nothing - which is exactly how a rollback here passed review and
then restored old data under new code.

Production requires --confirm, prints what it is about to destroy, and refuses
while the app service is running, because create_all at import collides with
pg_restore. pg_restore stderr is fatal: it exits 0 with errors." -- deploy/backup/restore.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
```

---

### Task 4: `verify.sh` — the weekly restore drill

**Files:**
- Create: `deploy/backup/verify.sh`
- Modify: `tests/unit/test_backup_scripts.py` (append)

**Interfaces:**
- Consumes: `lib.sh`; `restore.sh --dump <path> --into container:<name> --database verifydb`; `backup.stamp` columns from Task 2.
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/test_backup_scripts.py`:

```python
VERIFY = BACKUP_DIR / "verify.sh"


def test_drill_is_network_isolated():
    # Isolation by construction rather than by care. The alternative - a
    # scratch database inside the live db container - puts nothing but a
    # correct shell variable between the drill and a --clean against
    # production.
    body = VERIFY.read_text(encoding="utf-8")
    assert "--network none" in body


def test_drill_fetches_from_r2_not_from_disk():
    # The local dump was deleted after upload precisely so this cannot test
    # the wrong artifact. Downloading proves the object exists, is readable
    # with the box's credentials, and survived transfer.
    body = VERIFY.read_text(encoding="utf-8")
    assert "rclone copyto" in body or "rclone copy" in body


def test_drill_calls_the_real_restore_script():
    body = VERIFY.read_text(encoding="utf-8")
    assert "restore.sh" in body, "the drill must run the disaster path, not a copy of it"


def test_drill_asserts_stamp_freshness_and_alembic_head():
    body = VERIFY.read_text(encoding="utf-8")
    assert "taken_at" in body
    assert "alembic_head" in body
    assert "48 hours" in body


def test_drill_asserts_the_table_set_matches_the_stamp():
    body = VERIFY.read_text(encoding="utf-8")
    assert "source_tables" in body


def test_drill_always_removes_its_container():
    body = VERIFY.read_text(encoding="utf-8")
    assert "trap" in body and "docker rm -f" in body
```

- [ ] **Step 2: Run to verify they fail**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -k drill -v
```

Expected: FAIL — `verify.sh` does not exist.

- [ ] **Step 3: Write `deploy/backup/verify.sh`**

```bash
#!/usr/bin/env bash
# Weekly: prove the backup by restoring it.
#
# A backup that has never been restored is a guess. This fetches the newest
# dump FROM R2 - not from disk - restores it with the same restore.sh a person
# would use in a disaster, and asserts the stamp that travelled inside it.
#
# The stamp assertion is the one that matters. A three-week-old dump restores
# perfectly and reports entirely plausible row counts. It fails here on a date.

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
acquire_lock
start_job "media-verify" "${HC_VERIFY_URL}"

CONTAINER="media-verify-$$"
WORK="$(mktemp -d)"
# Every exit path, including a failed assertion, must take the container with
# it. A leaked postgres container would sit there until someone noticed.
trap 'docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true; rm -rf "${WORK}"' EXIT

# --- Fetch the newest dump from R2 ----------------------------------------
echo "==> Finding the newest dump in R2"
newest="$(rclone lsf "r2:${R2_BUCKET}/db/daily" --files-only | sort | tail -1)"
[ -n "${newest}" ] || { echo "No dumps in R2." >&2; exit 1; }
echo "    ${newest}"

rclone copyto "r2:${R2_BUCKET}/db/daily/${newest}" "${WORK}/verify.dump"
[ -s "${WORK}/verify.dump" ] || { echo "Downloaded dump is empty." >&2; exit 1; }

# --- A throwaway that cannot reach anything -------------------------------
echo "==> Starting an isolated postgres:17"
docker run -d --rm --name "${CONTAINER}" --network none \
    -e POSTGRES_PASSWORD=verify postgres:17 >/dev/null

for _ in $(seq 1 60); do
    if docker exec "${CONTAINER}" pg_isready -U postgres -q; then break; fi
    sleep 1
done
docker exec "${CONTAINER}" pg_isready -U postgres -q \
    || { echo "Throwaway postgres never became ready." >&2; exit 1; }

docker exec "${CONTAINER}" createdb -U postgres verifydb

# --- Restore, via the real script -----------------------------------------
"$(dirname "$0")/restore.sh" \
    --dump "${WORK}/verify.dump" \
    --into "container:${CONTAINER}" \
    --database verifydb

q() { docker exec "${CONTAINER}" psql -U postgres -d verifydb -tAc "$1"; }

# --- Assertion 1: the stamp is tonight's ----------------------------------
echo "==> Asserting the stamp"
fresh="$(q "SELECT now() - taken_at < interval '48 hours' FROM backup.stamp;")"
if [ "${fresh}" != "t" ]; then
    echo "STALE DUMP: stamp says $(q 'SELECT taken_at FROM backup.stamp;')" >&2
    exit 1
fi

stamped_head="$(q "SELECT alembic_head FROM backup.stamp;")"
actual_head="$(q "SELECT version_num FROM alembic_version;")"
if [ "${stamped_head}" != "${actual_head}" ]; then
    echo "MISMATCH: stamp says ${stamped_head}, restored says ${actual_head}" >&2
    exit 1
fi
echo "    taken_at fresh, alembic head ${actual_head}, revision $(q 'SELECT git_revision FROM backup.stamp;')"

# --- Assertion 2: the dump is complete ------------------------------------
# source_tables is what production actually had when the dump was taken, so a
# partial dump shows up here as a missing name.
echo "==> Asserting the table set"
expected="$(q "SELECT source_tables FROM backup.stamp;")"
restored="$(q "SELECT string_agg(tablename, ',' ORDER BY tablename)
                 FROM pg_tables WHERE schemaname = 'public';")"
if [ "${expected}" != "${restored}" ]; then
    echo "TABLE SET DIFFERS." >&2
    diff <(tr ',' '\n' <<<"${expected}") <(tr ',' '\n' <<<"${restored}") >&2 || true
    exit 1
fi
echo "    $(tr ',' '\n' <<<"${restored}" | wc -l) tables"

# --- Assertion 3: the core tables carry data ------------------------------
for t in users role; do
    n="$(q "SELECT count(*) FROM \"${t}\";")"
    [ "${n}" -gt 0 ] || { echo "Table ${t} restored EMPTY." >&2; exit 1; }
    echo "    ${t}: ${n}"
done

# --- Reported, not asserted -----------------------------------------------
# Counts are read just before pg_dump takes its snapshot, so a write landing
# in that gap would fail the drill for no real reason. A backup system that
# cries wolf gets ignored, which is its own kind of silent failure. They go in
# the success ping so week-to-week shape stays visible.
echo "==> Row counts"
q "SELECT relname || ': ' || n_live_tup FROM pg_stat_user_tables
     ORDER BY n_live_tup DESC LIMIT 15;"
```

- [ ] **Step 4: Make it executable and run the tests**

```bash
chmod +x deploy/backup/verify.sh
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
shellcheck deploy/backup/verify.sh
```

Expected: PASS, shellcheck clean.

- [ ] **Step 5: Full suite and lint, then commit**

```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
git add deploy/backup/verify.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
git commit -m "feat(backup): weekly restore drill

Fetches the newest dump from R2 - not from disk, so the transport and the
object are proved too - restores it through the real restore.sh into a
--network none throwaway, and asserts the stamp.

Three hard assertions: the stamp is under 48 hours old and its alembic head
matches the restored alembic_version; the restored table set equals what
production had at dump time; users and role are non-empty. Row counts are
reported rather than asserted, because they are read just before the snapshot
and a write in that gap would cry wolf." -- deploy/backup/verify.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
```

---

### Task 5: `covers.sh` — the weekly cover sync

**Files:**
- Create: `deploy/backup/covers.sh`
- Modify: `tests/unit/test_backup_scripts.py` (append)

**Interfaces:**
- Consumes: `lib.sh`.
- Produces: R2 prefix `covers/`, archive at `_archive/covers/<stamp>/`.

- [ ] **Step 1: Write the failing tests**

```python
COVERS = BACKUP_DIR / "covers.sh"


def test_covers_job_syncs_covers_and_checks_them():
    body = COVERS.read_text(encoding="utf-8")
    assert "static/covers" in body
    assert "rclone sync" in body
    # rclone check compares checksums taken from the bucket LISTING, so it
    # verifies 283 MB without downloading any of it - a few Class A ops.
    assert "rclone check" in body


def test_covers_job_preserves_deletions():
    body = COVERS.read_text(encoding="utf-8")
    assert "--backup-dir" in body


def test_covers_job_does_not_touch_the_database():
    body = COVERS.read_text(encoding="utf-8")
    assert "pg_dump" not in body
```

- [ ] **Step 2: Run to verify they fail**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -k covers -v
```

Expected: FAIL — file missing.

- [ ] **Step 3: Write `deploy/backup/covers.sh`**

```bash
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

set -euo pipefail

# shellcheck source=deploy/backup/lib.sh
. "$(dirname "$0")/lib.sh"

load_env
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
```

- [ ] **Step 4: Run the tests and shellcheck**

```bash
chmod +x deploy/backup/covers.sh
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
shellcheck deploy/backup/covers.sh
```

- [ ] **Step 5: Full suite, lint, commit**

```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
git add deploy/backup/covers.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
git commit -m "feat(backup): weekly cover sync

Separate from the nightly job because 283 MB across 1,986 files on a metered
hotspot should not be listed every night to discover nothing changed. Verified
with rclone check, which compares checksums from the bucket listing and so
proves the lot without downloading any of it." -- deploy/backup/covers.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
```

---

### Task 6: `sheets.sh` — the nightly Google Sheets backup

**Files:**
- Create: `deploy/backup/sheets.sh`
- Modify: `tests/unit/test_backup_scripts.py` (append)

**Interfaces:**
- Consumes: `lib.sh`; `app.services.pipelines.backup.execute_backup(db: Session, action_type: str = "Manual") -> dict` inside the `app` container.
- Produces: nothing other tasks consume.

**Why this exists.** It reverses an earlier decision to leave Sheets manual. The reason the dump gets a timer — a backup depending on someone remembering has an unmeasured failure rate — applies to the sheet identically. The sheet's value is that it sits at a different vendor, in a different format, behind a different credential; automating is what makes that value usable rather than arbitrarily stale.

- [ ] **Step 1: Write the failing tests**

```python
SHEETS = BACKUP_DIR / "sheets.sh"


def test_sheets_job_calls_execute_backup_in_the_app_container():
    body = SHEETS.read_text(encoding="utf-8")
    assert "execute_backup" in body
    assert "exec -T app" in body


def test_sheets_job_is_a_separate_job_from_the_dump():
    # Never inside backup.sh. Google's API being down, or the app container
    # being unhealthy, must fail THIS job and leave the R2 backup untouched.
    body = (BACKUP_DIR / "backup.sh").read_text(encoding="utf-8")
    assert "execute_backup" not in body


def test_sheets_job_has_its_own_healthcheck():
    body = SHEETS.read_text(encoding="utf-8")
    assert "HC_SHEETS_URL" in body
```

- [ ] **Step 2: Run to verify they fail**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -k sheets -v
```

Expected: FAIL — file missing.

- [ ] **Step 3: Write `deploy/backup/sheets.sh`**

```bash
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
```

- [ ] **Step 4: Run the tests and shellcheck**

```bash
chmod +x deploy/backup/sheets.sh
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
shellcheck deploy/backup/sheets.sh
```

- [ ] **Step 5: Full suite, lint, commit**

```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
git add deploy/backup/sheets.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
git commit -m "feat(backup): schedule the Google Sheets backup

The reason the dump gets a timer applies to the sheet identically: a backup
depending on someone remembering has an unmeasured failure rate. The sheet's
worth is that it sits at a different vendor in a different format behind a
different credential, and that is only usable if it is current.

Its own job and its own check, never folded into the dump, so Google being down
cannot fail the R2 backup. Ordered after the dump because execute_backup
overwrites every tab." -- deploy/backup/sheets.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
```

---

### Task 7: systemd units and `install.sh`

**Files:**
- Create: `deploy/backup/units/media-backup.service`, `media-backup.timer`, `media-sheets.service`, `media-sheets.timer`, `media-covers.service`, `media-covers.timer`, `media-verify.service`, `media-verify.timer`
- Create: `deploy/backup/install.sh`
- Modify: `tests/unit/test_backup_scripts.py` (append)

**Interfaces:**
- Consumes: all five job scripts.
- Produces: four enabled systemd timers on the box.

- [ ] **Step 1: Write the failing tests**

```python
UNITS = BACKUP_DIR / "units"

SCHEDULE = {
    "media-backup": "*-*-* 04:00:00",
    "media-sheets": "*-*-* 04:10:00",
    "media-covers": "Wed *-*-* 04:20:00",
    "media-verify": "Wed *-*-* 04:40:00",
}


@pytest.mark.parametrize("unit,oncalendar", sorted(SCHEDULE.items()))
def test_timer_schedule_matches_the_design(unit, oncalendar):
    body = (UNITS / f"{unit}.timer").read_text(encoding="utf-8")
    assert f"OnCalendar={oncalendar}" in body


@pytest.mark.parametrize("unit", sorted(SCHEDULE))
def test_every_timer_catches_up_a_missed_run(unit):
    # The box is on a phone hotspot and may be off overnight. Without
    # Persistent=true a missed run is simply lost, which is the failure mode
    # this whole system exists to make visible.
    body = (UNITS / f"{unit}.timer").read_text(encoding="utf-8")
    assert "Persistent=true" in body


@pytest.mark.parametrize("unit", sorted(SCHEDULE))
def test_every_service_runs_its_own_script(unit):
    body = (UNITS / f"{unit}.service").read_text(encoding="utf-8")
    assert "Type=oneshot" in body
    assert "deploy/backup/" in body


def test_install_script_needs_no_sudo_beyond_what_it_documents():
    body = (BACKUP_DIR / "install.sh").read_text(encoding="utf-8")
    assert "systemctl enable --now" in body
    assert "rclone" in body
```

- [ ] **Step 2: Run to verify they fail**

```bash
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -k "timer or service or install" -v
```

Expected: FAIL — the `units/` directory does not exist.

- [ ] **Step 3: Write the four service units**

`deploy/backup/units/media-backup.service`:

```ini
[Unit]
Description=Media tracker: nightly database dump and library mirror to R2
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=cgentle1618
ExecStart=/home/cgentle1618/anime_site/deploy/backup/backup.sh
```

`media-sheets.service`, `media-covers.service`, `media-verify.service` are identical except `Description=` and the script name (`sheets.sh`, `covers.sh`, `verify.sh`). Write each out in full — do not template them.

- [ ] **Step 4: Write the four timer units**

`deploy/backup/units/media-backup.timer`:

```ini
[Unit]
Description=Media tracker: nightly backup at 04:00 Asia/Taipei

[Timer]
OnCalendar=*-*-* 04:00:00
# The box lives on a phone hotspot and may be off overnight. Without this a
# missed run is lost silently, which is worse than it looks - the whole point
# of the dead-man's switch is that a run that never happened is visible.
Persistent=true
Unit=media-backup.service

[Install]
WantedBy=timers.target
```

The other three are identical but for `Description=`, `OnCalendar=` and `Unit=`:

| File | `OnCalendar=` | `Unit=` |
| --- | --- | --- |
| `media-sheets.timer` | `*-*-* 04:10:00` | `media-sheets.service` |
| `media-covers.timer` | `Wed *-*-* 04:20:00` | `media-covers.service` |
| `media-verify.timer` | `Wed *-*-* 04:40:00` | `media-verify.service` |

- [ ] **Step 5: Write `deploy/backup/install.sh`**

```bash
#!/usr/bin/env bash
# Run this ONCE, on the box, with sudo. It is the only part of the backup
# system that needs root. Read it before you run it.
#
#   sudo ./deploy/backup/install.sh
#
# Before running, both of these must already exist (neither needs root):
#   ~/.config/rclone/rclone.conf   the R2 remote, named r2, mode 600
#   ~/anime_site/.env.backup       HC_*_URL and R2_BUCKET, mode 600

set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }

REAL_USER="${SUDO_USER:?run via sudo, not as root directly}"
REPO="/home/${REAL_USER}/anime_site"
UNITS="${REPO}/deploy/backup/units"

for f in "/home/${REAL_USER}/.config/rclone/rclone.conf" "${REPO}/.env.backup"; do
    [ -f "${f}" ] || { echo "Missing ${f}. See deploy/README.md." >&2; exit 1; }
done

echo "==> Installing rclone and shellcheck"
apt-get update -qq
apt-get install -y rclone shellcheck

echo "==> Installing units"
install -m 644 "${UNITS}"/media-*.service "${UNITS}"/media-*.timer /etc/systemd/system/
sed -i "s/^User=.*/User=${REAL_USER}/" /etc/systemd/system/media-*.service
sed -i "s#/home/cgentle1618/#/home/${REAL_USER}/#" /etc/systemd/system/media-*.service
systemctl daemon-reload

echo "==> Enabling timers"
# media-covers is deliberately NOT enabled here. Its first run uploads 283 MB
# over a metered phone hotspot, and that is a cost to spend deliberately, not
# something a timer decides at 04:20. Run covers.sh by hand once, then:
#     sudo systemctl enable --now media-covers.timer
systemctl enable --now media-backup.timer media-sheets.timer media-verify.timer

systemctl list-timers --all --no-pager | grep media- || true
echo
echo "==> Done. media-covers.timer is NOT enabled - see the note above."
```

- [ ] **Step 6: Make executable, run the tests, shellcheck**

```bash
chmod +x deploy/backup/install.sh
venv/Scripts/python.exe -m pytest tests/unit/test_backup_scripts.py -v
shellcheck deploy/backup/install.sh
```

- [ ] **Step 7: Full suite, lint, commit**

```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
git add deploy/backup/units deploy/backup/install.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
git commit -m "feat(backup): systemd units and the one-time install script

Every timer sets Persistent=true, so a run missed while the box was off fires
at next boot rather than being lost - the reason for systemd over cron on a
machine that lives on a phone hotspot.

install.sh deliberately does not enable media-covers.timer. Its first run
uploads 283 MB over a metered connection, which is a cost to spend on purpose
rather than one a timer picks at 04:20." -- deploy/backup/units deploy/backup/install.sh tests/unit/test_backup_scripts.py docs/PROGRESS.md
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/deployment-selfhost.md` (remove the "Scheduled backups off the box" bullet from "What is not done" around line 512; add a backups section; bump `Last verified`)
- Modify: `deploy/README.md` (add disaster recovery from R2)
- Modify: `docs/setup-selfhost.md` (build-order step 7)
- Modify: `docs/notes/decisions.md` (append a backups section)
- Modify: `docs/PROGRESS.md`

**Interfaces:** none.

**Doc rules that apply here.** Everything except `docs/notes/` and `docs/PROGRESS.md` is **present tense only** — no phase names, no dates, no "it used to be X". Write the system as it is, as though it had never been otherwise.

- [ ] **Step 1: Add the backups section to `docs/deployment-selfhost.md`**

Delete the whole `- **Scheduled backups off the box.**` bullet from "What is not done" (it runs from roughly line 512 to line 534, ending with the `image` backfill sentence). Add a new `## Backups` section after "How it recovers", written present-tense, covering: the four jobs and their schedule; the R2 layout (`db/daily/`, `db/monthly/`, `covers/`, `library/`, `_archive/`); retention; the stamp and what it proves; the weekly drill and its three assertions; the four Healthchecks checks; and the asymmetry that the dump is verified and the sheet is not.

Bump the `Last verified` line at the top to `2026-09-14` and drop the "backups off the box are the only part not built" clause.

- [ ] **Step 2: Fix the dangling decision reference**

`docs/deployment-selfhost.md:528` currently cites the R2-as-backup-target decision as living in `notes/decisions.md`, where it does not appear. Task step 4 below puts it there. Re-grep after writing to confirm both halves now agree — **grep the claim, not the file**: a claim worth stating once is usually stated twice.

```bash
grep -rn "R2" docs/ --include=*.md
```

- [ ] **Step 3: Add disaster recovery to `deploy/README.md`**

Add a `## Disaster recovery from R2` section beside the existing `## Rollback` (line 112). It is distinct from rollback: rollback reverses a bad deploy from a local dump, this rebuilds from off-box copies. Steps: install rclone and restore `rclone.conf`; `rclone lsf r2:<bucket>/db/daily` to pick a dump; `rclone copyto` it down; `docker compose -f docker-compose.prod.yml stop app`; `deploy/backup/restore.sh --dump <path> --into production --confirm`; `rclone copy` the covers and library prefixes back; `docker compose up -d`. Note that both passwords are rotated afterwards, as the existing restore notes require.

**Leave this section marked as not yet walked** until Task 9 rewrites it from a real run.

- [ ] **Step 4: Record the decisions in `docs/notes/decisions.md`**

Append a `### Off-box backups (spec: 2026-09-14 offbox-backups)` section. This file keeps history, so it is the one place rationale belongs. Cover, one bullet each: R2 as backup target and not primary store; images on local disk so a backup sees ordinary files; host-side scripts rather than an app pipeline, because the backup must work when the app is broken; the stamp inside the dump and the rejected metadata-file alternative; `--network none` and the rejected scratch-database-in-the-live-container alternative; one restore script with two callers; counts reported not asserted; covers weekly and library nightly, split by recoverability on a metered link; Sheets automated but unverified, and the reversal that led there; the dead-man's switch rather than an error reporter; secrets out of `.env` because `env_file:` injects it into the app container.

- [ ] **Step 5: Update `docs/setup-selfhost.md`**

Build-order step 7 becomes a built step: what to create (R2 bucket with a bucket-scoped Object Read & Write token; Healthchecks.io account with four checks), the two 600 files and their keys (`HC_BACKUP_URL`, `HC_SHEETS_URL`, `HC_COVERS_URL`, `HC_VERIFY_URL`, `R2_BUCKET`), and `sudo ./deploy/backup/install.sh`.

- [ ] **Step 6: Verify every doc link resolves and the suite is green**

```bash
venv/Scripts/python.exe -m pytest -q
venv/Scripts/ruff.exe check .
```

- [ ] **Step 7: Commit**

```bash
git add docs/deployment-selfhost.md deploy/README.md docs/setup-selfhost.md docs/notes/decisions.md docs/PROGRESS.md
git commit -m "docs: the backup system as it runs

deployment-selfhost.md loses its last 'What is not done' backup entry and gains
a present-tense Backups section. deploy/README.md gains disaster recovery from
R2 alongside rollback, which is a different operation with a different input.

decisions.md gains the reasoning, including R2-as-backup-target and
images-on-local-disk, which deployment-selfhost.md has been citing as recorded
there without them ever having been written down." -- docs/deployment-selfhost.md deploy/README.md docs/setup-selfhost.md docs/notes/decisions.md docs/PROGRESS.md
```

---

### Task 9: Delivery and the manual rehearsal

**Files:**
- Modify: `deploy/README.md` (rewrite the disaster-recovery section from the real run)
- Modify: `docs/PROGRESS.md`
- Delete: `docs/superpowers/specs/2026-09-14-offbox-backups-design.md`, `docs/superpowers/plans/2026-09-14-offbox-backups.md`

**Interfaces:** none.

**This task is mostly the owner's.** Hand over, wait, then finish from what actually happened.

- [ ] **Step 1: Hand over the setup**

Give the owner, in one message: create the R2 bucket and a bucket-scoped Object Read & Write API token; create the Healthchecks.io account and four checks using the **OnCalendar** schedule type (not Simple) with timezone `Asia/Taipei`, copying the expressions verbatim from the design's alerting table; write `~/.config/rclone/rclone.conf` and `~/anime_site/.env.backup`, both `chmod 600`; then `sudo ./deploy/backup/install.sh`.

- [ ] **Step 2: Seed the bucket by hand**

The owner runs `./deploy/backup/covers.sh` once, at a moment they choose — this is the deliberate 283 MB — then `sudo systemctl enable --now media-covers.timer`.

- [ ] **Step 3: Force one of each job and confirm the pings land**

```bash
sudo systemctl start media-backup.service
sudo systemctl start media-sheets.service
sudo systemctl start media-verify.service
journalctl -u media-backup.service -n 50 --no-pager
```

Confirm all four Healthchecks checks show green, and that the failure path works too — temporarily break one ping URL, run the job, confirm the alert arrives. **A dead-man's switch nobody has seen fire is the same kind of guess as an unrestored backup.**

- [ ] **Step 4: The acceptance test — a full manual rehearsal**

Pull a dump from R2 into a scratch stack, bring the application up against it, and load the site in a browser. Not the automated drill: the real path, walked end to end, including the cover and library prefixes coming back down.

- [ ] **Step 5: Rewrite `deploy/README.md`'s recovery section from what actually happened**

**As it ran, not as designed.** The rollback procedure on this box was wrong in a way only executing it revealed, and it read as confident and correct the whole time. Every command that needed a flag the plan did not mention, every step in a different order, every wait that was needed — those go in.

- [ ] **Step 6: Retire the spec and the plan**

Move anything durable that is not already in the docs into `docs/notes/decisions.md`, written as it ended up rather than as designed. Then delete both files and the plan's table from `docs/PROGRESS.md`. Nothing under `docs/superpowers/` outlives the task that created it.

```bash
git rm docs/superpowers/specs/2026-09-14-offbox-backups-design.md
git rm docs/superpowers/plans/2026-09-14-offbox-backups.md
```

- [ ] **Step 7: Full suite, lint, commit**

```bash
venv/Scripts/ruff.exe check .
venv/Scripts/python.exe -m pytest -q
git add deploy/README.md docs/notes/decisions.md docs/PROGRESS.md
git commit -m "docs: recovery procedure as it actually ran; retire the spec and plan" -- deploy/README.md docs/notes/decisions.md docs/PROGRESS.md docs/superpowers
```

- [ ] **Step 8: Propose the PR**

Show the owner the title and body and **wait**. Opening and merging are theirs. No AI attribution anywhere in it.
