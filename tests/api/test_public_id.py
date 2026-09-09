"""public_id: the short, per-table sequential id that appears in SPA URLs."""

import importlib.util
import pathlib

import pytest
from sqlalchemy import text
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

_deferral_spec = importlib.util.spec_from_file_location(
    "pdf1e2r3d4e5",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/pdf1e2r3d4e5_defer_public_id_unique.py",
)
_deferral_migration = importlib.util.module_from_spec(_deferral_spec)
_deferral_spec.loader.exec_module(_deferral_migration)

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
    # `media` holds the nine media types' ids now, so it is not part of the
    # historic migration; and the nine detail tables it took them from no
    # longer carry the column. Everything else must still line up exactly.
    tables_with_public_id.discard("media")
    assert set(_migration.TABLES) - MOVED_TO_MEDIA == tables_with_public_id


MOVED_TO_MEDIA = {
    "anime", "anime_movies", "movies", "tv_shows", "cartoons",
    "manga", "novel", "comic", "games",
}


def test_the_nine_media_tables_no_longer_carry_public_id():
    """The other half of the guard above: the column really did move."""
    for table in MOVED_TO_MEDIA:
        assert "public_id" not in Base.metadata.tables[table].columns, table
    assert "public_id" in Base.metadata.tables["media"].columns


def test_every_media_type_keeps_its_own_sequence():
    """
    The per-table sequences are kept on purpose: media.public_id stays
    per-type, so existing ids and every SPA URL built from one are unchanged.
    They are declared against the metadata now that no column hangs them, so
    create_all still makes them.
    """
    from app.models.media_sync import PUBLIC_ID_SEQUENCE

    declared = {seq.name for seq in Base.metadata._sequences.values()}
    for table in MOVED_TO_MEDIA:
        assert f"{table}_public_id_seq" in declared, table
    assert set(PUBLIC_ID_SEQUENCE.values()) == {
        f"{table}_public_id_seq" for table in MOVED_TO_MEDIA
    }


def test_public_id_rejects_a_duplicate(db_session):
    """
    The unique constraint is the guard that makes the id safe to put in a URL.

    It is DEFERRABLE INITIALLY DEFERRED (see the pdf1e2r3d4e5 migration) so a
    Pull can permute public_id across rows inside one transaction, which means
    the violation surfaces at COMMIT rather than at the statement. The fixture
    commits into a SAVEPOINT, which does not trigger a deferred check, so the
    check is forced here the way a real commit would.
    """
    first = models.Anime(anime_name_en="PID Dup A")
    db_session.add(first)
    db_session.flush()

    second = models.Anime(anime_name_en="PID Dup B", public_id=first.public_id)
    db_session.add(second)
    db_session.flush()

    with pytest.raises(IntegrityError):
        db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    db_session.rollback()


def test_deferral_migration_covers_every_table_the_public_id_one_does():
    """The two migrations name the same seventeen tables; a table added to one
    and not the other would leave its constraint immediate, and the next Pull
    would abort partway through that tab."""
    assert set(_deferral_migration.TABLES) == set(_migration.TABLES)


# ---------------------------------------------------------------------------
# public_id lives on `media` for the nine media types
# ---------------------------------------------------------------------------

_MEDIA_ROUTES = [
    ("/api/anime", models.Anime, {"anime_name_cn": "路由測試"}),
    ("/api/anime-movie", models.AnimeMovies, {"anime_movie_name_cn": "路由測試"}),
    ("/api/movies", models.Movies, {"movie_name_cn": "路由測試"}),
    ("/api/tv-shows", models.TVShows, {"tv_name_cn": "路由測試"}),
    ("/api/cartoon", models.Cartoon, {"cartoon_name_cn": "路由測試"}),
    ("/api/manga", models.Manga, {"manga_name_cn": "路由測試"}),
    ("/api/novel", models.Novel, {"novel_name_cn": "路由測試"}),
    ("/api/comic", models.Comic, {"comic_name_cn": "路由測試"}),
    ("/api/game", models.Game, {"game_name_cn": "路由測試"}),
]


@pytest.mark.parametrize(
    "prefix, model, kwargs", _MEDIA_ROUTES, ids=[r[0] for r in _MEDIA_ROUTES]
)
def test_every_media_route_resolves_both_id_forms(
    admin_client, db_session, prefix, model, kwargs
):
    """
    The highest-risk half of moving public_id: _get_or_404 builds its clause
    from the model, and once public_id is only on `media` a naive
    getattr(model, "public_id") 500s all nine detail routes at once.
    """
    entry = model(**kwargs)
    db_session.add(entry)
    db_session.commit()

    by_uuid = admin_client.get(f"{prefix}/{entry.system_id}")
    assert by_uuid.status_code == 200, by_uuid.text
    assert by_uuid.json()["system_id"] == str(entry.system_id)

    by_public = admin_client.get(f"{prefix}/{entry.public_id}")
    assert by_public.status_code == 200, by_public.text
    assert by_public.json()["system_id"] == str(entry.system_id)


def test_a_non_media_route_still_resolves_by_its_own_public_id(
    admin_client, db_session
):
    """
    The eight non-media entities keep public_id on their own table and keep
    using entity_ref_filter unchanged. This is the guard that the media change
    did not reach them.
    """
    person = models.Person(name_en="Ref Person")
    db_session.add(person)
    db_session.commit()

    response = admin_client.get(f"/api/person/{person.public_id}")
    assert response.status_code == 200, response.text
    assert response.json()["system_id"] == str(person.system_id)


def test_public_id_is_unique_per_media_type_not_globally(db_session):
    """
    The per-table sequences stay, so two types can legitimately hold the same
    number. uq_media_type_public_id is what keeps it unique where it matters.
    """
    a = models.Anime(anime_name_cn="編號")
    m = models.Manga(manga_name_cn="編號")
    db_session.add_all([a, m])
    db_session.flush()

    rows = (
        db_session.query(models.Media)
        .filter(models.Media.system_id.in_([a.system_id, m.system_id]))
        .all()
    )
    assert {r.media_type for r in rows} == {"anime", "manga"}
    assert all(r.public_id is not None for r in rows)
