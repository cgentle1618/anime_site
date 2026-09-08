"""The person and person_role tables."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


def test_person_needs_only_one_name(db_session):
    p = models.Person(name_jp="新海誠")
    db_session.add(p)
    db_session.commit()
    assert p.system_id is not None
    assert p.name_en is None
    assert p.gender is None


def test_gender_lives_on_the_person_not_a_seiyuu_extension(db_session):
    p = models.Person(name_jp="花澤香菜", gender="Female")
    db_session.add(p)
    db_session.commit()
    assert p.gender == "Female"


def test_the_four_names_are_unique_together(db_session):
    db_session.add(models.Person(name_jp="新海誠", name_en="Makoto Shinkai"))
    db_session.commit()
    db_session.add(models.Person(name_jp="新海誠", name_en="Makoto Shinkai"))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_display_name_honours_the_chosen_field(db_session):
    p = models.Person(
        name_en="Ryan Coogler", name_cn="瑞恩·庫格勒", display_name_field="cn"
    )
    db_session.add(p)
    db_session.flush()
    assert p.display_name == "瑞恩·庫格勒"


def test_display_name_falls_back_when_the_chosen_field_is_empty(db_session):
    p = models.Person(name_jp="諫山創", display_name_field="cn")
    db_session.add(p)
    db_session.flush()
    assert p.display_name == "諫山創"


def test_display_name_falls_back_in_order_when_unset(db_session):
    p = models.Person(name_cn="渡部高志", name_jp="渡部高志")
    db_session.add(p)
    db_session.flush()
    assert p.display_name == "渡部高志"


def test_a_person_needs_at_least_one_name(db_session):
    db_session.add(models.Person(gender="F"))
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()


def test_api_rejects_a_nameless_person(admin_client):
    r = admin_client.post("/api/person/", json={"roles": []})
    assert r.status_code == 422


def test_a_person_can_hold_two_roles(db_session):
    p = models.Person(name_jp="新海誠")
    db_session.add(p)
    db_session.commit()
    db_session.add_all(
        [
            models.PersonRole(person_id=p.system_id, role="director", scope="anime"),
            models.PersonRole(person_id=p.system_id, role="composer", scope="anime"),
        ]
    )
    db_session.commit()
    assert len(p.roles) == 2


def test_a_director_can_be_scoped_both_ways(db_session):
    p = models.Person(name_jp="宮崎駿")
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
    p = models.Person(name_jp="宮崎駿")
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
    p = models.Person(name_jp="新海誠")
    db_session.add(p)
    db_session.commit()
    db_session.add(
        models.PersonRole(person_id=p.system_id, role="director", scope="anime")
    )
    db_session.commit()

    db_session.delete(p)
    db_session.commit()
    assert db_session.query(models.PersonRole).count() == 0
