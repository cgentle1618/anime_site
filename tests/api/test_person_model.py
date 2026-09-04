"""The person and person_role tables."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_person_needs_only_a_native_name(db_session):
    p = models.Person(name_native="新海誠")
    db_session.add(p)
    db_session.commit()
    assert p.system_id is not None
    assert p.name_en is None
    assert p.gender is None


def test_gender_lives_on_the_person_not_a_seiyuu_extension(db_session):
    p = models.Person(name_native="花澤香菜", gender="Female")
    db_session.add(p)
    db_session.commit()
    assert p.gender == "Female"


def test_native_name_and_english_name_are_unique_together(db_session):
    db_session.add(models.Person(name_native="新海誠", name_en="Makoto Shinkai"))
    db_session.commit()
    db_session.add(models.Person(name_native="新海誠", name_en="Makoto Shinkai"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_a_person_can_hold_two_roles(db_session):
    p = models.Person(name_native="新海誠")
    db_session.add(p)
    db_session.commit()
    db_session.add_all(
        [
            models.PersonRole(person_id=p.system_id, role="director", scope="anime"),
            models.PersonRole(person_id=p.system_id, role="composer", scope=None),
        ]
    )
    db_session.commit()
    assert len(p.roles) == 2


def test_a_director_can_be_scoped_both_ways(db_session):
    p = models.Person(name_native="宮崎駿")
    db_session.add(p)
    db_session.commit()
    db_session.add_all(
        [
            models.PersonRole(person_id=p.system_id, role="director", scope="anime"),
            models.PersonRole(
                person_id=p.system_id, role="director", scope="movie"
            ),
        ]
    )
    db_session.commit()
    assert {r.scope for r in p.roles} == {"anime", "movie"}


def test_one_role_scope_pair_cannot_repeat(db_session):
    p = models.Person(name_native="宮崎駿")
    db_session.add(p)
    db_session.commit()
    db_session.add(
        models.PersonRole(person_id=p.system_id, role="director", scope="anime")
    )
    db_session.commit()
    db_session.add(
        models.PersonRole(person_id=p.system_id, role="director", scope="anime")
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_roles_cascade_when_the_person_is_deleted(db_session):
    p = models.Person(name_native="新海誠")
    db_session.add(p)
    db_session.commit()
    db_session.add(
        models.PersonRole(person_id=p.system_id, role="director", scope="anime")
    )
    db_session.commit()

    db_session.delete(p)
    db_session.commit()
    assert db_session.query(models.PersonRole).count() == 0
