"""Multi-region entries resolve through one documented priority order."""

import types

from app.services.domain.watch_order import release_display, release_sort_key


def test_a_movie_prefers_the_taiwan_date():
    movie = types.SimpleNamespace(
        release_date_tw="2024-05-01", release_date_usa="2023-01-01"
    )
    assert release_sort_key(movie, "movie") == (2024, 5, 1)
    assert release_display(movie, "movie") == "2024-05-01"


def test_a_movie_falls_back_to_the_usa_date():
    # TMDB autofills the USA date; TW is manual, so this is the common case.
    movie = types.SimpleNamespace(release_date_tw=None, release_date_usa="2023-01-01")
    assert release_sort_key(movie, "movie") == (2023, 1, 1)


def test_an_anime_movie_prefers_the_japan_date():
    entry = types.SimpleNamespace(release_date_jp="2001-07", release_date_tw="2003-02")
    assert release_sort_key(entry, "anime-movie") == (2001, 7, 1)


def test_an_anime_movie_falls_back_to_the_taiwan_date():
    entry = types.SimpleNamespace(release_date_jp=None, release_date_tw="2003-02")
    assert release_sort_key(entry, "anime-movie") == (2003, 2, 1)


def test_an_undated_entry_sorts_last():
    entry = types.SimpleNamespace(release_date=None)
    assert release_sort_key(entry, "manga") == (9999, 99, 99)


def test_a_year_only_entry_sorts_with_the_first_of_that_year():
    year_only = types.SimpleNamespace(release_date="2020")
    exact = types.SimpleNamespace(release_date="2020-01-01")
    assert release_sort_key(year_only, "manga") == release_sort_key(exact, "manga")


def test_display_never_invents_precision():
    entry = types.SimpleNamespace(release_date="2020")
    assert release_display(entry, "manga") == "2020"


def test_anime_display_reads_the_single_column():
    anime = types.SimpleNamespace(release_date="2024-07")
    assert release_display(anime, "anime") == "2024-07"
