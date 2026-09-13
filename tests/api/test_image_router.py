"""
The image upload router: upload, list, attach, detach, delete.

`hidden_anime`, `nsfw_label` and `catalog_writer` are imported from conftest,
matching the pattern the rest of tests/api/ uses. nsfw_label is NOT decoration
here - without a content label in the graph the refusal test below has nothing
to refuse and passes vacuously on a fresh database.
"""

import io
import uuid

import pytest
from PIL import Image as PILImage

from app import models
from app.services.integrations import image_library
from tests.api.conftest import (  # noqa: F401
    catalog_writer,
    hidden_anime,
    nsfw_label,
)


@pytest.fixture(autouse=True)
def _library_in_tmp(tmp_path, monkeypatch):
    """Never write into the developer's real static/library during a test."""
    monkeypatch.setattr(image_library, "STATIC_DIR", str(tmp_path))


def _png(width=50, height=40, color=(200, 30, 30)):
    buf = io.BytesIO()
    PILImage.new("RGB", (width, height), color).save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, data=None, filename="cover.png", content_type="image/png"):
    return client.post(
        "/api/images",
        files={"file": (filename, data if data is not None else _png(), content_type)},
    )


# ---------------------------------------------------------------------------
# Upload
# ---------------------------------------------------------------------------

def test_upload_stores_the_image_and_returns_the_row(admin_client, db_session):
    response = _upload(admin_client)

    assert response.status_code == 201
    body = response.json()
    assert body["storage_key"].startswith("library/")
    assert body["width"] == 50
    assert len(body["checksum"]) == 64
    assert db_session.query(models.Image).count() == 1


def test_upload_attaches_nothing_on_its_own(admin_client, db_session):
    _upload(admin_client)

    assert db_session.query(models.ImageAttachment).count() == 0


def test_uploading_the_same_picture_twice_makes_one_row(admin_client, db_session):
    first = _upload(admin_client).json()
    second = _upload(admin_client).json()

    assert first["system_id"] == second["system_id"]
    assert db_session.query(models.Image).count() == 1


def test_upload_records_who_uploaded_it(admin_client, db_session, admin_user):
    _upload(admin_client)

    image = db_session.query(models.Image).one()
    assert image.uploaded_by == admin_user.id


def test_upload_rejects_a_file_that_is_not_an_image(admin_client):
    response = _upload(admin_client, data=b"PK\x03\x04 nope", filename="cover.jpg")

    assert response.status_code == 422
    assert "image" in response.json()["detail"].lower()


def test_upload_rejects_a_file_over_the_cap(admin_client, monkeypatch):
    from app.routers import images as images_router

    monkeypatch.setattr(images_router, "MAX_UPLOAD_BYTES", 100)

    response = _upload(admin_client, data=_png(width=400, height=400))

    assert response.status_code == 413


def test_upload_requires_manage_catalog(client):
    assert _upload(client).status_code == 401


def test_upload_is_refused_to_a_signed_in_member(user_client):
    assert _upload(user_client).status_code == 401


# ---------------------------------------------------------------------------
# Attach
# ---------------------------------------------------------------------------

def test_attach_links_the_image_to_an_entry(admin_client, db_session, sample_anime):
    image = _upload(admin_client).json()

    response = admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 201
    attachment = db_session.query(models.ImageAttachment).one()
    assert attachment.owner_type == "anime"
    assert attachment.owner_id == sample_anime.system_id


def test_attaching_again_replaces_rather_than_duplicating(
    admin_client, db_session, sample_anime
):
    first = _upload(admin_client).json()
    second = _upload(admin_client, data=_png(color=(30, 30, 200))).json()
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "role": "cover",
    }

    admin_client.post(f"/api/images/{first['system_id']}/attach", json=body)
    admin_client.post(f"/api/images/{second['system_id']}/attach", json=body)

    attachment = db_session.query(models.ImageAttachment).one()
    assert str(attachment.image_id) == second["system_id"]


def test_attach_rejects_an_unknown_owner_type(admin_client, sample_anime):
    image = _upload(admin_client).json()

    response = admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "not-a-table",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 400


def test_attach_404s_on_a_missing_image(admin_client, sample_anime):
    response = admin_client.post(
        f"/api/images/{uuid.uuid4()}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 404


# ---------------------------------------------------------------------------
# The content-label gate
#
# manage.catalog says NOTHING about which entries you may reach. A writer who
# cannot SEE a labelled entry must not be able to write to it - attaching a
# cover is a write. Both cases are asserted with the same fixtures, so a green
# proves the gate did the refusing rather than something incidental.
# ---------------------------------------------------------------------------

def test_attach_404s_for_a_writer_who_cannot_see_the_entry(
    db_session, client, catalog_writer, hidden_anime  # noqa: F811
):
    writer = catalog_writer(username="blindwriter", label_keys=())
    upload = writer.post(
        "/api/images", files={"file": ("c.png", _png(), "image/png")}
    )
    assert upload.status_code == 201

    response = writer.post(
        f"/api/images/{upload.json()['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(hidden_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 404
    assert db_session.query(models.ImageAttachment).count() == 0


def test_attach_succeeds_for_a_writer_who_holds_the_label(
    db_session, client, catalog_writer, hidden_anime  # noqa: F811
):
    writer = catalog_writer(username="seeingwriter", label_keys=("nsfw",))
    upload = writer.post(
        "/api/images", files={"file": ("c.png", _png(), "image/png")}
    )

    response = writer.post(
        f"/api/images/{upload.json()['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(hidden_anime.system_id),
            "role": "cover",
        },
    )

    assert response.status_code == 201
    assert db_session.query(models.ImageAttachment).count() == 1


# ---------------------------------------------------------------------------
# List, detach, delete
# ---------------------------------------------------------------------------

def test_list_returns_the_library(admin_client):
    _upload(admin_client)

    response = admin_client.get("/api/images")

    assert response.status_code == 200
    assert len(response.json()["images"]) == 1


def test_list_unused_filters_to_unattached_images(admin_client, sample_anime):
    attached = _upload(admin_client).json()
    _upload(admin_client, data=_png(color=(30, 30, 200)))
    admin_client.post(
        f"/api/images/{attached['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = admin_client.get("/api/images?unused=true")

    assert len(response.json()["images"]) == 1
    assert response.json()["images"][0]["system_id"] != attached["system_id"]


def test_list_missing_reports_a_reference_with_no_file(
    admin_client, db_session, tmp_path
):
    # The normal state after a machine switch: uploaded images never travel
    # through Backup or Pull, so the row is live and the bytes are elsewhere.
    image = _upload(admin_client).json()
    (tmp_path / "library" / f"{image['checksum']}.jpg").unlink()

    response = admin_client.get("/api/images?missing=true")

    assert len(response.json()["images"]) == 1
    assert response.json()["images"][0]["missing"] is True


def test_detach_leaves_the_image_in_the_library(
    admin_client, db_session, sample_anime
):
    image = _upload(admin_client).json()
    attach = admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    ).json()

    response = admin_client.delete(
        f"/api/images/{image['system_id']}/attach/{attach['system_id']}"
    )

    assert response.status_code == 204
    assert db_session.query(models.ImageAttachment).count() == 0
    assert db_session.query(models.Image).count() == 1


def test_delete_refuses_while_attached(admin_client, sample_anime):
    image = _upload(admin_client).json()
    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = admin_client.delete(f"/api/images/{image['system_id']}")

    assert response.status_code == 409


def test_delete_force_removes_the_image_and_its_attachments(
    admin_client, db_session, sample_anime
):
    image = _upload(admin_client).json()
    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )

    response = admin_client.delete(f"/api/images/{image['system_id']}?force=true")

    assert response.status_code == 204
    assert db_session.query(models.Image).count() == 0
    assert db_session.query(models.ImageAttachment).count() == 0


def test_delete_force_clears_the_owner_mirror_column(
    admin_client, db_session, sample_anime
):
    # A forced delete removes the attachment row, but that row's mirror
    # column (cover_image_file here) is a plain string, not a foreign key -
    # it does not cascade on its own. Left alone it would still name a file
    # that no longer exists.
    image = _upload(admin_client).json()
    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )
    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file == image["storage_key"]

    response = admin_client.delete(f"/api/images/{image['system_id']}?force=true")

    assert response.status_code == 204
    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file is None


# ---------------------------------------------------------------------------
# The guard on bulk_download_missing_covers
#
# That action nulls cover_image_file and re-fetches from MAL. Against a
# DOWNLOADED cover that is correct and idempotent. Against an UPLOADED one on a
# machine that does not have the file - which is guaranteed to happen, because
# uploaded images never travel through Backup or Pull - it destroys the only
# reference to a file no API can supply, and reports success.
# ---------------------------------------------------------------------------

def test_download_missing_covers_skips_an_uploaded_image(
    admin_client, db_session, sample_anime, tmp_path
):
    from app.services import calculation

    image = _upload(admin_client).json()
    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    )
    sample_anime.cover_image_file = image["storage_key"]
    db_session.flush()
    # The bytes are gone - the other machine has them, this one does not.
    (tmp_path / "library" / f"{image['checksum']}.jpg").unlink()

    result = calculation.bulk_download_missing_covers(db_session)

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file == image["storage_key"]
    assert result["skipped_uploads"] >= 1
