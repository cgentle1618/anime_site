"""
Bulk cover-image bookkeeping across every table that owns a stored image.

These guard the orphan classifier: an owner missing from the `referenced` union
in bulk_check_unused_cover_images gets its images reported as orphaned, and
bulk_delete_orphaned_cover_images then deletes them from the bucket.

Images are stored at `<owner_type>/<system_id>.jpg`, so every fixture here uses
that key rather than a bare filename.
"""

import uuid

import pytest

import app.models as models
from app.services import calculation
from app.services.integrations.image_manager import cover_key

# (owner_type, model, name_field) for every media table the bulk actions scan.
MEDIA_MODELS = [
    ("anime", models.Anime, "anime_name_en"),
    ("anime-movie", models.AnimeMovies, "anime_movie_name_en"),
    ("cartoon", models.Cartoon, "cartoon_name_en"),
    ("movie", models.Movies, "movie_name_en"),
    ("tv-show", models.TVShows, "tv_name_en"),
    ("manga", models.Manga, "manga_name_en"),
    ("novel", models.Novel, "novel_name_en"),
    ("comic", models.Comic, "comic_name_en"),
    ("game", models.Game, "game_name_en"),
]
IDS = [m.__tablename__ for _, m, _ in MEDIA_MODELS]

# The non-media tables that share the same storage: portraits and logos. They
# have no cover_image_file, which is exactly why they were being reported as
# orphaned - and then deleted.
ENTITY_MODELS = [
    ("staff", models.Person, "name_en", "photo_file"),
    ("character", models.Character, "name_en", "photo_file"),
    ("publisher", models.Publisher, "name_en", "logo_file"),
    ("studio", models.Studio, "name_en", "logo_file"),
]
ENTITY_IDS = [owner for owner, _, _, _ in ENTITY_MODELS]


def _listing(*keys):
    """Stand-in for list_all_cover_images, which takes an optional owner filter."""

    def _list(owner_type=None):
        return [k for k in keys if owner_type is None or k.startswith(f"{owner_type}/")]

    return _list


@pytest.mark.parametrize("owner,model,name_field", MEDIA_MODELS, ids=IDS)
def test_a_stamped_cover_is_never_orphaned(
    db_session, monkeypatch, owner, model, name_field
):
    system_id = uuid.uuid4()
    key = cover_key(owner, str(system_id))
    db_session.add(
        model(
            **{
                "system_id": system_id,
                name_field: "Cover Owner",
                "cover_image_file": key,
            }
        )
    )
    db_session.flush()

    monkeypatch.setattr(calculation, "list_all_cover_images", _listing(key))

    result = calculation.bulk_check_unused_cover_images(db_session)
    assert result["orphaned"] == []
    assert result["should_use"] == []


@pytest.mark.parametrize("owner,model,name_field", MEDIA_MODELS, ids=IDS)
def test_an_unstamped_cover_is_reported_as_should_use_not_orphaned(
    db_session, monkeypatch, owner, model, name_field
):
    # cover_image_file is NULL, so the file is not in `referenced` - it must
    # still be matched to its entry through the owner map rather than deleted.
    system_id = uuid.uuid4()
    key = cover_key(owner, str(system_id))
    db_session.add(model(**{"system_id": system_id, name_field: "Cover Owner"}))
    db_session.flush()

    monkeypatch.setattr(calculation, "list_all_cover_images", _listing(key))

    result = calculation.bulk_check_unused_cover_images(db_session)
    assert result["orphaned"] == []
    assert [e["system_id"] for e in result["should_use"]] == [str(system_id)]


@pytest.mark.parametrize(
    "owner,model,name_field,column", ENTITY_MODELS, ids=ENTITY_IDS
)
def test_a_portrait_or_logo_is_never_orphaned(
    db_session, monkeypatch, owner, model, name_field, column
):
    """Regression: these tables were absent from the scan, so every portrait
    and logo was reported as orphaned and deleted by the orphan sweep."""
    system_id = uuid.uuid4()
    key = cover_key(owner, str(system_id))
    db_session.add(
        model(**{"system_id": system_id, name_field: "Named Entity", column: key})
    )
    db_session.flush()

    monkeypatch.setattr(calculation, "list_all_cover_images", _listing(key))

    result = calculation.bulk_check_unused_cover_images(db_session)
    assert result["orphaned"] == []
    assert result["should_use"] == []


def test_a_casting_override_photo_is_never_orphaned(db_session, monkeypatch):
    """A casting may carry its own photo of a character; it lives in the same
    storage under the character folder and is referenced from that column."""
    character_id = uuid.uuid4()
    db_session.add(models.Character(system_id=character_id, name_en="Yuki"))
    db_session.flush()

    override = cover_key("character", str(uuid.uuid4()))
    db_session.add(
        models.CharacterCasting(
            character_id=character_id,
            media_type="anime",
            entry_id=uuid.uuid4(),
            photo_file=override,
        )
    )
    db_session.flush()

    monkeypatch.setattr(calculation, "list_all_cover_images", _listing(override))

    result = calculation.bulk_check_unused_cover_images(db_session)
    assert result["orphaned"] == []


@pytest.mark.parametrize("owner,model,name_field", MEDIA_MODELS, ids=IDS)
def test_bulk_set_cover_image_fields_stamps_every_media_type(
    db_session, monkeypatch, owner, model, name_field
):
    system_id = uuid.uuid4()
    entry = model(**{"system_id": system_id, name_field: "Cover Owner"})
    db_session.add(entry)
    db_session.flush()

    monkeypatch.setattr(calculation, "cover_image_exists", lambda owner_type, sid: True)
    # commit() would end the test transaction; the assertion only needs the
    # in-session value, so keep the write local.
    monkeypatch.setattr(db_session, "commit", lambda: None)

    calculation.bulk_set_cover_image_fields(db_session)
    assert entry.cover_image_file == f"{owner}/{system_id}.jpg"


def test_orphan_deletion_only_touches_unreferenced_files(db_session, monkeypatch):
    comic_id = uuid.uuid4()
    key = cover_key("comic", str(comic_id))
    db_session.add(
        models.Comic(
            system_id=comic_id,
            comic_name_en="Amazing Spider-Man",
            cover_image_file=key,
        )
    )
    db_session.flush()

    stray = cover_key("comic", str(uuid.uuid4()))
    monkeypatch.setattr(calculation, "list_all_cover_images", _listing(key, stray))
    deleted = []
    monkeypatch.setattr(
        "app.services.integrations.image_manager.delete_cover_image",
        lambda owner_type, sid: deleted.append((owner_type, sid)),
    )

    result = calculation.bulk_delete_orphaned_cover_images(db_session)
    assert result["deleted_count"] == 1
    assert deleted == [("comic", stray.split("/")[1][:-4])]


def test_download_missing_covers_refetches_comics(db_session, monkeypatch):
    # The check reports comics whose cover_image_file is stamped but whose file
    # is gone; the download must actually re-fetch them from Comic Vine.
    comic_id = uuid.uuid4()
    comic = models.Comic(
        system_id=comic_id,
        comic_name_en="Amazing Spider-Man",
        comicvine_id=1234,
        cover_image_file=cover_key("comic", str(comic_id)),
    )
    db_session.add(comic)
    db_session.flush()

    monkeypatch.setattr(
        calculation, "cover_image_exists", lambda owner_type, sid: False
    )
    monkeypatch.setattr(db_session, "commit", lambda: None)

    called = []

    def fake_autofill(entry, db):
        called.append(entry.system_id)
        entry.cover_image_file = cover_key("comic", str(entry.system_id))

    monkeypatch.setattr(calculation, "autofill_comic_from_comicvine", fake_autofill)

    result = calculation.bulk_download_missing_covers(
        db_session, system_ids=[str(comic_id)]
    )
    assert called == [comic_id]
    assert "Downloaded 1 of 1" in result["message"]


def test_download_missing_covers_skips_comics_without_comicvine_id(
    db_session, monkeypatch
):
    comic_id = uuid.uuid4()
    db_session.add(
        models.Comic(
            system_id=comic_id,
            comic_name_en="Homemade Zine",
            cover_image_file=cover_key("comic", str(comic_id)),
        )
    )
    db_session.flush()

    monkeypatch.setattr(
        calculation, "cover_image_exists", lambda owner_type, sid: False
    )
    monkeypatch.setattr(db_session, "commit", lambda: None)
    monkeypatch.setattr(
        calculation,
        "autofill_comic_from_comicvine",
        lambda entry, db: pytest.fail("should not autofill without a comicvine_id"),
    )

    result = calculation.bulk_download_missing_covers(
        db_session, system_ids=[str(comic_id)]
    )
    assert "Downloaded 0 of 1" in result["message"]
    assert "1 skipped" in result["message"]


def test_check_cover_image_reports_a_game_whose_file_is_gone(db_session, monkeypatch):
    """The missing-file scan hand-lists its models; Game was never added, so a
    game with a stamped cover and no file was silently never checked."""
    game_id = uuid.uuid4()
    db_session.add(
        models.Game(
            system_id=game_id,
            game_name_en="Hollow Knight",
            cover_image_file=cover_key("game", str(game_id)),
        )
    )
    db_session.flush()

    monkeypatch.setattr(calculation, "list_all_cover_images", _listing())
    monkeypatch.setattr(
        calculation, "cover_image_exists", lambda owner_type, sid: False
    )

    result = calculation.bulk_check_cover_image(db_session)
    assert [m["system_id"] for m in result["missing"]] == [str(game_id)]
    assert result["total_checked"] == 1


def test_download_missing_covers_refetches_games(db_session, monkeypatch):
    game_id = uuid.uuid4()
    db_session.add(
        models.Game(
            system_id=game_id,
            game_name_en="Hollow Knight",
            igdb_id=1234,
            cover_image_file=cover_key("game", str(game_id)),
        )
    )
    db_session.flush()

    monkeypatch.setattr(
        calculation, "cover_image_exists", lambda owner_type, sid: False
    )
    monkeypatch.setattr(db_session, "commit", lambda: None)

    called = []

    def fake_autofill(entry, db):
        called.append(entry.system_id)
        entry.cover_image_file = cover_key("game", str(entry.system_id))

    monkeypatch.setattr(calculation, "autofill_game_from_igdb", fake_autofill)

    result = calculation.bulk_download_missing_covers(
        db_session, system_ids=[str(game_id)]
    )
    assert called == [game_id]
    assert "Downloaded 1 of 1" in result["message"]


def test_download_missing_covers_skips_games_without_igdb_id(db_session, monkeypatch):
    game_id = uuid.uuid4()
    db_session.add(
        models.Game(
            system_id=game_id,
            game_name_en="Some Itch Game",
            cover_image_file=cover_key("game", str(game_id)),
        )
    )
    db_session.flush()

    monkeypatch.setattr(
        calculation, "cover_image_exists", lambda owner_type, sid: False
    )
    monkeypatch.setattr(db_session, "commit", lambda: None)
    monkeypatch.setattr(
        calculation,
        "autofill_game_from_igdb",
        lambda entry, db: pytest.fail("should not autofill without an igdb_id"),
    )

    result = calculation.bulk_download_missing_covers(
        db_session, system_ids=[str(game_id)]
    )
    assert "Downloaded 0 of 1" in result["message"]
    assert "1 skipped" in result["message"]
