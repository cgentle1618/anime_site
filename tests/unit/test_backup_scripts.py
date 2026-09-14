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

import yaml

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
