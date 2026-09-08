"""
The remark field is stored as a note row, not a column, but every surface that
wrote it before still writes it the same way.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

from app import models


def _remark_rows(db_session, owner_type, owner_id):
    return (
        db_session.query(models.Note)
        .filter(
            models.Note.owner_type == owner_type,
            models.Note.owner_id == owner_id,
            models.Note.section == "remark",
        )
        .all()
    )


def test_patching_an_anime_remark_creates_one_note_row(
    admin_client, db_session, sample_anime
):
    res = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "重看第三次"}
    )
    assert res.status_code == 200
    assert res.json()["remark"] == "重看第三次"
    assert len(_remark_rows(db_session, "anime", sample_anime.system_id)) == 1


def test_patching_without_remark_leaves_the_note_alone(
    admin_client, db_session, sample_anime
):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "keep me"}
    )
    res = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"ep_fin": 5}
    )
    assert res.status_code == 200
    assert res.json()["remark"] == "keep me"


def test_patching_an_empty_remark_clears_the_note(
    admin_client, db_session, sample_anime
):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "temporary"}
    )
    res = admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": ""}
    )
    assert res.status_code == 200
    assert res.json()["remark"] is None
    assert _remark_rows(db_session, "anime", sample_anime.system_id) == []


def test_a_notes_page_edit_shows_up_on_the_entry(
    admin_client, db_session, sample_anime
):
    # The notes page posts to /api/notes; the entry response must read the
    # same row back.
    res = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "remark",
            "content": "written on the notes page",
        },
    )
    assert res.status_code == 201

    entry = admin_client.get(f"/api/anime/{sample_anime.system_id}")
    assert entry.json()["remark"] == "written on the notes page"


def test_creating_a_movie_with_a_remark_makes_exactly_one_row(
    admin_client, db_session, sample_franchise
):
    res = admin_client.post(
        "/api/movies/",
        json={
            "movie_name_en": "Remarked Movie",
            "franchise_id": str(sample_franchise.system_id),
            "remark": "from the Add form",
        },
    )
    assert res.status_code == 201
    body = res.json()
    assert body["remark"] == "from the Add form"
    assert len(_remark_rows(db_session, "movie", uuid.UUID(body["system_id"]))) == 1


def test_creating_a_collection_with_a_remark_makes_exactly_one_row(
    admin_client, db_session
):
    res = admin_client.post(
        "/api/collection/",
        json={"collection_name_en": "Remarked Collection", "remark": "hub remark"},
    )
    # The collection create endpoint declares no 201, unlike the factory ones.
    assert res.status_code in (200, 201)
    body = res.json()
    assert body["remark"] == "hub remark"
    assert len(_remark_rows(db_session, "collection", uuid.UUID(body["system_id"]))) == 1


def test_the_review_queue_still_finds_remarks(admin_client, db_session, sample_anime):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "needs a rewatch"}
    )
    res = admin_client.get("/api/data-control/check/remarks")
    assert res.status_code == 200
    remarks = [e["remark"] for e in res.json()["anime"]]
    assert "needs a rewatch" in remarks


def test_the_entry_list_carries_the_remark(admin_client, db_session, sample_anime):
    admin_client.patch(
        f"/api/anime/{sample_anime.system_id}", json={"remark": "on the list too"}
    )
    res = admin_client.get("/api/anime/")
    assert res.status_code == 200
    got = [e for e in res.json() if e["system_id"] == str(sample_anime.system_id)]
    assert got and got[0]["remark"] == "on the list too"
