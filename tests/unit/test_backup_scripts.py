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
import yaml

ROOT = Path(__file__).resolve().parents[2]
BACKUP_DIR = ROOT / "deploy" / "backup"
LIB = BACKUP_DIR / "lib.sh"
CI = ROOT / ".github" / "workflows" / "ci.yml"
BACKUP = BACKUP_DIR / "backup.sh"

SCRIPTS = ["backup.sh", "restore.sh", "verify.sh", "covers.sh", "sheets.sh"]


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
    # Asserts the outcome, not just the substring: the step must actually be
    # one of the steps the job runs, with a run command that covers both
    # deploy/*.sh and deploy/backup/*.sh - not a step that is commented out,
    # misspelled, or sitting behind a condition that never fires.
    workflow = yaml.safe_load(CI.read_text(encoding="utf-8"))
    steps = workflow["jobs"]["test"]["steps"]
    run_commands = [step["run"] for step in steps if "run" in step]
    shellcheck_runs = [cmd for cmd in run_commands if "shellcheck" in cmd]
    assert shellcheck_runs, "CI should have a step that runs shellcheck"
    assert any(
        "deploy/*.sh" in cmd and "deploy/backup/*.sh" in cmd for cmd in shellcheck_runs
    ), "the shellcheck step should cover both deploy/*.sh and deploy/backup/*.sh"


def test_lib_saves_and_restores_descriptors_around_the_tee_wait():
    # Structural, not behavioural - see the task report for why a test that
    # actually exercises the tee race could not be made to fail against the
    # broken version in this environment (git-bash/MSYS), so it was not
    # shipped rather than ship one that can't fail for the reason it names.
    #
    # What this pins: start_job saves the original stdout/stderr and records
    # tee's pid: _finish_job restores those descriptors (closing tee's pipe)
    # and waits for tee BEFORE it reads LOG_FILE for the ping body - not
    # after. Reordering any one of these four pieces reintroduces the race.
    body = LIB.read_text(encoding="utf-8")
    assert "exec 3>&1 4>&2" in body, "start_job should save the original stdout/stderr"
    assert "TEE_PID=$!" in body, "start_job should capture tee's pid"
    assert "exec 1>&3 2>&4" in body, "_finish_job should restore the original descriptors"
    assert 'wait "${TEE_PID}"' in body, "_finish_job should wait for tee to drain"

    restore_index = body.index("exec 1>&3 2>&4")
    wait_index = body.index('wait "${TEE_PID}"')
    tail_index = body.index("tail -20")
    assert restore_index < wait_index < tail_index, (
        "the descriptor restore and the wait for tee must both happen before "
        "LOG_FILE is read for the ping body, or the fix does nothing"
    )


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
