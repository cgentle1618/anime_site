"""
Phase 1 of the expand/contract: the new tables are the truth, and
cover_image_file is written THROUGH so every existing reader - the Sheets
formatters, the download pipelines, the orphan checks, the SPA - keeps working
untouched.

This file guards that invariant. If it goes red, phase 1's entire premise -
"behaviour-neutral for existing readers" - has stopped holding.
"""

import io

import pytest
from PIL import Image as PILImage

from app import models
from app.services.integrations import image_library


@pytest.fixture(autouse=True)
def _library_in_tmp(tmp_path, monkeypatch):
    monkeypatch.setattr(image_library, "STATIC_DIR", str(tmp_path))


def _png(color=(200, 30, 30)):
    buf = io.BytesIO()
    PILImage.new("RGB", (50, 40), color).save(buf, format="PNG")
    return buf.getvalue()


def _upload(client, color=(200, 30, 30)):
    return client.post(
        "/api/images", files={"file": ("c.png", _png(color), "image/png")}
    ).json()


def test_attaching_a_cover_writes_the_mirror_column(
    admin_client, db_session, sample_anime
):
    image = _upload(admin_client)

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


def test_replacing_a_cover_updates_the_mirror(
    admin_client, db_session, sample_anime
):
    first = _upload(admin_client)
    second = _upload(admin_client, color=(30, 30, 200))
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "role": "cover",
    }

    admin_client.post(f"/api/images/{first['system_id']}/attach", json=body)
    admin_client.post(f"/api/images/{second['system_id']}/attach", json=body)

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file == second["storage_key"]


def test_detaching_clears_the_mirror(admin_client, db_session, sample_anime):
    image = _upload(admin_client)
    attach = admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "role": "cover",
        },
    ).json()

    admin_client.delete(
        f"/api/images/{image['system_id']}/attach/{attach['system_id']}"
    )

    db_session.refresh(sample_anime)
    assert sample_anime.cover_image_file is None


def test_attaching_to_a_meme_writes_the_mirror_column(
    admin_client, db_session, sample_anime
):
    # meme is a non-cover-role owner like quote - both mirror onto their own
    # image_file column rather than cover_image_file.
    meme = admin_client.post(
        "/api/meme/",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "text": "meme",
        },
    ).json()
    image = _upload(admin_client)

    admin_client.post(
        f"/api/images/{image['system_id']}/attach",
        json={
            "owner_type": "meme",
            "owner_id": meme["system_id"],
            "role": "cover",
        },
    )

    db_meme = db_session.get(models.Meme, meme["system_id"])
    db_session.refresh(db_meme)
    assert db_meme.image_file == image["storage_key"]


def test_the_mirror_receives_the_library_storage_key_verbatim(
    admin_client, db_session, sample_anime
):
    # The mirror column is written through unchanged - a new upload's key is
    # `library/<checksum>.jpg`, not rewritten into the `<owner>/<id>.jpg` shape
    # legacy covers use. getCoverUrl's `library/` branch (frontend/src/lib/
    # covers.js) resolves this verbatim key straight to /static/library/..., so
    # it renders correctly in the SPA without any rewriting here.
    image = _upload(admin_client)
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
    assert sample_anime.cover_image_file.startswith("library/")
    assert not sample_anime.cover_image_file.startswith("/")
