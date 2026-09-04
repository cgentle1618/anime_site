"""
uq_person_name / uq_studio_name / uq_person_role must actually fire, and the
migration that adds them must not lose credits collapsing what the inert
versions already allowed.

Requires PostgreSQL 15+ (anime_site_test DB). See tests/api/conftest.py.
"""

import importlib.util
import uuid
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / "alembic"
    / "versions"
    / "n1u2l3l4s5n6d_person_studio_nulls_not_distinct.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("nnd_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _person_collapse_statements(module):
    """
    The Person-only subset of module.COLLAPSE_DUPLICATES.

    COLLAPSE_DUPLICATES also merges duplicate Studio rows via raw SQL keyed
    on studio.name_native (module._STUDIO_MERGE and the two statements that
    follow it). That SQL is correct where the frozen migration actually
    runs - before s1t2u3d4i5o6 renamed name_native off of Studio - but this
    file's tests build a database from the CURRENT models, where that column
    is gone, so replaying it here raises UndefinedColumn regardless of what
    the test is trying to exercise. The scenario that step covered - a
    duplicate studio surviving because the constraint was inert - is now
    enforced directly by uq_studio_name + ck_studio_has_a_name on the
    current schema, and its find-or-create path is exercised above by
    test_posting_an_existing_studio_returns_it. So the tests below, which
    are about Person and PersonRole collapsing, replay only the Person-side
    statements.
    """
    return tuple(
        statement
        for statement in module.COLLAPSE_DUPLICATES
        if statement is not module._STUDIO_MERGE and "studio_merge" not in statement
    )


# ---------------------------------------------------------------------------
# The constraints themselves
# ---------------------------------------------------------------------------


def test_two_people_with_the_same_name_and_no_english_name_collide(db_session):
    """The exact case the plain constraint missed: name_en NULL on both."""
    db_session.add(models.Person(name_native="Dup"))
    db_session.flush()
    db_session.add(models.Person(name_native="Dup"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_two_studios_with_the_same_name_and_no_english_name_collide(db_session):
    db_session.add(models.Studio(name_en="Dup Studio"))
    db_session.flush()
    db_session.add(models.Studio(name_en="Dup Studio"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_one_person_cannot_hold_the_same_unscoped_role_twice(db_session):
    person = models.Person(name_native="澤野弘之")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="composer", scope=None)
    )
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="composer", scope=None)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_different_english_name_is_still_a_different_person(db_session):
    """NULLS NOT DISTINCT must not over-collapse genuinely distinct rows."""
    db_session.add(models.Person(name_native="同名", name_en="One"))
    db_session.add(models.Person(name_native="同名", name_en="Two"))
    db_session.flush()
    assert db_session.query(models.Person).filter_by(name_native="同名").count() == 2


# ---------------------------------------------------------------------------
# The API stops minting duplicates in the first place
# ---------------------------------------------------------------------------


def test_posting_an_existing_person_adds_the_role_instead_of_a_second_row(
    admin_client, db_session
):
    """
    ensureSourceValues.js POSTs here whenever a typed name is missing from a
    ROLE-FILTERED list, so typing a known producer into the Director field
    arrives as a create for someone who already exists.
    """
    first = admin_client.post(
        "/api/person/",
        json={"name_native": "新海誠", "roles": [{"role": "producer", "scope": None}]},
    ).json()
    second = admin_client.post(
        "/api/person/",
        json={"name_native": "新海誠", "roles": [{"role": "director", "scope": "anime"}]},
    )
    assert second.status_code == 200
    assert second.json()["system_id"] == first["system_id"]
    assert db_session.query(models.Person).filter_by(name_native="新海誠").count() == 1
    held = {
        (r.role, r.scope)
        for r in db_session.query(models.PersonRole)
        .filter_by(person_id=first["system_id"])
        .all()
    }
    assert held == {("producer", None), ("director", "anime")}


def test_posting_an_existing_studio_returns_it(admin_client, db_session):
    first = admin_client.post("/api/studio/", json={"name_en": "MAPPA"}).json()
    second = admin_client.post("/api/studio/", json={"name_en": " mappa "})
    assert second.status_code == 200
    assert second.json()["system_id"] == first["system_id"]
    assert db_session.query(models.Studio).count() == 1


# ---------------------------------------------------------------------------
# The migration's collapse step
# ---------------------------------------------------------------------------


def test_the_migration_merges_duplicates_without_losing_credits(db_session):
    """
    Seed the duplicates the inert constraint allowed, then run exactly the
    statements the migration runs. A plain DELETE would cascade the loser's
    credits away (media_credit.person_id is ON DELETE CASCADE); they must be
    repointed onto the survivor instead.
    """
    module = _migration_module()

    # The constraint is already in place here (created from the models), so
    # drop it to recreate the pre-migration world.
    db_session.execute(text("ALTER TABLE person DROP CONSTRAINT uq_person_name"))

    keep = models.Person(name_native="Dup")
    lose = models.Person(name_native="Dup")
    db_session.add_all([keep, lose])
    db_session.flush()
    # Deterministic survivor: oldest created_at wins, then smallest id.
    db_session.execute(
        text("UPDATE person SET created_at = :t WHERE system_id = :i"),
        {"t": "2000-01-01", "i": keep.system_id},
    )
    db_session.execute(
        text("UPDATE person SET created_at = :t WHERE system_id = :i"),
        {"t": "2020-01-01", "i": lose.system_id},
    )

    entry_id = uuid.uuid4()
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=entry_id,
            role="director",
            person_id=lose.system_id,
        )
    )
    db_session.add(
        models.PersonRole(person_id=lose.system_id, role="director", scope="anime")
    )
    db_session.flush()

    for statement in _person_collapse_statements(module):
        db_session.execute(text(statement))

    assert db_session.query(models.Person).filter_by(name_native="Dup").count() == 1
    credit = (
        db_session.query(models.MediaCredit).filter_by(entry_id=entry_id).one()
    )
    assert credit.person_id == keep.system_id, "the credit was lost, not merged"
    assert (
        db_session.query(models.PersonRole)
        .filter_by(person_id=keep.system_id, role="director")
        .count()
        == 1
    )


def test_the_migration_collapses_duplicate_person_roles(db_session):
    module = _migration_module()
    db_session.execute(text("ALTER TABLE person_role DROP CONSTRAINT uq_person_role"))

    person = models.Person(name_native="澤野弘之")
    db_session.add(person)
    db_session.flush()
    for _ in range(3):
        db_session.add(
            models.PersonRole(person_id=person.system_id, role="composer", scope=None)
        )
    db_session.flush()

    for statement in _person_collapse_statements(module):
        db_session.execute(text(statement))

    assert (
        db_session.query(models.PersonRole)
        .filter_by(person_id=person.system_id)
        .count()
        == 1
    )
