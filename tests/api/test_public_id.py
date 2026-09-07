"""public_id: the short, per-table sequential id that appears in SPA URLs."""

import importlib.util
import pathlib

import pytest
from sqlalchemy.exc import IntegrityError

from app import models
from app.database import Base

# Loaded by path: alembic/versions is not an importable package.
_spec = importlib.util.spec_from_file_location(
    "pid1a2b3c4d5",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/pid1a2b3c4d5_add_public_id.py",
)
_migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_migration)

# (model, kwargs sufficient to insert a bare row)
SEVENTEEN = [
    (models.Anime, {"anime_name_en": "PID Anime"}),
    (models.AnimeMovies, {"anime_movie_name_en": "PID Anime Movie"}),
    (models.Movies, {"movie_name_en": "PID Movie"}),
    (models.TVShows, {"tv_name_en": "PID TV"}),
    (models.Cartoon, {"cartoon_name_en": "PID Cartoon"}),
    (models.Manga, {"manga_name_en": "PID Manga"}),
    (models.Novel, {"novel_name_en": "PID Novel"}),
    (models.Comic, {"comic_name_en": "PID Comic"}),
    (models.Game, {"game_name_en": "PID Game"}),
    (models.Collection, {"collection_name_en": "PID Collection"}),
    (models.Franchise, {"franchise_name_en": "PID Franchise"}),
    (models.Series, {"series_name_en": "PID Series"}),
    (models.Person, {"name_en": "PID Person"}),
    (models.Studio, {"name_en": "PID Studio"}),
    (models.Publisher, {"name_en": "PID Publisher"}),
    (models.Character, {"name_en": "PID Character"}),
    (models.WatchOrderList, {"list_name": "PID Order"}),
]


def _kwargs_with_owner(model, kwargs, db_session):
    """WatchOrderList has a check constraint requiring exactly one of
    franchise_id/collection_id/series_id to be set; give it a real owner so
    the insert reaches the public_id assignment being tested here, rather
    than failing on an unrelated constraint."""
    if model is models.WatchOrderList and "collection_id" not in kwargs:
        owner = models.Collection(collection_name_en="PID Order Owner")
        db_session.add(owner)
        db_session.flush()
        return {**kwargs, "collection_id": owner.system_id}
    return kwargs


@pytest.mark.parametrize("model,kwargs", SEVENTEEN, ids=lambda v: getattr(v, "__name__", ""))
def test_public_id_is_assigned_on_insert(db_session, model, kwargs):
    """An insert that never mentions public_id still gets one."""
    kwargs = _kwargs_with_owner(model, kwargs, db_session)
    row = model(**kwargs)
    db_session.add(row)
    db_session.flush()
    assert isinstance(row.public_id, int)
    assert row.public_id > 0


_UNIQUE_NAME_MODELS = (models.Person, models.Studio, models.Publisher)


@pytest.mark.parametrize("model,kwargs", SEVENTEEN, ids=lambda v: getattr(v, "__name__", ""))
def test_public_id_increases_and_is_unique(db_session, model, kwargs):
    kwargs = _kwargs_with_owner(model, kwargs, db_session)
    first_kwargs = kwargs
    second_kwargs = kwargs
    if model in _UNIQUE_NAME_MODELS:
        # These three carry a uniqueness constraint on the full name tuple;
        # an identical second row would fail on that, not on public_id.
        second_kwargs = {**kwargs, "name_en": kwargs["name_en"] + " 2"}
    first = model(**first_kwargs)
    second = model(**second_kwargs)
    db_session.add_all([first, second])
    db_session.flush()
    assert second.public_id > first.public_id


def test_migration_tables_match_models_with_a_public_id_column():
    """Nothing else exercises the migration: the suite builds its schema with
    create_all, so a model gaining public_id without a matching migration
    entry (or vice versa) would otherwise be silent."""
    tables_with_public_id = {
        name
        for name, table in Base.metadata.tables.items()
        if "public_id" in table.columns
    }
    assert set(_migration.TABLES) == tables_with_public_id


def test_public_id_rejects_a_duplicate(db_session):
    """The unique index is the guard that makes the id safe to put in a URL."""
    first = models.Anime(anime_name_en="PID Dup A")
    db_session.add(first)
    db_session.flush()

    second = models.Anime(anime_name_en="PID Dup B", public_id=first.public_id)
    db_session.add(second)
    with pytest.raises(IntegrityError):
        db_session.flush()
    db_session.rollback()
