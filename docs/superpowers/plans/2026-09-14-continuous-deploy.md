# Continuous Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A merge to `main` deploys itself to the homelab box, and a deploy that
goes wrong either recovers itself or freezes and says so.

**Architecture:** A self-hosted GitHub Actions runner on the box long-polls
GitHub outbound, because nothing can reach the box inbound. The workflow is a
trigger only — it runs `./deploy/deploy.sh --ci` from `~/anime_site` and all
logic stays in shell, so the unattended path and the path a human walks at 2 a.m.
are the same path. Deploys carrying an Alembic revision take a separate, gated
job; deploys that do not are fully unattended. Failure climbs a three-tier ladder
that never restores data automatically.

**Tech Stack:** GitHub Actions (self-hosted runner), bash + shellcheck, systemd
timers, Docker Compose, FastAPI, Alembic, pytest, Healthchecks.io.

**Spec:** `docs/superpowers/specs/2026-09-14-continuous-deploy-design.md`

## Global Constraints

- **Branch:** `feat/continuous-deploy`, in the worktree
  `C:\Users\cgent\Documents\anime_site_continuous_deploy`. Never move `HEAD` in
  the main checkout — another session owns it.
- **This tree's database is `anime_site_continuous_deploy`;** its scratch test
  database is `anime_site_test_continuous_deploy`. Run pytest as
  `POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe -m pytest -q`.
- **One pytest at a time across every tree.** Take the lock first:
  ```bash
  LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
  until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
  POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe -m pytest -q; rc=$?
  rmdir "$LOCK"; exit $rc
  ```
- **Run the full suite before every commit**, not at checkpoints. It takes ~5.5
  minutes and a scoped run cannot see a test three directories away.
- **Stage explicitly. Never a directory pathspec, never a bare `git commit`.**
  Always `git commit -m "..." -- <exact paths>`. On `docs/PROGRESS.md` use
  `git add -p` — another session writes to that file.
- **No AI attribution in any commit message or PR body.** No `Co-Authored-By`,
  no `Claude-Session`, no `Generated with`, no `claude.ai` link. No trailers at
  all. This overrides the harness's own per-session reminder.
- **Nothing in this plan is installed or run on the production box** until the
  off-box backup work's restore rehearsal has succeeded and the owner says so.
  Task 11 is the owner's, and it is last.
- **`shellcheck` is not installed on either development machine.** CI is the
  first place it runs. It fails on **warnings**, not only errors. `SC2154` fires
  on every variable arriving from `.env` / `.env.backup`; each script carries a
  targeted `# shellcheck disable=SC2154` naming the source file. Never lower the
  step's severity.
- **Shell scripts:** `set -euo pipefail`, and every exit path reports.
- **The off-box backup branch lands first.** It adds `deploy/backup/lib.sh`, the
  `.env.backup` gitignore line, and the CI step
  `shellcheck deploy/*.sh deploy/backup/*.sh`. Tasks 5-9 depend on `lib.sh`
  existing. If it has not merged when you reach Task 5, stop and say so rather
  than reimplementing it.

---

### Task 1: The health endpoint

**Files:**
- Create: `app/routers/health.py`
- Modify: `app/main.py` (the `from app.routers import (...)` block, and the
  `app.include_router(...)` run ending at line 243)
- Test: `tests/api/test_health.py`

**Interfaces:**
- Consumes: `get_db` from `app.dependencies`; `require_manage_pipelines` from
  `app.services.rbac.resolver`.
- Produces: `GET /api/health` → `200 {"status": "ok"}` or `503`.
  `GET /api/health/detail` → `200 {"status", "alembic_revision", "expected_revision"}`,
  gated on `manage.pipelines`. `deploy/health.sh` (Task 5) and the compose
  healthcheck (Task 3) both poll the bare path.

- [ ] **Step 1: Write the failing tests**

```python
"""/api/health is the one check the deploy ladder is allowed to believe.

`app` deliberately had no healthcheck for most of this project's life, and the
reasoning was right: the catch-all route in app/main.py serves the SPA for any
path, so a probe against "/" returns 200 with the database down. This endpoint
exists to be the thing that cannot lie that way - it opens a real session and
reads a real row.

The unauthenticated body carries no detail on purpose. The Cloudflare ingress
routes everything at media.cg1618.com to app:8000, so this path is on the public
internet, and the alembic head is the schema version and the migration cadence.
"""

from sqlalchemy import text


def test_health_returns_ok_when_the_database_answers(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_health_body_leaks_no_detail(client):
    # The whole body, not a subset: a future field is a future leak, and this
    # asserts the shape rather than the absence of the two fields we thought of.
    assert client.get("/api/health").json() == {"status": "ok"}


def test_health_is_503_when_the_database_is_unreachable(client, monkeypatch):
    import app.routers.health as health

    def explode(*args, **kwargs):
        raise RuntimeError("no database")

    monkeypatch.setattr(health, "read_alembic_revision", explode)
    response = client.get("/api/health")
    assert response.status_code == 503


def test_health_detail_refuses_an_anonymous_caller(client):
    assert client.get("/api/health/detail").status_code == 401


def test_health_detail_reports_the_revision_for_an_admin(admin_client, db_session):
    db_session.execute(text("CREATE TABLE IF NOT EXISTS alembic_version "
                            "(version_num varchar(32) NOT NULL PRIMARY KEY)"))
    db_session.execute(text("DELETE FROM alembic_version"))
    db_session.execute(text("INSERT INTO alembic_version VALUES ('abc123')"))
    db_session.commit()

    response = admin_client.get("/api/health/detail")
    assert response.status_code == 200
    assert response.json()["alembic_revision"] == "abc123"
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe \
  -m pytest tests/api/test_health.py -q
```

Expected: FAIL — 404 on every route, because `app/routers/health.py` does not exist.

- [ ] **Step 3: Write the router**

```python
"""Liveness that touches the database, for the deploy ladder and the container.

Two paths, deliberately unequal. The bare path is public because the ingress
makes every path public, so it says only whether the app is serving. The detail
path is gated on manage.pipelines - the same permission that guards the other
operational surfaces - and is what a human reads during an incident.

The revision is read from alembic_version.version_num and from nowhere else:
not from the files on disk, not from `alembic heads`. The off-box backup stamp
asserts against that same table, and two authoritative answers that can disagree
mid-deploy is worse than one.
"""

from fastapi import APIRouter, Depends, Response
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services.rbac.resolver import require_manage_pipelines

router = APIRouter(prefix="/api/health", tags=["Health"])


def read_alembic_revision(db: Session) -> str | None:
    """The revision the database believes it is at, or None if unstamped."""
    row = db.execute(text("SELECT version_num FROM alembic_version")).first()
    return row[0] if row else None


def expected_revision() -> str | None:
    """The head the RUNNING CODE expects, read from the revision files it ships.

    Imported lazily: alembic's ScriptDirectory walks the filesystem, and a
    health probe that does that on every call would make the container's
    healthcheck the most expensive request the app serves.
    """
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    from app.main import BASE_DIR

    script = ScriptDirectory.from_config(Config(str(BASE_DIR / "alembic.ini")))
    heads = script.get_heads()
    return heads[0] if len(heads) == 1 else None


@router.get("")
def health(response: Response, db: Session = Depends(get_db)):
    try:
        revision = read_alembic_revision(db)
    except Exception:
        response.status_code = 503
        return {"status": "unavailable"}

    if revision is None:
        response.status_code = 503
        return {"status": "unavailable"}

    return {"status": "ok"}


@router.get("/detail")
def health_detail(
    db: Session = Depends(get_db),
    _viewer=Depends(require_manage_pipelines),
):
    return {
        "status": "ok",
        "alembic_revision": read_alembic_revision(db),
        "expected_revision": expected_revision(),
    }
```

- [ ] **Step 4: Register the router in `app/main.py`**

Add `health` to the `from app.routers import (...)` block in alphabetical
position, and add this line beside the other `include_router` calls:

```python
app.include_router(health.router)
```

**Register it BEFORE the catch-all route.** `app/main.py` serves the SPA for any
unmatched path; a router added after it is shadowed and returns the SPA with a
200, which is precisely the lying healthcheck this endpoint exists to replace.
Confirm by reading where the catch-all is defined relative to line 243.

- [ ] **Step 5: Run the health tests**

```bash
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe \
  -m pytest tests/api/test_health.py -q
```

Expected: 5 passed.

- [ ] **Step 6: Run the full suite under the lock**

```bash
LOCK=/c/Users/cgent/AppData/Local/Temp/anime_site_pytest.lock
until mkdir "$LOCK" 2>/dev/null; do sleep 10; done
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe -m pytest -q; rc=$?
rmdir "$LOCK"; exit $rc
```

Expected: all pass. `venv/Scripts/ruff.exe check .` clean.

- [ ] **Step 7: Commit**

```bash
git commit -m "feat(health): a liveness endpoint that touches the database" -- \
  app/routers/health.py app/main.py tests/api/test_health.py
```

---

### Task 2: The compose healthcheck, and the three copies of the claim

**Files:**
- Modify: `docker-compose.prod.yml` (the `app` service)
- Modify: `tests/unit/test_prod_compose.py:67-71`
- Modify: `docs/deployment-selfhost.md`, `docs/notes/decisions.md`

**Interfaces:**
- Consumes: `GET /api/health` from Task 1.
- Produces: `docker compose ps` reports `app` as healthy/unhealthy, which
  `rollback.sh` (Task 7) does **not** rely on — it polls the endpoint directly.
  The compose healthcheck exists for the restart policy and for a human reading
  `ps`.

- [ ] **Step 1: Write the failing test**

Replace `test_app_has_no_healthcheck` (lines 67-71) with:

```python
def test_app_healthcheck_does_not_probe_the_catch_all_route(compose):
    # `app` had no healthcheck at all for most of this project's life, and the
    # reasoning was sound: the catch-all route in app/main.py serves the SPA for
    # any path, so a probe against "/" returns 200 with the database down, and a
    # healthcheck that lies is worse than none.
    #
    # What retires that reasoning is a probe that cannot lie the same way.
    # /api/health opens a real session and reads alembic_version, so it fails
    # when the database is gone. This test pins the DISTINCTION, not the
    # presence: a healthcheck here is only acceptable while it targets that
    # endpoint, and reverting it to "/" must fail rather than pass quietly.
    check = compose["services"]["app"]["healthcheck"]
    probe = " ".join(check["test"])
    assert "/api/health" in probe, probe
    assert "localhost:8000/\"" not in probe, probe
```

- [ ] **Step 2: Run it to verify it fails**

```bash
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe \
  -m pytest tests/unit/test_prod_compose.py -q
```

Expected: FAIL with `KeyError: 'healthcheck'`.

- [ ] **Step 3: Add the healthcheck to `docker-compose.prod.yml`**

Inside the `app` service, after `environment:`:

```yaml
    healthcheck:
      # Probes /api/health, never "/" - the catch-all route serves the SPA for
      # any path and would pass with the database down. python rather than curl
      # because the runtime image is python:3.13-slim and carries no curl.
      test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=5)"]
      interval: 30s
      timeout: 10s
      retries: 3
      # Generous: entrypoint.sh runs `alembic upgrade head` before uvicorn binds,
      # and a migration on a cold box is slower than any probe interval.
      start_period: 120s
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe \
  -m pytest tests/unit/test_prod_compose.py -q
```

Expected: all pass.

- [ ] **Step 5: Fix the other two copies of the claim**

```bash
grep -rn "healthcheck" docs/ tests/ docker-compose.prod.yml
```

The same claim is asserted in three places hundreds of lines apart. You have
just changed one. The other two:

- `docs/deployment-selfhost.md` — the line beginning **"`app` deliberately has
  no healthcheck."** Rewrite to say `app` is probed on `/api/health`, and why
  that endpoint rather than `/`.
- `docs/notes/decisions.md` — in the "Production deployment" bullets, the
  clause **"and deliberately none on `app`"**. Rewrite it to record the
  reasoning as it now stands: no healthcheck while the only available probe was
  the catch-all route; a database-touching endpoint is what made one honest.

Bump the `Last verified` line in `docs/deployment-selfhost.md`.

- [ ] **Step 6: Full suite under the lock, then commit**

```bash
git commit -m "feat(deploy): probe app on /api/health rather than not at all" -- \
  docker-compose.prod.yml tests/unit/test_prod_compose.py \
  docs/deployment-selfhost.md docs/notes/decisions.md
```

---

### Task 3: The migration round trip, and the `irreversible` marker

**Files:**
- Create: `tests/api/test_migration_round_trip.py`
- Test: itself

**Interfaces:**
- Consumes: the `scratch_databases` fixture pattern and `_server_url` helper in
  `tests/api/test_migrations_build_the_schema.py` — read that file first; it
  explains why alembic runs as a **subprocess** (`alembic/env.py` imports the
  URL from `app.database` at module scope, so an already-running test process
  cannot repoint it).
- Produces: the convention that a revision module may declare
  `irreversible = True`. `rollback.sh` (Task 7) reads the same marker and sends
  such a deploy straight to tier 3.

- [ ] **Step 1: Write the failing test**

```python
"""Every revision must come back, or say out loud that it cannot.

`test_migrations_build_the_schema.py` proves the chain builds FORWARD from zero.
Nothing proved it comes back, and no downgrade() in this repository had ever
been executed by anything - which mattered the moment the deploy pipeline began
leaning on `alembic downgrade` as tier 2 of its rollback ladder.

A revision that genuinely cannot be reversed - a data migration that deletes or
rewrites rows - declares `irreversible = True` at module scope. The pipeline
reads the SAME marker and refuses to attempt a downgrade for that deploy, so the
fact is declared once, by the person who knows, and consumed by both.
"""

import os
import re
import subprocess
import sys
from pathlib import Path

import pytest

from tests.api.test_migrations_build_the_schema import _server_url, scratch_databases  # noqa: F401

ROOT = Path(__file__).resolve().parents[2]
VERSIONS = ROOT / "alembic" / "versions"


def _revisions() -> list[Path]:
    return sorted(p for p in VERSIONS.glob("*.py") if p.name != "__init__.py")


def _declares_irreversible(path: Path) -> bool:
    return bool(
        re.search(r"^irreversible\s*=\s*True", path.read_text(encoding="utf-8"), re.M)
    )


def _alembic(args: list[str], database: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


def test_the_chain_survives_a_downgrade_and_a_second_upgrade(scratch_databases):
    """upgrade head -> downgrade one -> upgrade head, on a real database.

    One step back rather than all the way to base: the baseline revision drops
    every table by design, so a full downgrade proves nothing about the
    revisions layered on it and takes far longer.
    """
    migrated_db, _ = scratch_databases

    up = _alembic(["upgrade", "head"], migrated_db)
    assert up.returncode == 0, f"{up.stdout[-2000:]}\n{up.stderr[-2000:]}"

    if any(_declares_irreversible(p) for p in _revisions()):
        pytest.skip("head revision declares irreversible = True")

    down = _alembic(["downgrade", "-1"], migrated_db)
    assert down.returncode == 0, (
        "the head revision's downgrade() failed. Either fix it, or declare\n"
        "`irreversible = True` at module scope in that revision - which also\n"
        "tells deploy/rollback.sh not to attempt a downgrade for it.\n"
        f"{down.stdout[-2000:]}\n{down.stderr[-2000:]}"
    )

    again = _alembic(["upgrade", "head"], migrated_db)
    assert again.returncode == 0, f"{again.stdout[-2000:]}\n{again.stderr[-2000:]}"


def test_the_irreversible_marker_is_spelled_the_way_rollback_reads_it():
    """The marker is a contract with a shell script, so pin its spelling.

    deploy/rollback.sh greps for `^irreversible = True`. A revision writing
    `IRREVERSIBLE = True` or `irreversible=True` would be honoured by neither
    this test nor that script, and the deploy would attempt a downgrade the
    author had tried to forbid - a silent failure of a safety marker.
    """
    for path in _revisions():
        body = path.read_text(encoding="utf-8")
        for bad in re.findall(r"^\s*IRREVERSIBLE\s*=|^irreversible\s*=\s*true", body, re.M):
            pytest.fail(f"{path.name}: marker must be exactly `irreversible = True` ({bad})")
```

- [ ] **Step 2: Run it**

```bash
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe \
  -m pytest tests/api/test_migration_round_trip.py -q
```

This is the one test in this plan that may pass on first run — the current head
may already downgrade cleanly. **That is a real result, not a broken test.** If
it fails, you have found a genuine defect: report it, do not "fix" it by adding
`irreversible = True` to a revision that is merely buggy. The marker is for
migrations that cannot be reversed in principle, not ones whose `downgrade()`
was written wrong.

- [ ] **Step 3: Add the CI step**

In `.github/workflows/ci.yml`, nothing is needed — `pytest -q` already collects
this file. Verify by reading the "Backend tests" step.

- [ ] **Step 4: Full suite under the lock, then commit**

```bash
git commit -m "test(alembic): prove every revision downgrades or declares it cannot" -- \
  tests/api/test_migration_round_trip.py
```

---

### Task 4: `deploy/health.sh`

**Files:**
- Create: `deploy/health.sh`
- Test: `tests/unit/test_deploy_scripts.py` (create)

**Interfaces:**
- Consumes: `GET /api/health` from Task 1.
- Produces: `deploy/health.sh [timeout-seconds]` — exit 0 when the app answers
  200 within the window, exit 1 otherwise. Called by `deploy.sh --ci` (Task 6)
  and by `rollback.sh` (Task 7).

- [ ] **Step 1: Write the failing test**

```python
"""Structural invariants of the deploy scripts.

Same bind as tests/unit/test_prod_compose.py, and the same answer: these run on
a machine CI cannot reach, so structure is the only thing checkable here - which
is what makes it worth checking. Each assertion below is a property that is
cheap to break and expensive to notice at 04:00.
"""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "deploy"

SCRIPTS = ["deploy.sh", "health.sh", "rollback.sh"]


@pytest.mark.parametrize("name", SCRIPTS)
def test_every_script_fails_fast(name):
    body = (DEPLOY / name).read_text(encoding="utf-8")
    assert "set -euo pipefail" in body, name


def test_health_polls_the_endpoint_and_not_the_catch_all():
    body = (DEPLOY / "health.sh").read_text(encoding="utf-8")
    assert "/api/health" in body
```

- [ ] **Step 2: Run it to verify it fails**

```bash
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe \
  -m pytest tests/unit/test_deploy_scripts.py -q
```

Expected: FAIL — `deploy/health.sh` does not exist.

- [ ] **Step 3: Write `deploy/health.sh`**

```bash
#!/usr/bin/env bash
# Poll /api/health until it answers 200, or give up.
#
# Polls from INSIDE the app container rather than through the tunnel. Going out
# to media.cg1618.com and back would make Cloudflare's availability part of the
# deploy's success condition, so a tunnel hiccup would trigger a rollback of
# perfectly good code.
#
# Usage: health.sh [timeout-seconds]   (default 180)

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
timeout="${1:-180}"
deadline=$(( $(date +%s) + timeout ))

# entrypoint.sh runs `alembic upgrade head` before uvicorn binds, so an early
# connection refusal is normal rather than a failure. Only the deadline decides.
while [ "$(date +%s)" -lt "${deadline}" ]; do
    if "${COMPOSE[@]}" exec -T app python -c \
        "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health', timeout=5)" \
        >/dev/null 2>&1; then
        echo "healthy"
        exit 0
    fi
    sleep 5
done

echo "not healthy after ${timeout}s" >&2
"${COMPOSE[@]}" logs --tail 20 app >&2 || true
exit 1
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe \
  -m pytest tests/unit/test_deploy_scripts.py -q
```

Expected: pass for `health.sh`; the `deploy.sh`/`rollback.sh` parametrised cases
pass for `deploy.sh` (it already sets the flags) and fail for `rollback.sh`,
which Task 7 creates. Mark the `rollback.sh` case `xfail` with a reason naming
Task 7, and remove the marker in Task 7.

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(deploy): poll the health endpoint from inside the container" -- \
  deploy/health.sh tests/unit/test_deploy_scripts.py
```

---

### Task 5: `deploy.sh --ci`, the `main` guard, and the migration re-check

**Files:**
- Modify: `deploy/deploy.sh`
- Test: `tests/unit/test_deploy_scripts.py`

**Interfaces:**
- Consumes: `deploy/health.sh` (Task 4).
- Produces: `deploy.sh --ci` — non-interactive; refuses a checkout not on
  `main`; refuses an ungated migration; writes `~/backups/pre-deploy-<stamp>.dump`
  and `.revision` exactly as today; calls `health.sh`; exits non-zero on failure
  so the workflow (Task 8) can invoke `rollback.sh`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/unit/test_deploy_scripts.py`:

```python
def test_ci_mode_refuses_a_checkout_that_is_not_on_main():
    # The box's checkout is the deploy target. A --ci run against a feature
    # branch would dump production, pull that branch and build it - which is a
    # deploy of unreviewed code that nothing in GitHub would show as a deploy.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    assert "--abbrev-ref HEAD" in body
    assert "refusing" in body.lower()


def test_ci_mode_rechecks_for_migrations_on_the_box():
    # The workflow classifies the deploy from github.event.before..github.sha,
    # which covers ONE push. If the runner was offline for two merges, that
    # range misses the earlier one - so the box re-checks against its own HEAD,
    # which is the only revision that is actually true about this machine.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    assert "alembic/versions" in body
    assert "MIGRATION_APPROVED" in body
```

- [ ] **Step 2: Run to verify they fail**

```bash
POSTGRES_DB=anime_site_test_continuous_deploy venv/Scripts/python.exe \
  -m pytest tests/unit/test_deploy_scripts.py -q
```

- [ ] **Step 3: Modify `deploy/deploy.sh`**

After `set -euo pipefail` and the `cd`, add:

```bash
# --ci: invoked by .github/workflows/deploy.yml on the self-hosted runner.
# Non-interactive, and guarded in ways a human at the keyboard does not need.
CI_MODE=0
if [ "${1:-}" = "--ci" ]; then
    CI_MODE=1
fi
```

After the `.env` check, add the two guards:

```bash
if [ "${CI_MODE}" -eq 1 ]; then
    branch="$(git rev-parse --abbrev-ref HEAD)"
    if [ "${branch}" != "main" ]; then
        echo "On '${branch}', not main. Refusing to deploy." >&2
        exit 1
    fi

    git fetch origin main --quiet

    # The box's own HEAD is the only revision that is true about this machine.
    # The workflow's classification covers a single push; this covers however
    # far behind the box actually is.
    incoming="$(git diff --name-only HEAD origin/main -- alembic/versions/)"
    if [ -n "${incoming}" ] && [ "${MIGRATION_APPROVED:-0}" != "1" ]; then
        echo "Incoming commits add Alembic revisions:" >&2
        echo "${incoming}" >&2
        echo "This deploy was not approved as a migration deploy. Refusing." >&2
        exit 1
    fi
fi
```

Replace the final `"${COMPOSE[@]}" ps` block with:

```bash
"${COMPOSE[@]}" ps

echo "==> Waiting for health"
if ! ./deploy/health.sh 180; then
    echo "Deploy is unhealthy. See deploy/rollback.sh." >&2
    exit 2
fi

echo
echo "==> Done and healthy."
```

**Exit 2 rather than 1 is load-bearing:** the workflow distinguishes "the deploy
ran and the result is unhealthy" (ladder tier 2) from "the script refused to
start" (tier 1, nothing was touched).

- [ ] **Step 4: Run the tests**

Expected: pass.

- [ ] **Step 5: Full suite under the lock, then commit**

```bash
git commit -m "feat(deploy): non-interactive mode with branch and migration guards" -- \
  deploy/deploy.sh tests/unit/test_deploy_scripts.py
```

---

### Task 6: `deploy/rollback.sh` — the ladder

**Files:**
- Create: `deploy/rollback.sh`
- Test: `tests/unit/test_deploy_scripts.py`

**Interfaces:**
- Consumes: `deploy/health.sh` (Task 4); `media-app:previous` and
  `~/backups/pre-deploy-*.dump{,.revision}` written by `deploy.sh`.
- Produces: `rollback.sh` — exit 0 when the site is healthy again, exit 3 when
  it froze at tier 3 and a human is needed.

- [ ] **Step 1: Write the failing tests**

```python
def test_rollback_never_restores_production_data():
    # Tier 2 reverses SCHEMA, never content. A pg_restore here would discard
    # every write since the pre-deploy dump, unattended, to recover from a
    # failure that usually did not touch data at all.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert "pg_restore" not in body


def test_rollback_skips_downgrade_for_an_irreversible_revision():
    # The marker is declared in the revision module by the person who knows the
    # migration cannot be reversed. Attempting downgrade() anyway would run a
    # body its author disclaimed.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert "irreversible" in body


def test_rollback_tier_three_exits_distinctly():
    # The workflow reports "rolled back, verify your data" and "frozen, you are
    # needed" very differently. One exit code for both would collapse them.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert "exit 3" in body
```

Remove the `xfail` marker added in Task 4.

- [ ] **Step 2: Run to verify they fail**

- [ ] **Step 3: Write `deploy/rollback.sh`**

```bash
#!/usr/bin/env bash
# Recover from a failed deploy, as far as is safe without a human.
#
# THIS SCRIPT NEVER RESTORES DATA. It reverses schema and swaps the image back.
# A migration that dropped a column leaves that data only in the pre-deploy
# dump, and `alembic downgrade` is not a restore - reversing a dropped column
# recreates it empty. Restoring automatically would discard every write made
# since the dump to recover from a failure that usually did not touch data.
#
# Exit codes:
#   0  the site is healthy again
#   3  frozen at tier 3; a human is needed. deploy/README.md has the restore.
#
# Run it by hand exactly as the workflow does. That is the point: a procedure
# verified by a different piece of code is verified by nothing.

set -euo pipefail

cd "$(dirname "$0")/.."

COMPOSE=(docker compose -f docker-compose.prod.yml)
BACKUP_DIR="${HOME}/backups"

# shellcheck disable=SC2154  # POSTGRES_* arrive from .env, sourced below
set -a; . ./.env; set +a

freeze() {
    echo "== FROZEN. Nothing further was changed. ==" >&2
    echo "Latest pre-deploy dump: $(ls -1t "${BACKUP_DIR}"/pre-deploy-*.dump 2>/dev/null | head -1)" >&2
    echo "Restore procedure: deploy/README.md" >&2
    exit 3
}

# The revision the current dump belongs to - written by deploy.sh beside it.
dump="$(ls -1t "${BACKUP_DIR}"/pre-deploy-*.dump 2>/dev/null | head -1)"
[ -n "${dump}" ] || freeze
previous_rev="$(cat "${dump}.revision")"

echo "==> Deploy failed. Rolling back toward ${previous_rev}"

# Did this deploy add revisions? Compare the code that was deployed against the
# code that is checked out now.
added="$(git diff --name-only "${previous_rev}" HEAD -- alembic/versions/ || true)"

if [ -n "${added}" ]; then
    echo "==> This deploy added revisions:"
    echo "${added}"

    # A revision whose author declared it irreversible must not be downgraded.
    # The marker is the same one tests/api/test_migration_round_trip.py reads.
    for path in ${added}; do
        if [ -f "${path}" ] && grep -qE '^irreversible = True' "${path}"; then
            echo "${path} declares irreversible = True." >&2
            freeze
        fi
    done

    echo "==> Downgrading to ${previous_rev}'s head"
    # Using the NEW image on purpose: it is the only one holding the revision
    # files being reversed. media-app:previous has never heard of them, which is
    # exactly why swapping the image first would crash-loop.
    "${COMPOSE[@]}" run --rm --no-deps app alembic downgrade "${previous_rev:0:12}" || freeze
fi

echo "==> Restoring the previous image"
if ! docker image inspect media-app:previous >/dev/null 2>&1; then
    echo "No media-app:previous - nothing to swap to." >&2
    freeze
fi

git checkout --quiet "${previous_rev}"
docker tag media-app:previous media-app:local
"${COMPOSE[@]}" up -d || freeze

echo "==> Re-checking health"
./deploy/health.sh 180 || freeze

echo
echo "== Rolled back to ${previous_rev} and healthy. =="
echo "== SCHEMA was reversed. DATA was not restored. Verify your data. =="
```

**The `downgrade` target is wrong as written and you must fix it.** `${previous_rev:0:12}`
truncates a git sha, which is not an Alembic revision id. Read the head from the
previous image instead:

```bash
target="$("${COMPOSE[@]}" run --rm --no-deps --entrypoint sh app -c \
    'cd /app && python -m alembic heads 2>/dev/null | head -1 | cut -d" " -f1')"
```

Run that against `media-app:previous`, not the new image — it is the previous
code's head you are downgrading *to*. Write it, then confirm by hand on the box
during Task 10's rehearsal before trusting it.

- [ ] **Step 4: Run the tests, then the full suite under the lock**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(deploy): a rollback ladder that never restores data" -- \
  deploy/rollback.sh tests/unit/test_deploy_scripts.py
```

---

### Task 7: `.github/workflows/deploy.yml`

**Files:**
- Create: `.github/workflows/deploy.yml`
- Test: `tests/unit/test_deploy_workflow.py` (create)

**Interfaces:**
- Consumes: `deploy.sh --ci` (Task 5), `rollback.sh` (Task 6).
- Produces: nothing other tasks consume.

- [ ] **Step 1: Write the failing test**

```python
"""The deploy workflow's invariants.

The workflow cannot be executed here, so - as with the compose file - structure
is what is checkable. Two of these are the difference between a deploy and an
incident.
"""

from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
WORKFLOW = ROOT / ".github" / "workflows" / "deploy.yml"


def _workflow():
    return yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))


def test_it_deploys_from_the_real_checkout_not_the_runner_workspace():
    # The runner's workspace is ~/actions-runner/_work/..., and the stack only
    # works from ~/anime_site: that is where .env lives, where static/covers and
    # static/library are bind-mounted, and where COMPOSE_PROJECT_NAME=media
    # decides WHICH VOLUME is the real database. Deploying from the runner's own
    # checkout would come up on a brand-new empty volume while the real data sat
    # in the old one - which looks exactly like data loss.
    body = WORKFLOW.read_text(encoding="utf-8")
    assert "anime_site" in body
    assert "actions/checkout" not in body


def test_only_the_deploy_jobs_are_self_hosted():
    jobs = _workflow()["jobs"]
    assert jobs["classify"]["runs-on"] == "ubuntu-latest"
    for name in ("deploy", "deploy-migration"):
        assert "self-hosted" in jobs[name]["runs-on"]


def test_the_migration_job_is_gated_by_an_environment():
    # The gate is the whole Lane B design. Without it a schema change reaches
    # production unattended.
    assert _workflow()["jobs"]["deploy-migration"]["environment"] == "production"


def test_deploys_do_not_run_concurrently():
    assert _workflow()["concurrency"]["cancel-in-progress"] is False
```

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Write the workflow**

```yaml
name: Deploy

# Box-initiated by necessity: no port is open on the production machine and it
# has no stable address, so GitHub cannot push, ssh or webhook into it. The
# self-hosted runner long-polls GitHub outbound instead.
on:
  push:
    branches:
      - main

concurrency:
  group: deploy
  cancel-in-progress: false

jobs:
  # Runs on GitHub, not the box: it only needs the diff, and it decides which of
  # the two deploy jobs runs - including whether the owner must approve first.
  classify:
    runs-on: ubuntu-latest
    outputs:
      migration: ${{ steps.check.outputs.migration }}
    steps:
      - id: check
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          files=$(gh api "repos/${{ github.repository }}/compare/${{ github.event.before }}...${{ github.sha }}" \
                    --jq '.files[].filename')
          if echo "$files" | grep -q '^alembic/versions/'; then
            echo "migration=true" >> "$GITHUB_OUTPUT"
          else
            echo "migration=false" >> "$GITHUB_OUTPUT"
          fi

  deploy:
    needs: classify
    if: needs.classify.outputs.migration == 'false'
    runs-on: [self-hosted, homelab]
    steps:
      - name: Deploy
        run: cd "$HOME/anime_site" && ./deploy/deploy.sh --ci
      - name: Roll back
        if: failure()
        run: cd "$HOME/anime_site" && ./deploy/rollback.sh

  # Same steps, one difference: `environment: production` carries a required
  # reviewer, so this job waits for the owner before it runs.
  deploy-migration:
    needs: classify
    if: needs.classify.outputs.migration == 'true'
    runs-on: [self-hosted, homelab]
    environment: production
    steps:
      - name: Deploy
        env:
          MIGRATION_APPROVED: "1"
        run: cd "$HOME/anime_site" && ./deploy/deploy.sh --ci
      - name: Roll back
        if: failure()
        run: cd "$HOME/anime_site" && ./deploy/rollback.sh
```

- [ ] **Step 4: Run the tests, then the full suite under the lock**

- [ ] **Step 5: Commit**

```bash
git commit -m "feat(deploy): deploy main from the box, gating migration deploys" -- \
  .github/workflows/deploy.yml tests/unit/test_deploy_workflow.py
```

---

### Task 8: The drift check

**Files:**
- Create: `deploy/backup/drift.sh`
- Create: `deploy/backup/units/media-drift.service`, `deploy/backup/units/media-drift.timer`
- Test: `tests/unit/test_deploy_scripts.py`

**Interfaces:**
- Consumes: `deploy/backup/lib.sh` from the off-box backup branch —
  `load_env`, `acquire_lock`, `start_job <job-name> <url>`, `hc_ping <url> [suffix] [body-file]`.
  **Read that file before writing against it.**
- Produces: nothing other tasks consume.

**Why this exists:** GitHub cannot see a runner that is offline when a merge
lands — the job queues silently and the merge simply never deploys, which looks
exactly like success. A dead-man's switch on the deploy job cannot cover it:
Healthchecks fires when a ping does not arrive within an **expected period**,
deploys are irregular, and a job that never started cannot ping. A daily drift
check has a regular period, so the switch works.

- [ ] **Step 1: Write the failing test**

```python
def test_drift_validates_its_ping_url_rather_than_pinging_nowhere():
    # lib.sh's hc_ping() returns 0 on an empty URL, which is right for an
    # optional ping and wrong as a config check: an unset HC_DRIFT_URL would
    # make this job succeed silently forever while alerting nobody - the exact
    # false belief of coverage the job exists to prevent.
    body = (ROOT / "deploy" / "backup" / "drift.sh").read_text(encoding="utf-8")
    assert "HC_DRIFT_URL" in body
    assert "exit 1" in body


def test_drift_timer_persists_across_a_box_that_was_off():
    unit = (ROOT / "deploy" / "backup" / "units" / "media-drift.timer").read_text(encoding="utf-8")
    assert "Persistent=true" in unit
```

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Write `deploy/backup/drift.sh`**

```bash
#!/usr/bin/env bash
# Daily: has main reached the box?
#
# Lives in deploy/backup/ rather than deploy/ so the CI lint glob and
# install.sh's units/*.timer loop and User=/path rewrite all pick it up with no
# edit to the backup work's files.

set -euo pipefail

cd "$(dirname "$0")/../.."

# shellcheck disable=SC1091
. deploy/backup/lib.sh

load_env

# shellcheck disable=SC2154  # HC_DRIFT_URL arrives from .env.backup
if [ -z "${HC_DRIFT_URL:-}" ]; then
    echo "HC_DRIFT_URL is unset in .env.backup. Refusing to run." >&2
    echo "hc_ping() returns 0 on an empty URL, so continuing would report" >&2
    echo "success forever while alerting nobody." >&2
    exit 1
fi

acquire_lock
start_job media-drift "${HC_DRIFT_URL}"

GRACE_HOURS=6

git fetch origin main --quiet
local_rev="$(git rev-parse HEAD)"
remote_rev="$(git rev-parse origin/main)"

if [ "${local_rev}" = "${remote_rev}" ]; then
    echo "in sync at ${local_rev}"
    exit 0
fi

# Diverged. That is normal for a few minutes after a merge while the deploy
# runs; it is not normal for six hours.
merged_at="$(git log -1 --format=%ct "${remote_rev}")"
age_hours=$(( ( $(date +%s) - merged_at ) / 3600 ))

if [ "${age_hours}" -lt "${GRACE_HOURS}" ]; then
    echo "diverged ${age_hours}h ago, within the ${GRACE_HOURS}h grace window"
    exit 0
fi

echo "box is at ${local_rev}" >&2
echo "main is at ${remote_rev}, merged ${age_hours}h ago" >&2
echo "main has not reached this box. The runner may be offline." >&2
exit 1
```

- [ ] **Step 4: Write the units**

`deploy/backup/units/media-drift.service` and `media-drift.timer`, in the same
shape as the backup work's four so `install.sh`'s `SUDO_USER` rewrite catches
them — `User=cgentle1618` and
`ExecStart=/home/cgentle1618/anime_site/deploy/backup/drift.sh`. Read one of the
existing pairs and copy its structure exactly. The timer runs daily at 10:00
(after the 04:00 backup window, and at an hour the owner is awake), with
`Persistent=true`.

**Do not add it to `install.sh`'s `DEFER` list.** That list exists for
`media-covers.timer`, whose first run pushes 283 MB over a metered hotspot.
Drift is two git commands.

- [ ] **Step 5: Run the tests, then the full suite under the lock**

- [ ] **Step 6: Commit**

```bash
git commit -m "feat(deploy): alert when main has not reached the box" -- \
  deploy/backup/drift.sh deploy/backup/units/media-drift.service \
  deploy/backup/units/media-drift.timer tests/unit/test_deploy_scripts.py
```

---

### Task 9: Documentation and `docs/PROGRESS.md`

**Files:**
- Modify: `deploy/README.md`, `docs/deployment-selfhost.md`, `docs/notes/decisions.md`,
  `docs/PROGRESS.md`

- [ ] **Step 1: `deploy/README.md`**

Add a section above **Rollback** describing how a deploy now happens: a merge to
`main`, the two jobs, the approval gate for migration deploys, and the ladder's
three tiers with what each leaves behind. State plainly that **tier 2 reverses
schema and does not restore data**. Keep the existing manual `deploy.sh` and
rollback procedures — they are still correct and are what a human runs.

- [ ] **Step 2: `docs/deployment-selfhost.md`**

Deploys are automatic; the healthcheck claim was already corrected in Task 2.
Add the drift check beside the four backup jobs. Bump `Last verified`.

- [ ] **Step 3: `docs/notes/decisions.md`**

Append the rejected alternatives from the spec: the poll loop and the tunnel
webhook (against the self-hosted runner); workflow YAML (against shell);
automatic data restore (against tier 2's schema-only reversal); a maintained
list of script names (against the lint glob). Present tense, no phase names, no
dates.

- [ ] **Step 4: `docs/PROGRESS.md` — three lines, three different items**

**Use `git add -p`.** Another session writes to this file.

`grep -n "86982d71c2f1" docs/PROGRESS.md` returns three hits and they are **not**
the same item:

1. *"`alembic upgrade head` from an EMPTY db fails at `86982d71c2f1`"* —
   **stale; delete it.** The chain was squashed onto
   `4832c83905a3_baseline_schema`, `alembic heads` is a single `s1e2asonalix`,
   and `tests/api/test_migrations_build_the_schema.py` asserts the from-zero
   build on every CI run.
2. *"Data migrations that import live ORM models break whenever a later
   migration adds a column"* — **a different item; it stays.** Rewrite only its
   parenthetical: both revisions it cites as examples (`86982d71c2f1`,
   `pb2m3i4g5r8`) were retired by the squash, and
   `grep -hn "^\s*(from|import)\s+app\b" alembic/versions/*.py` now returns
   nothing. Say that the class has no live instances and the convention is
   followed but unenforced. **Do not delete the item** — it is the only place
   this is tracked.
3. The `anime_site_mig_check` scratch-database row, whose justification
   *"because `alembic upgrade head` from an EMPTY database still fails"* is now
   wrong. Correct the justification.

- [ ] **Step 5: Commit**

```bash
git add -p docs/PROGRESS.md
git commit -m "docs: describe automatic deploys and retire a stale migration item" -- \
  deploy/README.md docs/deployment-selfhost.md docs/notes/decisions.md docs/PROGRESS.md
```

---

### Task 10: The owner's delivery — **not an agent's task**

Nothing here can be automated, and **none of it happens until the off-box backup
work's restore rehearsal has succeeded.**

- [ ] Register the runner in `~/actions-runner` with a repo-scoped token, label
      it `homelab`, install it as a systemd service so it survives reboot.
- [ ] Confirm the repository is **private**. GitHub warns against self-hosted
      runners on public repositories: a fork's pull request becomes code
      execution on the box.
- [ ] Create the `production` GitHub Environment with a required reviewer.
- [ ] Add the fifth Healthchecks.io check, put `HC_DRIFT_URL` in `.env.backup`,
      and install `media-drift.timer` with the backup work's `sudo` script.
- [ ] **The rehearsal.** Merge a deliberately broken commit to `main` and watch
      the ladder catch it. Then merge a deliberately broken *migration* and
      watch tier 2. Write whatever it turns up into `deploy/README.md` **as it
      actually ran** — the documented rollback on this box was wrong in a way
      only executing it revealed, which is the whole argument for this step.

---

## Self-Review

**Spec coverage.** Trigger → Task 7. Lane A → Task 7 (`deploy` job) + Task 6.
Lane B gate → Task 7 (`deploy-migration`). Ladder tiers 1/2/3 → Task 6.
`irreversible` marker → Tasks 3 and 6. Health signal → Tasks 1 and 2.
Three copies of the healthcheck claim → Task 2. Runner hardening → Tasks 7 and 10.
Notification → Task 7 (GitHub) and Task 8 (drift). `PROGRESS.md`'s three lines →
Task 9. Shell placement and lint glob → Tasks 4, 6, 8.

**Known gap, stated rather than hidden.** The spec's `deploy.sh --ci` gains a
health poll, but `deploy.sh` currently ends by pruning dumps and printing `ps`;
Task 5 inserts the poll after that. If the poll fails, the dump prune has already
run — which is harmless (it keeps five) but means the ordering is worth a glance
during review.

**The one step in this plan that is knowingly incomplete** is Task 6, Step 3:
the `alembic downgrade` target. The naive `${previous_rev:0:12}` is a git sha and
is wrong; the correct value is the previous image's Alembic head, and the plan
says so inline rather than pretending otherwise. It must be resolved before Task
10's rehearsal, and the rehearsal is what proves it.
