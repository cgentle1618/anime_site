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
