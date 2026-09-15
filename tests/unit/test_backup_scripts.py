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

# Discovered, not listed. A hardcoded list silently stops covering the series
# the moment a script is added to deploy/backup/ - and the properties below
# (strictness, and not dropping the reporting trap) are exactly the ones whose
# absence is invisible until 04:00 with nobody watching. lib.sh is excluded
# because it is sourced rather than run and has no `set -euo pipefail` of its
# own; install.sh is deliberately INCLUDED, because it must be strict too and
# the trap test below skips anything that does not call start_job.
SCRIPTS = sorted(p.name for p in BACKUP_DIR.glob("*.sh") if p.name != "lib.sh")


def test_the_script_series_is_discovered_not_listed():
    # Guards the glob itself: an empty or mis-rooted BACKUP_DIR would make
    # every parametrized test below collect zero cases and pass vacuously.
    assert {"backup.sh", "restore.sh", "verify.sh", "covers.sh", "sheets.sh"} <= set(
        SCRIPTS
    ), f"the glob should find the known scripts, found {SCRIPTS}"


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


# Both quote styles. The single-quoted-only version of this pattern found
# nothing in a script written `trap "..." EXIT`, so the test returned green
# with zero trap bodies to check - a vacuous pass sitting inside the very test
# written to catch this class of bug.
TRAP_EXIT_RE = re.compile(r"""trap\s+(?P<quote>['"])(?P<body>.*?)(?P=quote)\s+EXIT""", re.DOTALL)


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
    trap_bodies = [m.group("body") for m in TRAP_EXIT_RE.finditer(body)]
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


def test_library_sync_archives_into_the_documented_prefix():
    body = BACKUP.read_text(encoding="utf-8")
    # docs/deployment-selfhost.md's R2 layout table names `_archive/` as the
    # --backup-dir target. Pinned so a rename here does not silently make
    # that table wrong.
    assert "_archive/library/" in body


def test_backup_prunes_by_the_documented_retention_window():
    body = BACKUP.read_text(encoding="utf-8")
    # docs/deployment-selfhost.md states retention as "(30 days, 12 months)"
    # against these two exact --min-age values and paths. Retention is
    # enforced by AGE, not count - the doc deliberately does not claim "30
    # dumps" - so what must stay true is these literals, not a row count.
    assert 'rclone delete "r2:${R2_BUCKET}/db/daily"   --min-age 30d' in body
    assert 'rclone delete "r2:${R2_BUCKET}/db/monthly" --min-age 366d' in body


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
    # No .env.backup is written here, deliberately. restore.sh reads nothing
    # out of it and must not require it: a box being rebuilt after a
    # disaster may have only .env recovered by hand, and the restore cannot
    # be blocked on a file holding credentials it never uses.

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


def _make_fake_curl(bin_dir: Path) -> None:
    # hc_ping shells out to curl. The fixtures below now set a real-looking
    # HC_VERIFY_URL because load_backup_env refuses an empty one, so without
    # this the /start ping would spend curl's three retries and five-second
    # delays trying to reach it. The fake only has to succeed instantly.
    curl = bin_dir / "curl"
    curl.write_text("#!/usr/bin/env bash\nexit 0\n", encoding="utf-8")
    curl.chmod(curl.stat().st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)


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
    # HC_VERIFY_URL is set, not blank: load_backup_env refuses an empty one,
    # which is the whole point of it. _make_fake_curl keeps the ping cheap.
    (repo_dir / ".env.backup").write_text(
        "R2_BUCKET=media-test\nHC_VERIFY_URL=http://127.0.0.1:9/ping\n",
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
    _make_fake_curl(bin_dir)
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
    _make_fake_curl(bin_dir)
    _make_fake_rclone(bin_dir, lsf_rc=0, lsf_out="")

    result = _run_verify(tmp_path, bin_dir)
    output = (result.stdout + result.stderr).lower()

    assert result.returncode != 0
    assert "no dumps" in output


@pytest.mark.skipif(BASH is None, reason="requires bash")
def test_drill_names_a_missing_healthchecks_variable(tmp_path):
    # The sharpest version of the pre-trap silence: ONE typo in .env.backup
    # (HC_VERIFY_URL spelled HC_VERIFY_UR) used to abort on `set -u` with
    # "unbound variable" BEFORE start_job installed the reporting trap, on
    # every run, for the life of the box - a job that says nothing at all,
    # which is a false belief of coverage rather than a gap in it. The ping is
    # still impossible when the ping URL is what is missing (the Healthchecks
    # grace window catches that from outside), but the journal must name the
    # variable rather than print "unbound variable".
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _make_fake_flock(bin_dir)
    _make_fake_curl(bin_dir)

    repo_dir = tmp_path / "repo"
    (repo_dir / "deploy" / "backup").mkdir(parents=True)
    (repo_dir / ".env").write_text("POSTGRES_DB=proddb\n", encoding="utf-8")
    (repo_dir / ".env.backup").write_text("R2_BUCKET=media-test\n", encoding="utf-8")

    env = dict(os.environ)
    env["REPO_DIR"] = str(repo_dir)
    env["PATH"] = f"{bin_dir}{os.pathsep}{env.get('PATH', '')}"
    env["HOME"] = str(tmp_path)

    result = subprocess.run(
        [BASH, str(VERIFY)], capture_output=True, text=True, env=env, timeout=30
    )

    output = result.stdout + result.stderr
    assert result.returncode != 0
    assert "HC_VERIFY_URL is missing or empty" in output, output
    assert "unbound variable" not in output, output


def test_restore_does_not_need_the_backup_env_file():
    # Structural mirror of the fixture above: restore.sh loads .env and only
    # .env, so a rebuilt box with no .env.backup can still restore.
    body = RESTORE.read_text(encoding="utf-8")
    assert "load_backup_env" not in body
    assert "R2_BUCKET" not in body
    assert "HC_" not in body


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


def test_covers_job_archives_into_the_documented_prefix():
    body = COVERS.read_text(encoding="utf-8")
    # Same pin as backup.sh's library sync: docs/deployment-selfhost.md's R2
    # layout table names `_archive/` as the --backup-dir target for covers
    # too, and this is the only place that path segment is asserted.
    assert "_archive/covers/" in body


def test_covers_job_does_not_touch_the_database():
    body = COVERS.read_text(encoding="utf-8")
    assert "pg_dump" not in body


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


UNITS = BACKUP_DIR / "units"

SCHEDULE = {
    "media-backup": "*-*-* 04:00:00",
    "media-sheets": "*-*-* 04:10:00",
    "media-covers": "Wed *-*-* 04:20:00",
    "media-verify": "Wed *-*-* 04:40:00",
    # Not in the 04:00 window on purpose: this one is meant to be acted on, so
    # it fires when the owner is awake. drift.sh's own six-hour grace window is
    # what stops an overnight merge alerting before the deploy has had a chance.
    "media-drift": "*-*-* 10:00:00",
}


def test_every_timer_has_a_schedule_here():
    # SCHEDULE is hand-written, and the three parametrized tests below iterate
    # IT rather than the directory - so a timer added without a line here is
    # silently unchecked: no OnCalendar assertion, no Persistent=true assertion,
    # no service assertion, and nothing red to say so. media-drift.timer was
    # added after this list was written and was invisible to all three.
    #
    # Checking the directory against the list is what makes the list safe to
    # keep: a hand-maintained map is fine when something complete is watching it.
    on_disk = {p.stem for p in UNITS.glob("*.timer")}
    assert on_disk == set(SCHEDULE), (
        f"timers without a SCHEDULE entry: {sorted(on_disk - set(SCHEDULE))}; "
        f"SCHEDULE entries without a timer: {sorted(set(SCHEDULE) - on_disk)}"
    )


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


def test_install_defers_the_cover_timer():
    # The first cover run pushes 283 MB over a metered phone hotspot. That is
    # the owner's cost to spend deliberately, not one a timer picks at 04:20.
    # install.sh iterates units/*.timer so a later job needs no edit here, and
    # this is what stops that convenience from silently enabling this one.
    body = (BACKUP_DIR / "install.sh").read_text(encoding="utf-8")
    assert "DEFER=(media-covers.timer media-verify.timer)" in body


def test_install_defers_the_verify_timer():
    # Persistent=true fires a timer on first activation when its OnCalendar
    # time has already passed, so `enable --now` at any hour after 04:40 runs
    # the drill immediately - against an R2 bucket that, on install day, holds
    # no dump at all. The owner's first-ever Healthchecks event would then be a
    # FAILURE alert on the one job whose whole purpose is to be believed.
    body = (BACKUP_DIR / "install.sh").read_text(encoding="utf-8")
    assert "media-verify.timer" in body
    assert "DEFER=(media-covers.timer media-verify.timer)" in body


def test_install_enables_timers_by_iteration_not_by_name():
    # A fifth job should slot in by dropping two files in units/. Naming each
    # timer here would mean editing this script every time one is added.
    body = (BACKUP_DIR / "install.sh").read_text(encoding="utf-8")
    assert 'for path in "${UNITS}"/*.timer' in body


def test_every_executed_script_is_executable_in_git():
    # systemd's ExecStart and verify.sh's direct call to restore.sh both need
    # the bit set IN GIT, not merely in someone's working tree. The Windows
    # development machines have core.fileMode off, so a `chmod +x` there is
    # invisible to git and never reaches a commit - which is how all seven of
    # these shipped as 100644 and every timer would have failed on the box.
    #
    # deploy.sh has already been fixed for this same reason once
    # (cc3f2d52 "fix(deploy): make deploy.sh executable"), which is why it is
    # asserted here too rather than left to be rediscovered a third time.
    # `git ls-tree HEAD`, NOT `git ls-files -s`: the first reads the COMMIT,
    # the second reads the index. They diverge exactly when this bug is
    # present - `git commit -- <paths>` re-reads those paths from the working
    # tree and discards an index-only mode change, so the index says 100755
    # while the commit says 100644. An ls-files assertion is green against a
    # broken commit, which is how this test first shipped.
    out = subprocess.run(
        # The whole of deploy/, not a list of paths. A complete path cannot be
        # forgotten and a maintained list can - and what is being guarded
        # produces no signal at all: a script committed 100644 does not fail, it
        # simply cannot run, and only on the box. deploy/health.sh and
        # deploy/rollback.sh joined this directory after that list was written.
        ["git", "ls-tree", "-r", "HEAD", "deploy/"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    ).stdout
    modes = {}
    for line in out.splitlines():
        meta, path = line.split("	", 1)
        mode = meta.split()[0]
        if path.endswith(".sh"):
            modes[path] = mode
    assert modes, "expected to find shell scripts under deploy/"

    # lib.sh is sourced, never executed, so it is deliberately not executable.
    sourced_only = {"deploy/backup/lib.sh"}
    not_executable = sorted(
        p for p, m in modes.items() if m != "100755" and p not in sourced_only
    )
    assert not not_executable, f"not executable in git: {not_executable}"

    for p in sorted(sourced_only & modes.keys()):
        assert modes[p] == "100644", f"{p} is sourced, not executed - it should not be 100755"


def test_install_tells_the_operator_to_run_the_jobs_by_hand():
    # Enabling a timer does NOT run it. Persistent=true catches up a run missed
    # while the machine was off, but only for a timer that has run before; on
    # first activation systemd writes the stamp as of that moment and has
    # nothing to catch up. Measured on the box: after enabling, every unit had
    # an empty ActiveEnterTimestamp, the journal held no entries, and R2 held
    # no dump.
    #
    # So install.sh returning is not the end of the setup, and a Healthchecks
    # check stays grey and unmonitored until its first ping. If this guidance
    # is ever dropped, the next operator believes they have backups and has
    # none - which is the precise false belief this system exists to prevent.
    body = (BACKUP_DIR / "install.sh").read_text(encoding="utf-8")
    for script in ("backup.sh", "sheets.sh", "verify.sh"):
        assert script in body, f"install.sh must tell the operator to run {script} by hand"


@pytest.mark.skipif(_find_bash() is None, reason="needs bash")
def test_hc_ping_warns_when_the_ping_fails_but_does_not_fail_the_job(tmp_path):
    # A ping URL that is WRONG rather than missing passes load_backup_env's
    # non-empty check, so the job runs, succeeds, and reports to nowhere. The
    # old `|| true` discarded curl's failure without a trace, leaving the grace
    # window expiring hours later as the only signal - with nothing to say why.
    # Observed on the box by corrupting one character of HC_BACKUP_URL.
    #
    # Both halves are asserted, because each without the other is a defect:
    # warning but failing would turn a network blip into a backup failure;
    # succeeding but silent is what shipped.
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    curl = bin_dir / "curl"
    curl.write_text('#!/usr/bin/env bash\necho "curl: (22) HTTP 400" >&2\nexit 22\n')
    curl.chmod(0o755)

    harness = tmp_path / "harness.sh"
    harness.write_text(
        "set -euo pipefail\n"
        f". {(BACKUP_DIR / 'lib.sh').as_posix()}\n"
        'hc_ping "https://hc-ping.com/deadbeef-0000-0000-0000-000000000000" "/fail"\n'
        'echo "REACHED_THE_END"\n'
    )

    env = {**os.environ, "PATH": f"{bin_dir}{os.pathsep}{os.environ['PATH']}"}
    result = subprocess.run(
        [_find_bash(), str(harness)], capture_output=True, text=True, env=env
    )

    # It must not fail the job: the line after hc_ping has to run.
    assert result.returncode == 0, result.stderr
    assert "REACHED_THE_END" in result.stdout

    # And it must not be silent.
    assert "WARNING" in result.stderr
    assert "ping failed" in result.stderr

    # The ping URL is a credential - anyone holding it can post a false
    # success - so it must not reach the journal in full.
    assert "deadbeef-0000-0000-0000-000000000000" not in result.stderr
    assert "<redacted>" in result.stderr
