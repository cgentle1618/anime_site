"""Reading and writing an entry's media_source rows."""

import uuid

from app import models
from app.services.domain.sources import (
    attach_sources,
    delete_sources_for,
    replace_sources,
)


def _option(db, value, category="Platform", sort_order=0):
    option = models.SystemOption(
        category=category, value=value, sort_order=sort_order
    )
    db.add(option)
    db.flush()
    return option


def test_attaching_to_an_entry_with_no_sources_gives_an_empty_list(
    db_session, sample_anime
):
    attach_sources(db_session, "anime", sample_anime)
    assert sample_anime.sources == []


def test_a_main_row_reports_its_option_value(db_session, sample_anime):
    option = _option(db_session, "Netflix")
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="main",
            option_id=option.system_id,
            available=True,
            url="https://netflix.test/1",
        )
    )
    db_session.commit()

    attach_sources(db_session, "anime", sample_anime)

    (row,) = sample_anime.sources
    assert row.name == "Netflix"
    assert row.kind == "access"
    assert row.bucket == "main"
    assert row.available is True
    assert row.url == "https://netflix.test/1"


def test_a_free_form_row_reports_its_typed_name(db_session, sample_anime):
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="restricted",
            name="Some Site",
            url="https://example.test",
        )
    )
    db_session.commit()

    attach_sources(db_session, "anime", sample_anime)

    (row,) = sample_anime.sources
    assert row.name == "Some Site"
    assert row.bucket == "restricted"


def test_attach_batches_across_entries(db_session, sample_anime):
    """One query for rows, one for options - not one per entry."""
    option = _option(db_session, "Bahamut")
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="main",
            option_id=option.system_id,
        )
    )
    db_session.commit()

    attach_sources(db_session, "anime", [sample_anime])
    assert len(sample_anime.sources) == 1


def test_replace_is_a_whole_set_replace(db_session, sample_anime):
    _option(db_session, "Netflix")
    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [{"kind": "access", "bucket": "other", "name": "First", "url": None}],
    )
    db_session.commit()

    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [{"kind": "access", "bucket": "other", "name": "Second", "url": None}],
    )
    db_session.commit()

    rows = db_session.query(models.MediaSource).all()
    assert [r.name for r in rows] == ["Second"]


def test_replace_resolves_a_main_row_by_option_value(db_session, sample_anime):
    _option(db_session, "Crunchyroll")
    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [
            {
                "kind": "access",
                "bucket": "main",
                "name": "Crunchyroll",
                "url": "https://cr.test",
                "available": True,
            }
        ],
    )
    db_session.commit()

    (row,) = db_session.query(models.MediaSource).all()
    assert row.option_id is not None
    assert row.name is None


def test_replace_records_order(db_session, sample_anime):
    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [
            {"kind": "access", "bucket": "other", "name": "A"},
            {"kind": "access", "bucket": "other", "name": "B"},
        ],
    )
    db_session.commit()

    rows = db_session.query(models.MediaSource).order_by(models.MediaSource.position).all()
    assert [r.position for r in rows] == [0, 1]


def test_delete_removes_only_this_entry(db_session, sample_anime):
    other_id = uuid.uuid4()
    for entry_id in (sample_anime.system_id, other_id):
        db_session.add(
            models.MediaSource(
                media_type="anime",
                entry_id=entry_id,
                kind="access",
                bucket="other",
                name="Site",
            )
        )
    db_session.commit()

    removed = delete_sources_for(db_session, "anime", sample_anime.system_id)
    db_session.commit()

    assert removed == 1
    assert db_session.query(models.MediaSource).count() == 1


# ---------------------------------------------------------------------------
# Ordering
# ---------------------------------------------------------------------------

def test_main_rows_follow_the_vocabulary_sort_order(db_session, sample_anime):
    """
    The admin sets the order once on the Options page. The backfill inserted
    every migrated row with position 0, so position cannot carry it.
    """
    for value, sort_order in (("Third", 30), ("First", 10), ("Second", 20)):
        option = _option(db_session, value, sort_order=sort_order)
        db_session.add(
            models.MediaSource(
                media_type="anime",
                entry_id=sample_anime.system_id,
                kind="access",
                bucket="main",
                option_id=option.system_id,
                position=0,
            )
        )
    db_session.commit()

    attach_sources(db_session, "anime", sample_anime)

    assert [r.name for r in sample_anime.sources] == ["First", "Second", "Third"]


def test_free_form_rows_keep_insertion_order(db_session, sample_anime):
    for position, name in enumerate(["Zeta", "Alpha", "Mu"]):
        db_session.add(
            models.MediaSource(
                media_type="anime",
                entry_id=sample_anime.system_id,
                kind="access",
                bucket="other",
                name=name,
                position=position,
            )
        )
    db_session.commit()

    attach_sources(db_session, "anime", sample_anime)

    assert [r.name for r in sample_anime.sources] == ["Zeta", "Alpha", "Mu"]


def test_a_row_carries_its_option_id(db_session, sample_anime):
    """The stable key the cards match on, so renaming a platform is safe."""
    option = _option(db_session, "Bahamut")
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="main",
            option_id=option.system_id,
        )
    )
    db_session.commit()

    attach_sources(db_session, "anime", sample_anime)

    (row,) = sample_anime.sources
    assert row.option_id == option.system_id


def test_a_free_form_row_has_no_option_id(db_session, sample_anime):
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="access",
            bucket="other",
            name="Site",
        )
    )
    db_session.commit()

    attach_sources(db_session, "anime", sample_anime)

    (row,) = sample_anime.sources
    assert row.option_id is None
