"""Release columns are written as text so Sheets cannot reinterpret them.

Google Sheets, given "2024-05-17" under USER_ENTERED, stores a date cell and
hands back the locale rendering ("5/17/2024") on the next get_all_values. A
leading apostrophe forces text and is stripped from the value on read.
"""

from app.models import Anime, Movies
from app.utils.formatter import format_model_for_sheet


def _cell(model_cls, instance, column_name):
    names = [c.name for c in model_cls.__table__.columns]
    return format_model_for_sheet(instance)[names.index(column_name)]


def test_a_full_date_is_escaped():
    anime = Anime(anime_name_en="X", release_date="2024-05-17")
    assert _cell(Anime, anime, "release_date") == "'2024-05-17"


def test_a_month_precision_date_is_escaped():
    anime = Anime(anime_name_en="X", release_date="2024-05")
    assert _cell(Anime, anime, "release_date") == "'2024-05"


def test_a_year_only_date_is_escaped():
    anime = Anime(anime_name_en="X", release_date="2024")
    assert _cell(Anime, anime, "release_date") == "'2024"


def test_an_empty_date_is_not_escaped():
    anime = Anime(anime_name_en="X", release_date=None)
    assert _cell(Anime, anime, "release_date") == ""


def test_both_regional_columns_are_escaped():
    movie = Movies(
        movie_name_en="X", release_date_tw="2024-05", release_date_usa="2023"
    )
    assert _cell(Movies, movie, "release_date_tw") == "'2024-05"
    assert _cell(Movies, movie, "release_date_usa") == "'2023"


def test_a_non_date_column_is_untouched():
    anime = Anime(anime_name_en="Cowboy Bebop", release_date="1998-04")
    assert _cell(Anime, anime, "anime_name_en") == "Cowboy Bebop"
