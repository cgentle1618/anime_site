"""Structural invariants of the backup scripts.

CI cannot run these scripts: they need the production box, an R2 bucket and a
Postgres container. That is the same bind tests/unit/test_prod_compose.py is
in, and the same answer applies - structure is the only thing checkable here,
which is what makes it worth checking.

What is pinned here is the set of properties that are cheap to break in an
edit and expensive to notice at 04:00 with nobody watching.
"""

import os
import re
import shutil
import stat
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


TRAP_EXIT_RE = re.compile(r"trap\s+'([^']*)'\s+EXIT")


@pytest.mark.parametrize("name", SCRIPTS)
def test_a_scripts_own_exit_trap_does_not_silently_drop_the_reporting_one(name):
    # `trap ... EXIT` REPLACES a previously installed handler; it does not
    # stack. start_job (lib.sh) installs `trap '_finish_job $?' EXIT`, which
    # pings Healthchecks and flushes the log. A script that calls start_job
    # and then installs its OWN EXIT trap - e.g. to remove a throwaway
    # container - silently drops _finish_job unless its own trap calls it
    # too. verify.sh did exactly this in 413ca969 (found by inspection, not
    # by a test) before being fixed to chain the two. This generalises the
    # check to every script in the series, present or future, with both
    # properties - covers.sh and sheets.sh (Tasks 5, 6) are exposed to the
    # identical hazard once written.
    path = BACKUP_DIR / name
    if not path.is_file():
        pytest.skip(f"{name} not written yet")
    body = path.read_text(encoding="utf-8")
    if "start_job" not in body:
        pytest.skip(f"{name} does not call start_job")
    trap_bodies = TRAP_EXIT_RE.findall(body)
    if not trap_bodies:
        return  # no local trap installed - start_job's own trap stays live
    # trap installs replace each other in order, so only the LAST one
    # installed is the one actually live at exit time.
    last_trap = trap_bodies[-1]
    assert "_finish_job" in last_trap, (
        f"{name} installs its own EXIT trap after start_job, which replaces "
        "start_job's reporting trap rather than stacking with it - the "
        "script's trap must call _finish_job itself"
    )


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


def _find_bash() -> str | None:
    # On this Windows box, plain "bash" on PATH can resolve to the WSL relay
    # shim in System32 rather than a real shell - it "succeeds" at being
    # found and then fails every invocation with a WSL relay error. Prefer
    # Git for Windows' own bash, which is what the Bash tool itself uses;
    # fall back to whatever `bash` resolves to elsewhere (Linux CI, macOS).
    for candidate in (
        r"C:\Program Files\Git\usr\bin\bash.exe",
        r"C:\Program Files\Git\bin\bash.exe",
    ):
        if Path(candidate).is_file():
            return candidate
    return shutil.which("bash")


BASH = _find_bash()


def _make_fake_docker(bin_dir: Path, rc: int, stderr_msg: str = "docker daemon down") -> None:
    # A fake `docker` early on PATH, standing in for the real one so the
    # app-running guard can be exercised without Docker or a compose stack.
    # `docker compose -f ... ps -q app` is the only invocation restore.sh
    # makes before pg_restore, so failing unconditionally is enough.
    docker = bin_dir / "docker"
    docker.write_text(
        f"#!/usr/bin/env bash\necho '{stderr_msg}' >&2\nexit {rc}\n",
        encoding="utf-8",
    )
    docker.chmod(docker.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


def _run_restore(tmp_path: Path, bin_dir: Path, extra_args: list[str]) -> subprocess.CompletedProcess:
    repo_dir = tmp_path / "repo"
    repo_dir.mkdir()
    (repo_dir / ".env").write_text(
        "POSTGRES_USER=postgres\nPOSTGRES_DB=proddb\nPOSTGRES_PASSWORD=x\n",
        encoding="utf-8",
    )
    (repo_dir / ".env.backup").write_text("", encoding="utf-8")

    dump = tmp_path / "fake.dump"
    dump.write_bytes(b"not a real dump, just non-empty")

    env = dict(os.environ)
    env["REPO_DIR"] = str(repo_dir)
    env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH', '')}"

    return subprocess.run(
        [BASH, str(RESTORE), "--dump", str(dump), *extra_args],
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )


@pytest.mark.skipif(BASH is None, reason="requires bash")
def test_restore_refuses_when_the_app_running_check_itself_fails(tmp_path):
    # The structural test above only checks that `ps -q app` appears in the
    # file - it would pass unchanged against a version where a failed
    # `docker compose ps` is silently read as "app not running" and a restore
    # proceeds anyway. This exercises the actual guard: `$(...)` inside an
    # `if` never trips `set -e` and never surfaces the command's own exit
    # status, so the check must capture that status explicitly.
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _make_fake_docker(bin_dir, rc=1)

    result = _run_restore(tmp_path, bin_dir, ["--into", "production", "--confirm"])

    assert result.returncode != 0
    assert "could not determine whether the app is running" in result.stderr


@pytest.mark.skipif(BASH is None, reason="requires bash")
def test_restore_refuses_production_without_confirm_behaviourally(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _make_fake_docker(bin_dir, rc=0)

    result = _run_restore(tmp_path, bin_dir, ["--into", "production"])

    assert result.returncode != 0
    assert "requires --confirm" in result.stderr


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


def _make_fake_rclone(bin_dir: Path, lsf_rc: int, lsf_out: str = "") -> None:
    # A fake `rclone` early on PATH standing in for the real one, so the
    # "no dumps found" / "rclone itself failed" refusal paths can be
    # exercised without R2 credentials or network access. verify.sh's first
    # rclone call is `rclone lsf ... --files-only`; failing that call (rather
    # than returning it empty) is what proves the guard does not fail open.
    rclone = bin_dir / "rclone"
    rclone.write_text(
        f"""#!/usr/bin/env bash
if [ "$1" = "lsf" ]; then
    printf '%s' "{lsf_out}"
    exit {lsf_rc}
fi
echo "unexpected rclone invocation: $*" >&2
exit 1
""",
        encoding="utf-8",
    )
    rclone.chmod(rclone.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


def _make_fake_flock(bin_dir: Path) -> None:
    # Real `flock` is not on PATH in this git-bash/MSYS environment (the same
    # gap noted above for the tee race), so acquire_lock would fail before
    # verify.sh ever reaches the rclone call it is being tested against. The
    # fake only needs to behave like a successful, uncontended lock: exit 0
    # regardless of arguments.
    flock = bin_dir / "flock"
    flock.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    flock.chmod(flock.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


def _run_verify(tmp_path: Path, bin_dir: Path) -> subprocess.CompletedProcess:
    repo_dir = tmp_path / "repo"
    (repo_dir / "deploy" / "backup").mkdir(parents=True)
    (repo_dir / ".env").write_text(
        "POSTGRES_USER=postgres\nPOSTGRES_DB=proddb\nPOSTGRES_PASSWORD=x\n",
        encoding="utf-8",
    )
    (repo_dir / ".env.backup").write_text(
        "R2_BUCKET=media-test\nHC_VERIFY_URL=\n",
        encoding="utf-8",
    )

    env = dict(os.environ)
    env["REPO_DIR"] = str(repo_dir)
    env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH', '')}"
    env["HOME"] = str(tmp_path)

    return subprocess.run(
        [BASH, str(VERIFY)],
        capture_output=True,
        text=True,
        env=env,
        timeout=30,
    )


@pytest.mark.skipif(BASH is None, reason="requires bash")
def test_drill_refuses_when_rclone_lsf_itself_fails(tmp_path):
    # This is the fail-open shape from Task 3, applied to `rclone lsf`: if the
    # command that lists dumps ERRORS rather than returning an empty list, a
    # naive `$(rclone lsf ...)` still reads as "" and a script that only
    # checks `[ -n "$newest" ]` concludes "no dumps" and can proceed to fetch
    # nothing meaningful. The drill must instead refuse loudly and distinctly
    # from the legitimate empty-bucket case.
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _make_fake_flock(bin_dir)
    _make_fake_rclone(bin_dir, lsf_rc=1, lsf_out="")

    result = _run_verify(tmp_path, bin_dir)
    # start_job merges stdout and stderr through `tee`, so the refusal
    # message lands in stdout, not stderr - check the combined output.
    output = (result.stdout + result.stderr).lower()

    # `returncode != 0` plus an absence check is not an assertion about THIS
    # failure - an unrelated early failure (acquire_lock, load_env, a missing
    # fixture) also exits non-zero and also never prints "no dumps", so it
    # would pass too. Assert the specific rclone-failure message instead, the
    # same pattern test_drill_refuses_when_no_dumps_are_found already uses.
    assert result.returncode != 0
    assert "rclone lsf failed" in output


@pytest.mark.skipif(BASH is None, reason="requires bash")
def test_drill_refuses_when_no_dumps_are_found(tmp_path):
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _make_fake_flock(bin_dir)
    _make_fake_rclone(bin_dir, lsf_rc=0, lsf_out="")

    result = _run_verify(tmp_path, bin_dir)
    output = (result.stdout + result.stderr).lower()

    assert result.returncode != 0
    assert "no dumps" in output


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
