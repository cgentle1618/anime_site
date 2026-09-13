"""
An INSTALLED database may still carry a UNIQUE `ix_seasonal_seasonal`.

The season string stopped being unique on its own when `seasonal` became one
row per user per season: the key is the pair, and two users hold "WIN 2026"
independently. The revision that made that change dropped the primary key and
the `seasonal_seasonal_key` UNIQUE constraint, but `ix_seasonal_seasonal` is a
unique INDEX rather than a constraint, so it survived untouched on every
database that had already been built. A database created since is correct -
the baseline declares the index `unique=False` - which is why nothing in the
suite noticed: `tests/api/conftest.py` uses `create_all`, and
`test_migrations_build_the_schema.py` compares index NAMES, not uniqueness.

The drift only bites once a second user exists, and then it takes down every
pipeline that calls `create_missing_seasonal` - the cross product it inserts
repeats each season string once per user.

So this test rebuilds the legacy shape on a scratch database and asserts the
chain repairs it. `create_all` cannot produce the broken state, so the drift
has to be recreated by hand here; that hand-written index IS the fixture.
"""

import os
import subprocess
import sys
import uuid
from pathlib import Path

import pytest
import sqlalchemy as sa
from sqlalchemy import text

ROOT = Path(__file__).resolve().parents[2]

# The revision that introduces the repair. The legacy index is planted while
# the database sits at its parent, so the upgrade under test actually runs.
REPAIR_REVISION = "s1e2asonalix"
PARENT_REVISION = "c1image0002"

INDEX_DEF_SQL = text(
    "select indexdef from pg_indexes "
    "where schemaname = 'public' and indexname = 'ix_seasonal_seasonal'"
)


def _server_url(database: str) -> str:
    from app.config import settings

    url = sa.engine.url.make_url(settings.sqlalchemy_database_url)
    return url.set(database=database).render_as_string(hide_password=False)


def _alembic(database: str, *args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-m", "alembic", *args],
        cwd=ROOT,
        env={**os.environ, "POSTGRES_DB": database},
        capture_output=True,
        text=True,
    )


@pytest.fixture
def scratch_database():
    name = f"anime_drift_{uuid.uuid4().hex[:8]}"
    admin = sa.create_engine(_server_url("postgres"), isolation_level="AUTOCOMMIT")
    try:
        with admin.connect() as conn:
            conn.execute(text(f'CREATE DATABASE "{name}"'))
    except sa.exc.SQLAlchemyError as exc:  # pragma: no cover - environment
        admin.dispose()
        pytest.skip(f"cannot create a scratch database here: {exc}")

    try:
        yield name
    finally:
        with admin.connect() as conn:
            conn.execute(
                text(
                    "select pg_terminate_backend(pid) from pg_stat_activity "
                    "where datname = :n and pid <> pg_backend_pid()"
                ),
                {"n": name},
            )
            conn.execute(text(f'DROP DATABASE IF EXISTS "{name}"'))
        admin.dispose()


def test_upgrade_drops_a_legacy_unique_seasonal_index(scratch_database):
    result = _alembic(scratch_database, "upgrade", PARENT_REVISION)
    assert result.returncode == 0, result.stderr[-2000:]

    engine = sa.create_engine(_server_url(scratch_database))
    try:
        with engine.begin() as conn:
            # Recreate the legacy shape an installed database still has.
            conn.execute(text("DROP INDEX IF EXISTS ix_seasonal_seasonal"))
            conn.execute(
                text("CREATE UNIQUE INDEX ix_seasonal_seasonal ON seasonal (seasonal)")
            )
        with engine.connect() as conn:
            planted = conn.execute(INDEX_DEF_SQL).scalar()
        # Without this the assertion below is satisfied by an index that was
        # never unique, and the test passes on a database it never repaired.
        assert planted is not None and "UNIQUE" in planted, planted

        result = _alembic(scratch_database, "upgrade", "head")
        assert result.returncode == 0, result.stderr[-2000:]

        with engine.connect() as conn:
            repaired = conn.execute(INDEX_DEF_SQL).scalar()
        assert repaired is not None, "the index must survive; it is still looked up"
        assert "UNIQUE" not in repaired, repaired
    finally:
        engine.dispose()


def test_upgrade_leaves_a_correct_index_alone(scratch_database):
    """The repair runs on a fresh database too, where there is nothing to fix."""
    result = _alembic(scratch_database, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-2000:]

    engine = sa.create_engine(_server_url(scratch_database))
    try:
        with engine.connect() as conn:
            definition = conn.execute(INDEX_DEF_SQL).scalar()
    finally:
        engine.dispose()

    assert definition is not None
    assert "UNIQUE" not in definition, definition


def test_downgrade_of_the_repair_is_reachable(scratch_database):
    """The revision must be able to step back off head without erroring."""
    result = _alembic(scratch_database, "upgrade", "head")
    assert result.returncode == 0, result.stderr[-2000:]

    result = _alembic(scratch_database, "downgrade", PARENT_REVISION)
    assert result.returncode == 0, result.stderr[-2000:]

    result = _alembic(scratch_database, "upgrade", REPAIR_REVISION)
    assert result.returncode == 0, result.stderr[-2000:]
