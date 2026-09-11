"""
Clean: what deleting one media row actually takes with it.

Lives under tests/api/ rather than tests/services/ because it needs the real
database - db_session is declared in tests/api/conftest.py, and the whole point
of these tests is what PostgreSQL's foreign keys do, not what the ORM intends.

The distinction this file exists to pin: not everything pointing at a media row
dies with it. quote.media_id is ON DELETE SET NULL, so a quote SURVIVES its
entry and goes dangling. Everything else is ON DELETE CASCADE. Reporting a
quote as "will be deleted" would be a lie to the operator in the review screen.
"""

import uuid

from app import models
from app.services.pipelines import clean


def _anime(db_session, name="Blast Radius Subject"):
    """An anime entry and its auto-created media parent."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        anime_name_en=name,
        airing_type="TV",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    media = (
        db_session.query(models.Media)
        .filter(models.Media.system_id == entry.system_id)
        .one()
    )
    return entry, media


def test_a_bare_entry_costs_nothing(db_session):
    _entry, media = _anime(db_session)
    counts = clean.blast_radius(db_session, media)
    assert counts["deleted"] == {
        "credits": 0,
        "tags": 0,
        "sources": 0,
        "content_labels": 0,
        "notes": 0,
        "memes": 0,
        "list_rows": 0,
    }
    assert counts["detached"] == {"quotes": 0}


def test_credits_and_list_rows_are_counted_as_deleted(db_session, admin_user):
    _entry, media = _anime(db_session)
    person = models.Person(system_id=uuid.uuid4(), name_en="Someone")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            system_id=uuid.uuid4(),
            media_id=media.system_id,
            person_id=person.system_id,
            role="director",
        )
    )
    db_session.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            media_id=media.system_id,
            user_id=admin_user.id,
            status="Completed",
        )
    )
    db_session.flush()

    counts = clean.blast_radius(db_session, media)
    assert counts["deleted"]["credits"] == 1
    assert counts["deleted"]["list_rows"] == 1


def test_a_quote_is_reported_as_detached_not_deleted(db_session, admin_user):
    """quote.media_id is SET NULL, so the quote outlives the entry. Telling the
    operator it will be deleted would be false."""
    _entry, media = _anime(db_session)
    db_session.add(
        models.Quote(
            system_id=uuid.uuid4(),
            media_id=media.system_id,
            author_id=admin_user.id,
            text="A line worth keeping.",
        )
    )
    db_session.flush()

    counts = clean.blast_radius(db_session, media)
    assert counts["detached"]["quotes"] == 1
    assert "quotes" not in counts["deleted"]


def test_the_database_agrees_with_the_report(db_session, admin_user):
    """The counts are a promise about what PostgreSQL will do. Delete the row
    and check the promise was kept - the cascade takes the list row, and the
    quote survives with a null media_id."""
    _entry, media = _anime(db_session)
    db_session.add(
        models.UserMediaList(
            system_id=uuid.uuid4(),
            media_id=media.system_id,
            user_id=admin_user.id,
            status="Completed",
        )
    )
    quote_id = uuid.uuid4()
    db_session.add(
        models.Quote(
            system_id=quote_id,
            media_id=media.system_id,
            author_id=admin_user.id,
            text="Survivor.",
        )
    )
    db_session.flush()

    counts = clean.blast_radius(db_session, media)
    assert counts["deleted"]["list_rows"] == 1
    assert counts["detached"]["quotes"] == 1

    db_session.delete(media)
    db_session.flush()
    db_session.expire_all()

    assert (
        db_session.query(models.UserMediaList)
        .filter(models.UserMediaList.media_id == media.system_id)
        .count()
        == 0
    )
    surviving = db_session.query(models.Quote).filter(
        models.Quote.system_id == quote_id
    ).one()
    assert surviving.media_id is None


def test_the_detail_row_dies_with_its_media_parent(db_session):
    """Decision 4: deleting the detail row alone would leave a fresh orphan, so
    Clean deletes the media parent and relies on this cascade."""
    entry, media = _anime(db_session)
    anime_id = entry.system_id
    db_session.delete(media)
    db_session.flush()
    assert (
        db_session.query(models.Anime)
        .filter(models.Anime.system_id == anime_id)
        .first()
        is None
    )
