"""The media_credit and media_tag link tables."""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def person(db_session):
    p = models.Person(name_native="新海誠")
    db_session.add(p)
    db_session.commit()
    return p


@pytest.fixture
def studio(db_session):
    s = models.Studio(name_en="MAPPA")
    db_session.add(s)
    db_session.commit()
    return s


def test_a_credit_points_at_a_person(db_session, person):
    c = models.MediaCredit(
        media_type="anime",
        entry_id=uuid.uuid4(),
        role="director",
        person_id=person.system_id,
    )
    db_session.add(c)
    db_session.commit()
    assert c.position == 0


def test_a_credit_points_at_a_studio(db_session, studio):
    c = models.MediaCredit(
        media_type="anime",
        entry_id=uuid.uuid4(),
        role="studio",
        studio_id=studio.system_id,
    )
    db_session.add(c)
    db_session.commit()
    assert c.system_id is not None


def test_a_credit_cannot_point_at_both(db_session, person, studio):
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="director",
            person_id=person.system_id,
            studio_id=studio.system_id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_a_credit_cannot_point_at_neither(db_session):
    db_session.add(
        models.MediaCredit(
            media_type="anime", entry_id=uuid.uuid4(), role="director"
        )
    )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_the_same_person_cannot_hold_one_role_on_one_entry_twice(
    db_session, person
):
    entry_id = uuid.uuid4()
    for _ in range(2):
        db_session.add(
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="director",
                person_id=person.system_id,
            )
        )
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_one_person_can_hold_two_roles_on_one_entry(db_session, person):
    entry_id = uuid.uuid4()
    db_session.add_all(
        [
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="director",
                person_id=person.system_id,
            ),
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="composer",
                person_id=person.system_id,
            ),
        ]
    )
    db_session.commit()
    assert db_session.query(models.MediaCredit).count() == 2


def test_position_preserves_the_original_comma_order(db_session):
    entry_id = uuid.uuid4()
    for i, name in enumerate(["A", "B", "C"]):
        p = models.Person(name_native=name)
        db_session.add(p)
        db_session.commit()
        db_session.add(
            models.MediaCredit(
                media_type="anime",
                entry_id=entry_id,
                role="director",
                person_id=p.system_id,
                position=i,
            )
        )
    db_session.commit()

    rows = (
        db_session.query(models.MediaCredit)
        .filter_by(entry_id=entry_id)
        .order_by(models.MediaCredit.position)
        .all()
    )
    assert [r.position for r in rows] == [0, 1, 2]


def test_deleting_a_person_cascades_their_credits(db_session, person):
    db_session.add(
        models.MediaCredit(
            media_type="anime",
            entry_id=uuid.uuid4(),
            role="director",
            person_id=person.system_id,
        )
    )
    db_session.commit()

    db_session.delete(person)
    db_session.commit()
    assert db_session.query(models.MediaCredit).count() == 0


def test_a_tag_points_at_an_option(db_session):
    opt = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(opt)
    db_session.commit()

    t = models.MediaTag(
        media_type="anime",
        entry_id=uuid.uuid4(),
        field="genre_main",
        option_id=opt.system_id,
    )
    db_session.add(t)
    db_session.commit()
    assert t.position == 0


def test_deleting_an_option_cascades_its_tags(db_session):
    opt = models.SystemOption(category="Genre Main", value="Action")
    db_session.add(opt)
    db_session.commit()
    db_session.add(
        models.MediaTag(
            media_type="anime",
            entry_id=uuid.uuid4(),
            field="genre_main",
            option_id=opt.system_id,
        )
    )
    db_session.commit()

    db_session.delete(opt)
    db_session.commit()
    assert db_session.query(models.MediaTag).count() == 0
