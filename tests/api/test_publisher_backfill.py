"""The one-time publisher_tw / comic_publisher tag-to-credit conversion."""

import pytest

from app import models
from app.services.domain.credits import (
    _SEEDED_WITHOUT_CREDITS,
    backfill_publishers,
    find_publisher,
)

_SEEDED_NAMES = {value for value, _ in _SEEDED_WITHOUT_CREDITS}


def _converted(db):
    """
    The publishers the conversion built from tag rows.

    Every run also mints the entities in _SEEDED_WITHOUT_CREDITS - the owner
    wants them and no tag row would create them (Decision G) - which has
    nothing to do with what these tests assert. Excluded by name rather than
    folded into each expected number, so a change to the seed list does not
    silently shift six unrelated assertions.
    """
    return [
        p
        for p in db.query(models.Publisher).all()
        if p.name_en not in _SEEDED_NAMES
    ]


@pytest.fixture
def db(db_session):
    """Local alias — the convention in test_rewatch_entry_flags.py:15."""
    return db_session


def _tag(db, media_type, entry_id, field, value, category):
    # Find-or-create: (category, value) is unique, so two entries sharing a
    # distributor share the one option row - which is what the live data does.
    option = (
        db.query(models.SystemOption)
        .filter_by(category=category, value=value)
        .first()
    )
    if option is None:
        option = models.SystemOption(category=category, value=value)
        db.add(option)
        db.flush()
    db.add(models.MediaTag(media_type=media_type, entry_id=entry_id,
                           field=field, option_id=option.system_id, position=0))
    db.flush()


def test_a_tag_row_becomes_a_publisher_credit(db, sample_anime):
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Muse木棉花",
         "Publisher / Distributor TW")
    db.commit()

    report = backfill_publishers(db)

    credit = db.query(models.MediaCredit).filter_by(
        media_type="anime", entry_id=anime.system_id, role="publisher"
    ).one()
    assert credit.publisher_id is not None
    assert report["credits"] == 1
    assert db.query(models.MediaTag).filter_by(field="publisher_tw").count() == 0


def test_the_name_map_splits_a_mixed_name(db, sample_anime):
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Proware普威爾",
         "Publisher / Distributor TW")
    db.commit()

    backfill_publishers(db)

    pub = find_publisher(db, "普威爾")
    assert pub.name_en == "Proware"
    assert pub.name_cn == "普威爾"
    assert pub.display_name == "普威爾"


def test_the_old_spelling_still_resolves(db, sample_anime):
    """
    Decision E: a Pull from a pre-migration sheet must not mint a twin.

    Holds for "Muse木棉花" because the owner's map keeps that exact spelling in
    name_cn. It does NOT hold for "Proware普威爾" or "曼迪 Mightymedia", whose
    map rows keep neither the mashed spelling nor an alt - asserted below so
    the gap is recorded rather than discovered during a restore.
    """
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Muse木棉花",
         "Publisher / Distributor TW")
    db.commit()
    backfill_publishers(db)

    assert find_publisher(db, "Muse木棉花") is not None
    assert len(_converted(db)) == 1


def test_a_split_row_without_an_alt_does_not_answer_to_its_old_spelling(
    db, sample_anime
):
    """Records the known gap - see PUBLISHER_NAME_MAP's round-trip note."""
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Proware普威爾",
         "Publisher / Distributor TW")
    db.commit()
    backfill_publishers(db)

    assert find_publisher(db, "普威爾") is not None
    assert find_publisher(db, "Proware普威爾") is None


def test_scope_is_seeded_from_the_credits(db, sample_anime, manga_entry):
    anime = sample_anime
    manga = manga_entry
    _tag(db, "anime", anime.system_id, "publisher_tw", "角川",
         "Publisher / Distributor TW")
    _tag(db, "manga", manga.system_id, "publisher_tw", "角川",
         "Publisher / Distributor TW")
    db.commit()

    backfill_publishers(db)

    pub = find_publisher(db, "角川")
    assert sorted(s.scope for s in pub.scopes) == ["anime", "manga"]


def test_it_is_idempotent(db, sample_anime):
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "尖端",
         "Publisher / Distributor TW")
    db.commit()

    backfill_publishers(db)
    backfill_publishers(db)

    assert len(_converted(db)) == 1
    assert db.query(models.MediaCredit).filter_by(role="publisher").count() == 1


def test_an_existing_publisher_is_reused_not_duplicated(db, sample_anime):
    db.add(models.Publisher(name_en="Aniplex"))
    anime = sample_anime
    _tag(db, "anime", anime.system_id, "publisher_tw", "Aniplex",
         "Publisher / Distributor TW")
    db.commit()

    backfill_publishers(db)

    assert len(_converted(db)) == 1


def test_a_comic_publisher_tw_row_is_reported_not_dropped(db, sample_comic):
    """Decision C: the column is empty in reality; if it isn't, say so."""
    comic = sample_comic
    _tag(db, "comic", comic.system_id, "publisher_tw", "曼迪 Mightymedia",
         "Publisher / Distributor TW")
    db.commit()

    report = backfill_publishers(db)

    assert report["skipped"] and report["skipped"][0]["media_type"] == "comic"
    assert db.query(models.MediaTag).filter_by(
        media_type="comic", field="publisher_tw"
    ).count() == 1


def test_the_seeded_values_become_entities_with_no_credits(db):
    """
    Decision G: bilibili and Crunchyroll are tagged on nothing, so the walk
    over tag rows would create neither. They are wanted anyway.
    """
    report = backfill_publishers(db)

    assert find_publisher(db, "bilibili") is not None
    assert find_publisher(db, "Crunchyroll") is not None
    assert report["credits"] == 0


def test_a_seeded_value_is_offered_somewhere(db):
    """
    Zero scope rows would mean "offered nowhere" (see PublisherScope), which
    would hide a seeded publisher in every picker and defeat the seeding.
    """
    backfill_publishers(db)

    bilibili = find_publisher(db, "bilibili")
    assert [s.scope for s in bilibili.scopes] == ["anime"]


def test_the_third_unused_value_is_not_seeded(db):
    """bilibili (GoodShow) retires with the vocabulary - the owner's call."""
    backfill_publishers(db)

    assert find_publisher(db, "bilibili (GoodShow)") is None


def test_seeding_is_idempotent(db):
    backfill_publishers(db)
    backfill_publishers(db)

    names = [p.name_en for p in db.query(models.Publisher).all()]
    assert names.count("bilibili") == 1
    assert names.count("Crunchyroll") == 1
