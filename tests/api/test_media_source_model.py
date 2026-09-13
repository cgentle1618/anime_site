"""media_source: one row per place an entry can be watched, read or looked up."""

import pytest
from sqlalchemy.exc import IntegrityError

from app import models


@pytest.fixture
def media_id(db_session):
    """
    A real media row. media_id is a foreign key now, so an invented uuid no
    longer inserts at all.
    """
    a = models.Anime(anime_name_cn="來源")
    db_session.add(a)
    db_session.flush()
    return a.system_id


def _row(media_id, **kw):
    base = dict(
        media_id=media_id,
        kind="access",
        bucket="other",
        name="Some Site",
    )
    base.update(kw)
    return models.MediaSource(**base)


def test_a_free_form_row_carries_a_name_and_no_option(db_session, media_id):
    row = _row(media_id, url="https://example.test")
    db_session.add(row)
    db_session.commit()
    assert row.option_id is None
    assert row.position == 0


def test_a_row_cannot_carry_both_an_option_and_a_name(db_session, media_id):
    option = models.SystemOption(category="Platform", value="Netflix")
    db_session.add(option)
    db_session.flush()

    db_session.add(_row(media_id, bucket="main", option_id=option.system_id, name="Netflix"))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_a_row_must_carry_one_of_them(db_session, media_id):
    db_session.add(_row(media_id, name=None))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_the_same_source_cannot_be_recorded_twice_on_one_entry(db_session, media_id):
    db_session.add(_row(media_id))
    db_session.add(_row(media_id))
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_deleting_the_option_deletes_the_row(db_session, media_id):
    option = models.SystemOption(category="Platform", value="Bahamut")
    db_session.add(option)
    db_session.flush()
    db_session.add(_row(media_id, bucket="main", option_id=option.system_id, name=None))
    db_session.commit()

    db_session.delete(option)
    db_session.commit()

    assert db_session.query(models.MediaSource).count() == 0
