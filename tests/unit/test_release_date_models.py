"""The eight media models expose ISO release columns and constrain them."""

import pytest
from sqlalchemy import String

from app.models import Anime, AnimeMovies, Cartoon, Comic, Manga, Movies, Novel, TVShows
from app.utils.release_date import DATE_COLUMNS

ALL_MEDIA_MODELS = [Anime, AnimeMovies, Movies, TVShows, Cartoon, Manga, Novel, Comic]


@pytest.mark.parametrize("model", ALL_MEDIA_MODELS)
def test_every_date_column_in_the_registry_exists_on_its_model(model):
    columns = model.__table__.columns
    for name in DATE_COLUMNS[model.__tablename__]:
        assert name in columns, f"{model.__tablename__} is missing {name}"


@pytest.mark.parametrize("model", ALL_MEDIA_MODELS)
def test_every_date_column_is_a_nullable_string(model):
    columns = model.__table__.columns
    for name in DATE_COLUMNS[model.__tablename__]:
        column = columns[name]
        assert isinstance(column.type, String), f"{model.__tablename__}.{name} is not String"
        assert column.nullable is True


@pytest.mark.parametrize("model", ALL_MEDIA_MODELS)
def test_every_date_column_carries_a_check_constraint(model):
    constraint_names = {c.name for c in model.__table__.constraints if c.name}
    for name in DATE_COLUMNS[model.__tablename__]:
        expected = f"ck_{model.__tablename__}_{name}_iso"
        assert expected in constraint_names, f"missing {expected}"


def test_anime_no_longer_splits_year_and_month():
    assert "release_year" not in Anime.__table__.columns
    assert "release_month" not in Anime.__table__.columns
    assert "release_date" in Anime.__table__.columns


def test_anime_still_stores_release_season():
    assert "release_season" in Anime.__table__.columns


@pytest.mark.parametrize("model", [Manga, Novel, Comic])
def test_run_types_renamed_year_columns_to_date_columns(model):
    assert "release_year" not in model.__table__.columns
    assert "end_year" not in model.__table__.columns
    assert "release_date" in model.__table__.columns
    assert "end_date" in model.__table__.columns
