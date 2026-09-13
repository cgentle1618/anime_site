"""`m0c1source` must drop `uq_media_source_row` in either shape it exists in.

The revision originally used `op.drop_constraint(type_="unique")`, which emits
`ALTER TABLE ... DROP CONSTRAINT`. That works only where the name belongs to a
table constraint. Every database built by the migration chain has it as a bare
unique INDEX instead, because `ms1o2u3r4c5e` creates it with raw
`CREATE UNIQUE INDEX` (NULLS NOT DISTINCT), so those databases died at this
revision with `UndefinedObject: constraint "uq_media_source_row" ... does not
exist` -- the home machine on 2026-09-09.

These run real DDL against Postgres: the whole defect is in what the server
accepts, so a mock would assert nothing.
"""

import importlib.util
import pathlib

import pytest
from sqlalchemy import text

_spec = importlib.util.spec_from_file_location(
    "m0c1source",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions_archive/m0c1source_media_source_media_fk.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)

TABLE = "uniqueness_drop_probe"
NAME = "uq_probe_row"


@pytest.fixture
def probe(db_session):
    """A throwaway table, so the suite's real schema is never touched."""
    db_session.execute(text(f"DROP TABLE IF EXISTS {TABLE}"))
    db_session.execute(text(f"CREATE TABLE {TABLE} (a int, b int)"))
    # No teardown drop: db_session rolls its transaction back, and a probe
    # that aborted the transaction cannot run one anyway.
    yield db_session


def _exists(db):
    return db.execute(
        text(
            "SELECT count(*) FROM pg_class c "
            "JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE c.relname = :n AND n.nspname = 'public'"
        ),
        {"n": NAME},
    ).scalar_one()


def test_drops_a_bare_unique_index(probe):
    """The shape every migration-built database actually holds."""
    probe.execute(text(f"CREATE UNIQUE INDEX {NAME} ON {TABLE} (a, b)"))
    assert _exists(probe) == 1

    migration.drop_uniqueness(probe, TABLE, NAME)

    assert _exists(probe) == 0


def test_drops_a_table_constraint(probe):
    """The shape `create_all` builds from `app.models.MediaSource`."""
    probe.execute(
        text(f"ALTER TABLE {TABLE} ADD CONSTRAINT {NAME} UNIQUE (a, b)")
    )
    assert _exists(probe) == 1

    migration.drop_uniqueness(probe, TABLE, NAME)

    assert _exists(probe) == 0
    assert (
        probe.execute(
            text(
                "SELECT count(*) FROM pg_constraint "
                f"WHERE conrelid = '{TABLE}'::regclass AND conname = :n"
            ),
            {"n": NAME},
        ).scalar_one()
        == 0
    )


def test_is_a_no_op_when_the_name_is_absent(probe):
    """Re-running the revision, or a database that never had it, must not die."""
    migration.drop_uniqueness(probe, TABLE, NAME)
    assert _exists(probe) == 0
