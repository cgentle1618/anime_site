"""
Fill writes Tenrai's Official site and Twitter links as media_source rows.

They used to go into the `official_link` / `twitter_link` columns, which
nothing reads any more and which the drop migration removes - so Fill had
silently stopped populating either. The links now become `reference` / `main`
rows resolved against the Reference Source vocabulary, and Fill's own rule
holds: fill what is empty, never overwrite what is already there.
"""

import pytest

from app import models
from app.services.domain import autofill as autofill_module
from app.services.domain.autofill import (
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
)
from app.utils.source_fields import (
    OFFICIAL_SITE_VALUE,
    REFERENCE_CATEGORY,
    TWITTER_VALUE,
)

RAW = {
    "type": "TV",
    "status": "Finished Airing",
    "season": "winter",
    "aired": {"prop": {"from": {"day": 7, "month": 1, "year": 2023}}},
    "score": 8.5,
    "rank": 42,
    "episodes": 12,
    "external": [
        {"name": "Official Site", "url": "https://official.test"},
        {"name": "X", "url": "https://twitter.com/show"},
    ],
    "images": {},
}


@pytest.fixture
def patched(monkeypatch):
    monkeypatch.setattr(
        autofill_module, "fetch_tenrai_anime_data", lambda mal_id: RAW
    )


def _rows(db, media_type, entry):
    return {
        option.value: row
        for row, option in db.query(models.MediaSource, models.SystemOption)
        .join(
            models.SystemOption,
            models.SystemOption.system_id == models.MediaSource.option_id,
        )
        .filter(
            models.MediaSource.media_type == media_type,
            models.MediaSource.entry_id == entry.system_id,
        )
        .all()
    }


def test_fill_writes_the_two_reference_rows(db_session, sample_anime, patched):
    sample_anime.mal_id = "1"

    autofill_anime_from_mal(sample_anime, db=db_session)
    db_session.flush()

    rows = _rows(db_session, "anime", sample_anime)
    assert rows[OFFICIAL_SITE_VALUE].url == "https://official.test"
    assert rows[TWITTER_VALUE].url == "https://twitter.com/show"
    for row in rows.values():
        assert row.kind == "reference"
        assert row.bucket == "main"
        assert row.name is None


def test_the_rows_use_the_reference_vocabulary(db_session, sample_anime, patched):
    sample_anime.mal_id = "1"

    autofill_anime_from_mal(sample_anime, db=db_session)
    db_session.flush()

    categories = {
        o.category
        for o in db_session.query(models.SystemOption)
        .filter(models.SystemOption.value.in_([OFFICIAL_SITE_VALUE, TWITTER_VALUE]))
        .all()
    }
    assert categories == {REFERENCE_CATEGORY}


def test_an_existing_row_is_not_overwritten(db_session, sample_anime, patched):
    sample_anime.mal_id = "1"
    option = models.SystemOption(
        category=REFERENCE_CATEGORY, value=OFFICIAL_SITE_VALUE
    )
    db_session.add(option)
    db_session.flush()
    db_session.add(
        models.MediaSource(
            media_type="anime",
            entry_id=sample_anime.system_id,
            kind="reference",
            bucket="main",
            option_id=option.system_id,
            url="https://mine.test",
        )
    )
    db_session.flush()

    autofill_anime_from_mal(sample_anime, db=db_session)
    db_session.flush()

    rows = _rows(db_session, "anime", sample_anime)
    assert rows[OFFICIAL_SITE_VALUE].url == "https://mine.test"


def test_the_retired_columns_are_never_written(db_session, sample_anime, patched):
    sample_anime.mal_id = "1"

    autofill_anime_from_mal(sample_anime, db=db_session)

    assert sample_anime.official_link is None
    assert sample_anime.twitter_link is None


def test_anime_movie_fill_writes_them_too(
    db_session, sample_franchise, patched
):
    entry = models.AnimeMovies(
        franchise_id=sample_franchise.system_id,
        anime_movie_name_en="Filled Movie",
        mal_id="1",
    )
    db_session.add(entry)
    db_session.flush()

    autofill_anime_movie_from_mal(entry, db=db_session)
    db_session.flush()

    rows = _rows(db_session, "anime-movie", entry)
    assert set(rows) == {OFFICIAL_SITE_VALUE, TWITTER_VALUE}
    assert entry.official_link is None
