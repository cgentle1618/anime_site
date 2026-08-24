"""
API integration tests for /api/notes endpoints.

Notes are per-item rows on any of the ten owner types, shaped by the section
registry in app/utils/note_sections.py.
Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models


@pytest.fixture
def anime_note(db_session, sample_anime):
    n = models.Note(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=sample_anime.system_id,
        section="advantages",
        content="敘事結構精巧",
        sort_index=0.0,
    )
    db_session.add(n)
    db_session.flush()
    return n


# --- Sections endpoint ----------------------------------------------------


def test_sections_for_anime(client):
    r = client.get("/api/notes/sections", params={"owner_type": "anime"})
    assert r.status_code == 200
    keys = [s["key"] for s in r.json()]
    assert keys[0] == "remark"
    assert "op_ed_changes" in keys
    assert "special_changes" not in keys


def test_sections_for_collection_is_narrower(client):
    r = client.get("/api/notes/sections", params={"owner_type": "collection"})
    keys = [s["key"] for s in r.json()]
    assert "episode_comments" not in keys
    assert "remark" in keys


def test_sections_rejects_unknown_owner_type(client):
    r = client.get("/api/notes/sections", params={"owner_type": "podcast"})
    assert r.status_code == 400


def test_sections_carry_kinds_and_placeholders(client):
    r = client.get("/api/notes/sections", params={"owner_type": "anime"})
    by_key = {s["key"]: s for s in r.json()}
    assert by_key["op_ed_changes"]["kinds"] == [
        "變化OP", "變化ED", "無OP", "無ED", "特殊OP", "特殊ED",
    ]
    assert by_key["extended_episodes"]["kinds"] == []
    assert by_key["highlights"]["kinds"] == ["神回", "神片段", "神篇章"]
    assert by_key["remark"]["singleton"] is True
    assert by_key["adaptation"]["desc_required"] is True


def test_highlight_dropdown_is_resolved_per_owner(client):
    for owner_type in ("tv-show", "cartoon"):
        r = client.get("/api/notes/sections", params={"owner_type": owner_type})
        by_key = {s["key"]: s for s in r.json()}
        assert by_key["highlight_episodes"]["kinds"] == ["神回", "神片段", "神篇章"]

    r = client.get("/api/notes/sections", params={"owner_type": "manga"})
    by_key = {s["key"]: s for s in r.json()}
    assert by_key["highlight_episodes"]["kinds"] == []


# --- List -----------------------------------------------------------------


def test_list_notes_for_owner(client, sample_anime, anime_note):
    r = client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert r.status_code == 200
    body = r.json()
    assert len(body) == 1
    assert body[0]["content"] == "敘事結構精巧"


def test_list_is_registry_ordered(client, db_session, sample_anime):
    # questions sorts after advantages in the registry, so insert it first.
    for section, content in (("questions", "為什麼"), ("advantages", "好看")):
        db_session.add(
            models.Note(
                system_id=uuid.uuid4(),
                owner_type="anime",
                owner_id=sample_anime.system_id,
                section=section,
                content=content,
                sort_index=0.0,
            )
        )
    db_session.flush()
    r = client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    )
    assert [n["section"] for n in r.json()] == ["advantages", "questions"]


# --- Create ---------------------------------------------------------------


def test_create_requires_admin(client, sample_anime):
    r = client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "配樂與畫面高度契合",
        },
    )
    assert r.status_code == 401


def test_admin_creates_note(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "配樂與畫面高度契合",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["content"] == "配樂與畫面高度契合"


def test_create_rejects_section_not_applicable(admin_client, sample_franchise):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "franchise",
            "owner_id": str(sample_franchise.system_id),
            "section": "episode_comments",
            "episode": "ep 1",
            "content": "x",
        },
    )
    assert r.status_code == 422
    assert "does not apply" in r.text


def test_create_rejects_bad_kind(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "op_ed_changes",
            "episode": "ep 3",
            "kind": "回顧",
            "content": "x",
        },
    )
    assert r.status_code == 422


def test_create_rejects_external_section(admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "quotes",
            "content": "x",
        },
    )
    assert r.status_code == 422


def test_singleton_section_rejects_a_second_row(admin_client, sample_anime):
    body = {
        "owner_type": "anime",
        "owner_id": str(sample_anime.system_id),
        "section": "remark",
        "content": "重看第三次",
    }
    assert admin_client.post("/api/notes", json=body).status_code == 201
    r = admin_client.post("/api/notes", json=body)
    assert r.status_code == 422
    assert "already has" in r.text


def test_create_assigns_next_sort_index(admin_client, sample_anime, anime_note):
    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "配樂與畫面高度契合",
        },
    )
    assert r.json()["sort_index"] == 1.0


def test_create_next_sort_index_skips_null_rows(admin_client, db_session, sample_anime):
    # A NULL sort_index sorts first on DESC in PostgreSQL, so the query behind
    # _next_sort_index must exclude NULLs or it collides with the existing 2.0 row.
    db_session.add(
        models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="advantages",
            content="無序號",
            sort_index=None,
        )
    )
    db_session.add(
        models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="advantages",
            content="第三",
            sort_index=2.0,
        )
    )
    db_session.flush()

    r = admin_client.post(
        "/api/notes",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "content": "新的",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["sort_index"] == 3.0


# --- Update and delete ----------------------------------------------------


def test_admin_updates_one_row(admin_client, anime_note):
    r = admin_client.patch(
        f"/api/notes/{anime_note.system_id}", json={"content": "改過的內容"}
    )
    assert r.status_code == 200
    assert r.json()["content"] == "改過的內容"


def test_update_revalidates_against_registry(admin_client, anime_note):
    r = admin_client.patch(
        f"/api/notes/{anime_note.system_id}", json={"section": "episode_comments"}
    )
    # advantages -> episode_comments with no episode and no kind is still valid
    # for an anime, so this must succeed; the guard is on unknown sections.
    assert r.status_code == 200
    r = admin_client.patch(
        f"/api/notes/{anime_note.system_id}", json={"section": "nope"}
    )
    assert r.status_code == 422


def test_update_to_singleton_conflict_does_not_flush_mutation(
    admin_client, db_session, sample_anime, anime_note
):
    # sample_anime already has a 'remark' note; patching anime_note's section
    # to 'remark' must be rejected, and - because the check must run before
    # any mutation touches db_note - the row must come back unchanged on a
    # subsequent read, proving nothing was flushed by autoflush.
    db_session.add(
        models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="remark",
            content="既有備註",
            sort_index=0.0,
        )
    )
    db_session.flush()

    r = admin_client.patch(
        f"/api/notes/{anime_note.system_id}", json={"section": "remark"}
    )
    assert r.status_code == 422
    assert "already has" in r.text

    got = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    ).json()
    unchanged = next(n for n in got if n["system_id"] == str(anime_note.system_id))
    assert unchanged["section"] == "advantages"
    assert unchanged["content"] == "敘事結構精巧"


def test_update_404s_on_missing_note(admin_client):
    r = admin_client.patch(f"/api/notes/{uuid.uuid4()}", json={"content": "x"})
    assert r.status_code == 404


def test_admin_deletes_one_row(admin_client, anime_note):
    r = admin_client.delete(f"/api/notes/{anime_note.system_id}")
    assert r.status_code == 204
    r = admin_client.delete(f"/api/notes/{anime_note.system_id}")
    assert r.status_code == 404


def test_delete_requires_admin(client, anime_note):
    assert client.delete(f"/api/notes/{anime_note.system_id}").status_code == 401


# --- Reorder --------------------------------------------------------------


def test_reorder_rewrites_sort_index(admin_client, db_session, sample_anime):
    ids = []
    for i, text in enumerate(("第一", "第二", "第三")):
        n = models.Note(
            system_id=uuid.uuid4(),
            owner_type="anime",
            owner_id=sample_anime.system_id,
            section="advantages",
            content=text,
            sort_index=float(i),
        )
        db_session.add(n)
        ids.append(str(n.system_id))
    db_session.flush()

    r = admin_client.patch(
        "/api/notes/reorder",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "advantages",
            "ordered_ids": [ids[2], ids[0], ids[1]],
        },
    )
    assert r.status_code == 200
    got = admin_client.get(
        "/api/notes",
        params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)},
    ).json()
    assert [n["content"] for n in got] == ["第三", "第一", "第二"]


def test_reorder_rejects_ids_from_another_section(admin_client, sample_anime, anime_note):
    r = admin_client.patch(
        "/api/notes/reorder",
        json={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "section": "questions",
            "ordered_ids": [str(anime_note.system_id)],
        },
    )
    assert r.status_code == 400
