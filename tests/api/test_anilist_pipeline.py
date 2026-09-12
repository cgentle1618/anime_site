"""
AniList rides the existing anime/manga/novel pipelines rather than adding one.

The eligibility assertion is the important one: anilist_rank is permanently
null for obscure entries, so if it ever reached ANIME_FIELDS_TO_FILL those
entries would be re-requested on every run for ever.
"""

from app.services.pipelines.specs import PIPELINES
from app.utils.utils import (
    ANIME_FIELDS_TO_FILL,
    ANIME_MOVIE_FIELDS_TO_FILL,
    MANGA_FIELDS_TO_FILL,
    NOVEL_FIELDS_TO_FILL,
)

ANILIST_COLUMNS = {"anilist_rating", "anilist_rank", "anilist_popularity_rank"}


def test_anilist_columns_are_not_fill_eligibility_fields():
    for fields in (
        ANIME_FIELDS_TO_FILL,
        ANIME_MOVIE_FIELDS_TO_FILL,
        MANGA_FIELDS_TO_FILL,
        NOVEL_FIELDS_TO_FILL,
    ):
        assert ANILIST_COLUMNS.isdisjoint(fields)


def test_the_four_anilist_pipelines_prime_the_cache():
    for key in ("anime", "anime-movie", "manga", "novel"):
        assert PIPELINES[key].pre_run is not None, key


def test_pipelines_without_anilist_do_not_prime_it():
    """Movie, TV show, cartoon and comic have no AniList record to fetch."""
    for key in ("movie", "tv-show", "cartoon", "comic"):
        assert PIPELINES[key].pre_run is None, key


def test_fill_calls_both_sources_for_anime(monkeypatch, db_session, sample_anime):
    from app.services.pipelines import specs as specs_module

    called = []
    monkeypatch.setattr(
        specs_module, "autofill_anime_from_mal",
        lambda e, force_replace_ratings=True, db=None: called.append("mal"),
    )
    monkeypatch.setattr(
        specs_module, "autofill_from_anilist",
        lambda e, t, db=None: called.append(f"anilist:{t}"),
    )

    PIPELINES["anime"].fill(db_session, sample_anime)

    assert called == ["mal", "anilist:ANIME"]


def test_manga_fill_gives_anilist_the_session(monkeypatch, db_session, sample_manga):
    """
    Manga's Tenrai autofill takes no db and is left alone; the AniList half
    needs one for its media_source row and gets it from the spec helper.
    """
    from app.services.pipelines import specs as specs_module

    seen = {}
    monkeypatch.setattr(
        specs_module, "autofill_manga_from_mal",
        lambda e, force_replace_ratings=True: None,
    )
    monkeypatch.setattr(
        specs_module, "autofill_from_anilist",
        lambda e, t, db=None: seen.update(db=db, type=t),
    )

    PIPELINES["manga"].fill(db_session, sample_manga)

    assert seen["db"] is db_session
    assert seen["type"] == "MANGA"
