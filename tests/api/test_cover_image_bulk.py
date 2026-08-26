"""
Bulk cover-image bookkeeping across every media table.

These guard the orphan classifier: a media type missing from the `referenced`
union in bulk_check_unused_cover_images gets its covers reported as orphaned,
and bulk_delete_orphaned_cover_images then deletes them from the bucket.
"""

import uuid

import pytest

import app.models as models
from app.services import calculation

# (model, name_field) for every table the cover-image bulk actions scan.
MEDIA_MODELS = [
    (models.Anime, "anime_name_en"),
    (models.AnimeMovies, "anime_movie_name_en"),
    (models.Cartoon, "cartoon_name_en"),
    (models.Movies, "movie_name_en"),
    (models.TVShows, "tv_name_en"),
    (models.Manga, "manga_name_en"),
    (models.Novel, "novel_name_en"),
    (models.Comic, "comic_name_en"),
]
IDS = [m.__tablename__ for m, _ in MEDIA_MODELS]


@pytest.mark.parametrize("model,name_field", MEDIA_MODELS, ids=IDS)
def test_a_stamped_cover_is_never_orphaned(db_session, monkeypatch, model, name_field):
    system_id = uuid.uuid4()
    filename = f"{system_id}.jpg"
    db_session.add(
        model(
            **{
                "system_id": system_id,
                name_field: "Cover Owner",
                "cover_image_file": filename,
            }
        )
    )
    db_session.flush()

    monkeypatch.setattr(calculation, "list_all_cover_images", lambda: [filename])

    result = calculation.bulk_check_unused_cover_images(db_session)
    assert result["orphaned"] == []
    assert result["should_use"] == []


@pytest.mark.parametrize("model,name_field", MEDIA_MODELS, ids=IDS)
def test_an_unstamped_cover_is_reported_as_should_use_not_orphaned(
    db_session, monkeypatch, model, name_field
):
    # cover_image_file is NULL, so the file is not in `referenced` - it must
    # still be matched to its entry through entry_map rather than deleted.
    system_id = uuid.uuid4()
    filename = f"{system_id}.jpg"
    db_session.add(model(**{"system_id": system_id, name_field: "Cover Owner"}))
    db_session.flush()

    monkeypatch.setattr(calculation, "list_all_cover_images", lambda: [filename])

    result = calculation.bulk_check_unused_cover_images(db_session)
    assert result["orphaned"] == []
    assert [e["system_id"] for e in result["should_use"]] == [str(system_id)]


@pytest.mark.parametrize("model,name_field", MEDIA_MODELS, ids=IDS)
def test_bulk_set_cover_image_fields_stamps_every_media_type(
    db_session, monkeypatch, model, name_field
):
    system_id = uuid.uuid4()
    entry = model(**{"system_id": system_id, name_field: "Cover Owner"})
    db_session.add(entry)
    db_session.flush()

    monkeypatch.setattr(calculation, "cover_image_exists", lambda sid: True)
    # commit() would end the test transaction; the assertion only needs the
    # in-session value, so keep the write local.
    monkeypatch.setattr(db_session, "commit", lambda: None)

    calculation.bulk_set_cover_image_fields(db_session)
    assert entry.cover_image_file == f"{system_id}.jpg"


def test_orphan_deletion_only_touches_unreferenced_files(db_session, monkeypatch):
    comic_id = uuid.uuid4()
    db_session.add(
        models.Comic(
            system_id=comic_id,
            comic_name_en="Amazing Spider-Man",
            cover_image_file=f"{comic_id}.jpg",
        )
    )
    db_session.flush()

    stray = f"{uuid.uuid4()}.jpg"
    monkeypatch.setattr(
        calculation, "list_all_cover_images", lambda: [f"{comic_id}.jpg", stray]
    )
    deleted = []
    monkeypatch.setattr(
        "app.services.integrations.image_manager.delete_cover_image",
        lambda stem: deleted.append(stem),
    )

    result = calculation.bulk_delete_orphaned_cover_images(db_session)
    assert result["deleted_count"] == 1
    assert deleted == [stray[:-4]]
