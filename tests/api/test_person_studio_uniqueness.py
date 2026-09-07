"""
uq_person_name / uq_studio_name / uq_person_role must actually fire.

These once also replayed n1u2l3l4s5n6d's COLLAPSE_DUPLICATES against seeded
duplicates. That step is gone: its window functions partition by
name_native, a column neither person nor studio still has after
s1t2u3d4i5o6 and p7n8a9m10e11 renamed it away, so it can only run against
the pre-reshape schema - and these tests build their database with
create_all from the CURRENT models, never from Alembic. The scenario it
covered (a duplicate surviving because the constraint was inert) is now
prevented outright by the constraints below plus their find-or-create API
paths, which the tests here do exercise.

Requires PostgreSQL 15+ (anime_site_test DB). See tests/api/conftest.py.
"""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models

# ---------------------------------------------------------------------------
# The constraints themselves
# ---------------------------------------------------------------------------


def test_two_people_with_the_same_name_and_no_english_name_collide(db_session):
    """The exact case the plain constraint missed: three name columns NULL."""
    db_session.add(models.Person(name_en="Dup"))
    db_session.flush()
    db_session.add(models.Person(name_en="Dup"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_two_studios_with_the_same_name_and_no_english_name_collide(db_session):
    db_session.add(models.Studio(name_en="Dup Studio"))
    db_session.flush()
    db_session.add(models.Studio(name_en="Dup Studio"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_one_person_cannot_hold_the_same_role_and_scope_twice(db_session):
    """
    Was "the same UNSCOPED role twice", which needed NULLS NOT DISTINCT to
    fire at all. scope is NOT NULL now, so there is no unscoped row to
    duplicate and the plain constraint is sufficient - see the design spec's
    Decision B.
    """
    person = models.Person(name_jp="澤野弘之")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="composer", scope="anime")
    )
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="composer", scope="anime")
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_a_different_english_name_is_still_a_different_person(db_session):
    """NULLS NOT DISTINCT must not over-collapse genuinely distinct rows."""
    db_session.add(models.Person(name_jp="同名", name_en="One"))
    db_session.add(models.Person(name_jp="同名", name_en="Two"))
    db_session.flush()
    assert db_session.query(models.Person).filter_by(name_jp="同名").count() == 2


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
        json={"name": "新海誠", "roles": [{"role": "producer", "scope": "anime"}]},
    ).json()
    second = admin_client.post(
        "/api/person/",
        json={"name": "新海誠", "roles": [{"role": "director", "scope": "anime"}]},
    )
    assert second.status_code == 200
    assert second.json()["system_id"] == first["system_id"]
    assert db_session.query(models.Person).filter_by(name_cn="新海誠").count() == 1
    held = {
        (r.role, r.scope)
        for r in db_session.query(models.PersonRole)
        .filter_by(person_id=first["system_id"])
        .all()
    }
    assert held == {("producer", "anime"), ("director", "anime")}


def test_posting_an_existing_studio_returns_it(admin_client, db_session):
    first = admin_client.post("/api/studio/", json={"name_en": "MAPPA"}).json()
    second = admin_client.post("/api/studio/", json={"name_en": " mappa "})
    assert second.status_code == 200
    assert second.json()["system_id"] == first["system_id"]
    assert db_session.query(models.Studio).count() == 1
