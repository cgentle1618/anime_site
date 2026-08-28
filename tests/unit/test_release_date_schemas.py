"""Release date fields are validated and normalized at the API boundary."""

import pytest
from pydantic import ValidationError

from app.schemas.anime import AnimeBase
from app.schemas.comic import ComicBase
from app.schemas.movie import MovieBase


def test_anime_accepts_every_precision():
    for value in ("2024", "2024-05", "2024-05-17"):
        assert AnimeBase(release_date=value).release_date == value


def test_anime_accepts_a_null_release_date():
    assert AnimeBase().release_date is None


def test_anime_normalizes_the_legacy_format_on_the_way_in():
    assert AnimeBase(release_date="JUL 2001").release_date == "2001-07"


def test_anime_rejects_an_impossible_month():
    with pytest.raises(ValidationError):
        AnimeBase(release_date="2024-13")


def test_anime_rejects_unparseable_text():
    with pytest.raises(ValidationError):
        AnimeBase(release_date="sometime next year")


def test_movie_validates_both_regional_columns():
    movie = MovieBase(release_date_tw="2024-05", release_date_usa="JUL 2001")
    assert movie.release_date_tw == "2024-05"
    assert movie.release_date_usa == "2001-07"


def test_comic_accepts_an_integer_year_and_stores_it_as_a_string():
    comic = ComicBase(release_date=2020, end_date=2023)
    assert comic.release_date == "2020"
    assert comic.end_date == "2023"
