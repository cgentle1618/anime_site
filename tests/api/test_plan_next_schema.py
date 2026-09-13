"""
The shape of plan_next after Step 3's expand migration.

Reads the live database catalog rather than the ORM: the point of this task is
what the DATABASE enforces. The test database is built by create_all from the
models (see tests/api/conftest.py), so what it checks is the shape the model
and the migration agree on - the migration itself is exercised by hand against
the dev database. Requires PostgreSQL.
"""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


@pytest.fixture
def db(db_session):
    return db_session


def _columns(db) -> set:
    rows = db.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'plan_next'"
        )
    ).all()
    return {r[0] for r in rows}


def _constraints(db) -> set:
    rows = db.execute(
        text(
            "SELECT conname FROM pg_constraint "
            "WHERE conrelid = 'plan_next'::regclass"
        )
    ).all()
    return {r[0] for r in rows}


def test_the_four_new_columns_exist(db):
    assert {"user_id", "media_id", "franchise_id", "series_id"} <= _columns(db)


def test_user_id_is_not_nullable(db):
    nullable = db.execute(
        text(
            "SELECT is_nullable FROM information_schema.columns "
            "WHERE table_name = 'plan_next' AND column_name = 'user_id'"
        )
    ).scalar_one()
    assert nullable == "NO"


def test_every_constraint_is_present_by_name(db):
    names = _constraints(db)
    assert "ck_plan_next_one_owner" in names
    assert "fk_plan_next_user" in names
    assert "fk_plan_next_media_type" in names
    assert "fk_plan_next_franchise" in names
    assert "fk_plan_next_series" in names
    assert "uq_plan_next_target" in names


def test_the_owner_check_rejects_two_owners(db, sample_franchise, sample_series):
    owner = db.execute(text("SELECT id FROM users LIMIT 1")).scalar()
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO plan_next "
                "(system_id, user_id, kind, media_type, franchise_id, series_id) "
                "VALUES (gen_random_uuid(), :u, 'next', 'anime', :f, :s)"
            ),
            {
                "u": owner,
                "f": str(sample_franchise.system_id),
                "s": str(sample_series.system_id),
            },
        )
        db.flush()


def test_the_owner_check_rejects_no_owner(db):
    owner = db.execute(text("SELECT id FROM users LIMIT 1")).scalar()
    with pytest.raises(IntegrityError):
        db.execute(
            text(
                "INSERT INTO plan_next (system_id, user_id, kind, media_type) "
                "VALUES (gen_random_uuid(), :u, 'next', 'anime')"
            ),
            {"u": owner},
        )
        db.flush()


def test_the_fk_less_pair_is_gone(db):
    assert "scope" not in _columns(db)
    assert "target_id" not in _columns(db)
