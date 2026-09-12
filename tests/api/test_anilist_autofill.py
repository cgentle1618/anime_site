"""
AniList fills the score and the two all-time ranks, and writes the AniList
link as a media_source reference row.

The refusal tests here are the load-bearing ones, and each SEEDS the entry
with a value first: asserting "a None response does not overwrite" against an
entry that was already empty passes whether or not the guard exists.
"""

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import autofill_from_anilist
from app.services.integrations.anilist import ANIME
from app.utils.source_fields import ANILIST_VALUE, REFERENCE_CATEGORY

FULL = {
    "idMal": 5114,
    "siteUrl": "https://anilist.co/anime/5114",
    "averageScore": 90,
    "rankings": [
        {"rank": 5, "type": "RATED", "allTime": True},
        {"rank": 11, "type": "POPULAR", "allTime": True},
    ],
}

STUB = {
    "idMal": 5114,
    "siteUrl": "https://anilist.co/anime/5114",
    "averageScore": None,
    "rankings": [],
}


def patch_record(monkeypatch, record):
    monkeypatch.setattr(
        autofill_module, "anilist_record", lambda mal_id, media_type: record
    )


def _source_rows(db, entry):
    return {
        option.value: row
        for row, option in db.query(models.MediaSource, models.SystemOption)
        .join(
            models.SystemOption,
            models.SystemOption.system_id == models.MediaSource.option_id,
        )
        .filter(models.MediaSource.media_id == entry.system_id)
        .all()
    }


def test_all_three_values_are_written(db_session, sample_anime, monkeypatch):
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 90
    assert sample_anime.anilist_rank == 5
    assert sample_anime.anilist_popularity_rank == 11


def test_a_fresh_score_replaces_an_old_one(db_session, sample_anime, monkeypatch):
    """The mirror of the refusal test below, on the same fixture: a green here
    proves the write path works, so a green there proves the guard refused."""
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114
    sample_anime.anilist_rating = 77
    sample_anime.anilist_rank = 900

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 90
    assert sample_anime.anilist_rank == 5


def test_a_stub_response_does_not_blank_existing_values(
    db_session, sample_anime, monkeypatch
):
    """
    An idMal can resolve to a near-empty AniList record. Without a per-value
    guard, Replace would wipe a real score with that record's nulls.
    """
    patch_record(monkeypatch, STUB)
    sample_anime.mal_id = 5114
    sample_anime.anilist_rating = 77
    sample_anime.anilist_rank = 900
    sample_anime.anilist_popularity_rank = 950

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 77
    assert sample_anime.anilist_rank == 900
    assert sample_anime.anilist_popularity_rank == 950


def test_a_total_miss_does_not_blank_existing_values(
    db_session, sample_anime, monkeypatch
):
    patch_record(monkeypatch, None)
    sample_anime.mal_id = 5114
    sample_anime.anilist_rating = 77

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 77


def test_a_partial_response_writes_only_what_it_has(
    db_session, sample_anime, monkeypatch
):
    """A title with a score but no all-time ranking keeps its old ranks."""
    patch_record(
        monkeypatch,
        {"idMal": 5114, "siteUrl": None, "averageScore": 82,
         "rankings": [{"rank": 3, "type": "RATED", "allTime": False}]},
    )
    sample_anime.mal_id = 5114
    sample_anime.anilist_rank = 900

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating == 82
    assert sample_anime.anilist_rank == 900


def test_the_anilist_link_becomes_a_reference_row(
    db_session, sample_anime, monkeypatch
):
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114

    autofill_from_anilist(sample_anime, ANIME, db=db_session)
    db_session.flush()

    row = _source_rows(db_session, sample_anime)[ANILIST_VALUE]
    assert row.url == "https://anilist.co/anime/5114"
    assert row.kind == "reference"
    assert row.bucket == "main"
    assert row.name is None


def test_the_link_row_uses_the_reference_vocabulary(
    db_session, sample_anime, monkeypatch
):
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114

    autofill_from_anilist(sample_anime, ANIME, db=db_session)
    db_session.flush()

    option = (
        db_session.query(models.SystemOption)
        .filter(models.SystemOption.value == ANILIST_VALUE)
        .one()
    )
    assert option.category == REFERENCE_CATEGORY


def test_an_existing_link_row_is_left_alone(db_session, sample_anime, monkeypatch):
    """upsert_main_source is fill-only: a hand-entered link wins."""
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114
    from app.services.domain.sources import upsert_main_source

    upsert_main_source(
        db_session, sample_anime.system_id, "reference", ANILIST_VALUE,
        "https://anilist.co/anime/typed-by-hand",
    )
    db_session.flush()

    autofill_from_anilist(sample_anime, ANIME, db=db_session)
    db_session.flush()

    row = _source_rows(db_session, sample_anime)[ANILIST_VALUE]
    assert row.url == "https://anilist.co/anime/typed-by-hand"


def test_an_entry_with_no_mal_id_is_skipped(db_session, sample_anime, monkeypatch):
    def explode(mal_id, media_type):
        raise AssertionError("no lookup without a mal_id")

    monkeypatch.setattr(autofill_module, "anilist_record", explode)
    sample_anime.mal_id = None

    autofill_from_anilist(sample_anime, ANIME, db=db_session)

    assert sample_anime.anilist_rating is None


def test_no_session_means_no_source_row_and_no_crash(sample_anime, monkeypatch):
    """The pure-mapping call path passes no db; columns still fill."""
    patch_record(monkeypatch, FULL)
    sample_anime.mal_id = 5114

    autofill_from_anilist(sample_anime, ANIME, db=None)

    assert sample_anime.anilist_rating == 90
