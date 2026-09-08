"""
Unit tests for the startup schema guard.

The behaviour under test is what stops a dropped database from coming back
looking healthy: on a migrated database the guard must create nothing, and on a
database with tables but no alembic_version it must refuse to extend the schema
and say so.

SQLite in-memory is enough here -- the guard only inspects table names.
"""

import logging

from sqlalchemy import Column, Integer, MetaData, String, Table, create_engine

from app import schema_guard
from app.schema_guard import ensure_schema, schema_state


def _engine():
    # A single shared connection, so tables created in one call are visible to
    # the next inspect() on the same in-memory database.
    return create_engine("sqlite://", poolclass=None)


def _make_table(engine, name):
    md = MetaData()
    Table(name, md, Column("id", Integer, primary_key=True))
    md.create_all(bind=engine)


def _make_alembic_version(engine):
    md = MetaData()
    Table("alembic_version", md, Column("version_num", String(32), primary_key=True))
    md.create_all(bind=engine)


class TestSchemaState:
    def test_empty_database(self):
        assert schema_state(_engine()) == "empty"

    def test_migrated_database(self):
        e = _engine()
        _make_alembic_version(e)
        _make_table(e, "franchise")
        assert schema_state(e) == "migrated"

    def test_tables_without_alembic_version_are_unmanaged(self):
        # The exact shape a create_all() rebuild of a dropped database leaves.
        e = _engine()
        _make_table(e, "franchise")
        assert schema_state(e) == "unmanaged"

    def test_alembic_version_alone_counts_as_migrated(self):
        e = _engine()
        _make_alembic_version(e)
        assert schema_state(e) == "migrated"


class TestEnsureSchema:
    def test_migrated_database_is_left_alone(self):
        # The point of the guard: no create_all on a managed schema, so a model
        # change lacking a migration fails loudly instead of being papered over.
        e = _engine()
        _make_alembic_version(e)
        _make_table(e, "franchise")

        from sqlalchemy import inspect

        before = set(inspect(e).get_table_names())
        assert ensure_schema(e) == "migrated"
        assert set(inspect(e).get_table_names()) == before

    def test_unmanaged_database_is_not_extended(self, caplog):
        # A dropped-and-rebuilt database must NOT be quietly completed.
        e = _engine()
        _make_table(e, "franchise")

        from sqlalchemy import inspect

        before = set(inspect(e).get_table_names())
        with caplog.at_level(logging.WARNING):
            assert ensure_schema(e) == "unmanaged"

        assert set(inspect(e).get_table_names()) == before
        assert "no alembic_version" in caplog.text
        assert "Leaving it untouched" in caplog.text

    def test_empty_database_is_created_with_a_warning(self, caplog, monkeypatch):
        # Asserts the DECISION to create, not SQLAlchemy's DDL: the real models
        # use JSONB, which the SQLite dialect cannot render. Whether create_all
        # emits correct DDL is SQLAlchemy's problem, not this guard's.
        e = _engine()
        calls = []
        monkeypatch.setattr(
            schema_guard.models.Base.metadata,
            "create_all",
            lambda **kw: calls.append(kw),
        )

        with caplog.at_level(logging.WARNING):
            assert ensure_schema(e) == "empty"

        assert len(calls) == 1, "create_all should run exactly once on an empty DB"
        assert calls[0]["bind"] is e
        # It must be obvious this was not a migration.
        assert "NOT a migration" in caplog.text

    def test_create_all_never_runs_on_a_managed_or_unmanaged_database(
        self, monkeypatch
    ):
        # The whole point of the guard, stated once as a direct assertion.
        calls = []
        monkeypatch.setattr(
            schema_guard.models.Base.metadata,
            "create_all",
            lambda **kw: calls.append(kw),
        )

        migrated = _engine()
        _make_alembic_version(migrated)
        ensure_schema(migrated)

        unmanaged = _engine()
        _make_table(unmanaged, "franchise")
        ensure_schema(unmanaged)

        assert calls == []
