"""Reading and replacing an entry's credits and tags in one call."""

from app import models


def _anime(db_session):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    return a


def test_read_returns_empty_maps_for_a_bare_entry(client, db_session):
    a = _anime(db_session)
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body == {"credits": {}, "tags": {}}


def test_replace_then_read_round_trips(admin_client, client, db_session):
    a = _anime(db_session)
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={
            "credits": {"studio": ["MAPPA"], "director": ["新海誠"]},
            "tags": {"genre_main": ["Action"]},
        },
    )
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body["credits"]["studio"] == ["MAPPA"]
    assert body["tags"]["genre_main"] == ["Action"]


def test_replace_only_touches_the_roles_named(admin_client, client, db_session):
    a = _anime(db_session)
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"studio": ["MAPPA"], "director": ["新海誠"]}, "tags": {}},
    )
    admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"director": []}, "tags": {}},
    )
    body = client.get(f"/api/credits/anime/{a.system_id}").json()
    assert body["credits"]["studio"] == ["MAPPA"]
    assert "director" not in body["credits"]


def test_a_role_the_media_type_does_not_have_is_rejected(admin_client, db_session):
    a = _anime(db_session)
    r = admin_client.put(
        f"/api/credits/anime/{a.system_id}",
        json={"credits": {"comic_writer": ["X"]}, "tags": {}},
    )
    assert r.status_code == 400


def test_an_unknown_media_type_is_rejected(client):
    import uuid

    assert client.get(f"/api/credits/nope/{uuid.uuid4()}").status_code == 400


def test_a_missing_entry_is_a_404(client):
    import uuid

    assert client.get(f"/api/credits/anime/{uuid.uuid4()}").status_code == 404


def test_writes_require_admin(client, db_session):
    a = _anime(db_session)
    r = client.put(
        f"/api/credits/anime/{a.system_id}", json={"credits": {}, "tags": {}}
    )
    assert r.status_code in (401, 403)
