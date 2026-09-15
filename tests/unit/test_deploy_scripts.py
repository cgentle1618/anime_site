"""Structural invariants of the deploy scripts.

Same bind as tests/unit/test_prod_compose.py and tests/unit/test_backup_scripts.py,
and the same answer: these run on a machine CI cannot reach, so structure is the
only thing checkable here - which is exactly what makes it worth checking.

Each assertion below is a property that is cheap to break, invisible in review,
and expensive at the moment it matters, which for these scripts is a failed
deploy with nobody watching.
"""

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
DEPLOY = ROOT / "deploy"

SCRIPTS = ["deploy.sh", "health.sh", "rollback.sh"]


def code(name: str) -> str:
    """The script with comment lines removed.

    These scripts carry long comments that quote the very strings the
    assertions below look for - "media.cg1618.com" in the note explaining why
    the probe does NOT use it, "alembic downgrade" in the note explaining what
    it is not. Searching the raw text finds the prose and passes, or finds the
    prose and fails, in both cases saying nothing about the code.

    Both halves happened while writing this file, which is the same failure this
    project has now hit three times: a loose search matching a comment that
    means the opposite of the match.
    """
    lines = (DEPLOY / name).read_text(encoding="utf-8").splitlines()
    return "\n".join(line for line in lines if not line.lstrip().startswith("#"))


@pytest.mark.parametrize("name", SCRIPTS)
def test_every_script_fails_fast(name):
    # Without -e a failing step is skipped past and the script exits 0, which
    # for rollback.sh means reporting a recovery that did not happen.
    assert "set -euo pipefail" in (DEPLOY / name).read_text(encoding="utf-8"), name


def test_health_probes_the_endpoint_and_not_the_catch_all():
    # "/" returns 200 with the database down, because the catch-all route serves
    # the SPA for any path. A probe against it is the lying healthcheck this
    # whole endpoint exists to replace, and the difference is one path segment.
    body = (DEPLOY / "health.sh").read_text(encoding="utf-8")
    assert "/api/health" in body


def test_health_probes_from_inside_the_container():
    # Going out through the tunnel would make Cloudflare's availability part of
    # the deploy's success condition, so a tunnel hiccup would roll back
    # perfectly good code - and the tunnel is the one thing a deploy cannot fix.
    body = code("health.sh")
    assert "exec -T app" in body
    assert "media.cg1618.com" not in body


def test_ci_mode_refuses_a_checkout_that_is_not_on_main():
    # deploy.sh pulls whatever branch is checked out rather than naming one, so
    # the branch is the whole of the decision about what production runs. The
    # box was cloned from dev once already, which is how it spent its early life
    # running unreleased code.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    assert "--abbrev-ref HEAD" in body
    assert 'Refusing to deploy' in body


def test_ci_mode_rechecks_for_migrations_against_the_box_head():
    # The workflow classifies from one push range; if the runner was offline
    # across two merges that range misses the earlier one. Only the box's own
    # HEAD is true about the box.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    assert "alembic/versions" in body
    assert "MIGRATION_APPROVED" in body


def test_deploy_records_the_schema_revision_beside_the_dump():
    # rollback.sh's downgrade target. A git sha is not an alembic revision id,
    # so it has to be recorded from the database rather than derived afterwards.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    assert "alembic_version" in body
    assert "${dump}.alembic" in body


def test_deploy_prunes_every_file_it_writes_beside_a_dump():
    # The prune deletes old dumps to keep five. A sidecar left behind by the
    # prune is a file naming a downgrade target for a dump that no longer
    # exists - which reads as a usable rollback option and is not one.
    body = (DEPLOY / "deploy.sh").read_text(encoding="utf-8")
    prune = body[body.index("Pruning dumps") :]
    for sidecar in (".revision", ".alembic"):
        assert f'"${{old}}{sidecar}"' in prune, sidecar


def test_deploy_exits_distinctly_when_unhealthy():
    # The workflow must tell "the deploy ran and is unhealthy" - where the
    # database may be migrated and rollback.sh must run - from "the script
    # refused to start", where nothing was touched and rolling back would be
    # wrong. One exit code for both would collapse them.
    assert "exit 2" in (DEPLOY / "deploy.sh").read_text(encoding="utf-8")


def test_rollback_never_restores_production_data():
    # Tier 2 reverses SCHEMA, never content. A pg_restore here would discard
    # every write since the pre-deploy dump, unattended, to recover from a
    # failure that usually did not touch data at all. That trade is a human's.
    assert "pg_restore" not in (DEPLOY / "rollback.sh").read_text(encoding="utf-8")


def test_rollback_refuses_to_downgrade_an_irreversible_revision():
    # The marker is declared by the person who knows the migration cannot be
    # reversed. Running downgrade() anyway would execute a body its author
    # disclaimed. The literal spelling is pinned by
    # tests/api/test_migration_round_trip.py, on the other side of the contract.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert "^irreversible = True$" in body


def test_rollback_downgrades_from_the_new_image():
    # media-app:previous does not contain the revision files being reversed, so
    # swapping the image first crash-loops: entrypoint.sh's `alembic upgrade
    # head` cannot locate a revision its own files do not hold. Verified against
    # a scratch database - the error is "Can't locate revision identified by".
    downgrade_line = next(
        line for line in code("rollback.sh").splitlines() if "alembic downgrade" in line
    )
    assert "run --rm --no-deps app" in downgrade_line, downgrade_line


def test_rollback_takes_its_target_from_the_recorded_file():
    # Not from the git sha, and not from asking an image for its head - the
    # first is a different namespace, the second answers what the image KNOWS
    # rather than what the schema WAS, and those diverge exactly when a rollback
    # is happening.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert 'target="$(cat "${dump}.alembic")"' in body


def test_rollback_freezes_with_a_distinct_exit_code():
    # "Rolled back, verify your data" and "frozen, you are needed" are reported
    # to the owner very differently.
    assert "exit 3" in (DEPLOY / "rollback.sh").read_text(encoding="utf-8")


def test_rollback_tells_the_owner_data_was_not_restored():
    # The single most dangerous thing this pipeline could do is report a
    # successful rollback in a way that implies the data came back with it.
    body = (DEPLOY / "rollback.sh").read_text(encoding="utf-8")
    assert "DATA was NOT restored" in body
