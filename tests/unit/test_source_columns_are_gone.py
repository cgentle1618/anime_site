"""The old source columns are gone from every model.

Their data now lives in `media_source` (and the serialization tags in
`media_tag`), copied over by the backfill migration and verified row by row.
This is the tripwire that keeps a column from creeping back onto a model.
"""

import pytest

from app.utils.media_resolver import MEDIA_TABLES

DROPPED = (
    "source_baha",
    "baha_link",
    "source_netflix",
    "source_other",
    "official_link",
    "twitter_link",
    "anilist_link",
)

KEPT = ("mal_link", "imdb_link", "comicvine_link")


@pytest.mark.parametrize("media_type", sorted(MEDIA_TABLES))
def test_no_old_source_column_survives(media_type):
    columns = MEDIA_TABLES[media_type].model.__table__.columns
    for name in DROPPED:
        assert name not in columns, f"{media_type} still has {name}"


def test_the_id_bearing_links_are_untouched():
    """The Fill pipeline extracts external ids out of these, so they stay."""
    assert "mal_link" in MEDIA_TABLES["anime"].model.__table__.columns
    assert "imdb_link" in MEDIA_TABLES["movie"].model.__table__.columns
    assert "comicvine_link" in MEDIA_TABLES["comic"].model.__table__.columns


def test_serialization_platform_is_no_longer_a_column():
    assert (
        "serialization_platform"
        not in MEDIA_TABLES["manga"].model.__table__.columns
    )
