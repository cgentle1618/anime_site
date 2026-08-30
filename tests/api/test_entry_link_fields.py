"""
The public read path: an entry's credits and tags ride on the entry payload.

The detail, library, card and statistics pages render an entry from ONE list or
detail response and have no second request to fall back on. These tests fail if
the derived keys stop being served - the exact regression that blanked Studio,
Genre and Era across seventeen files after the columns were dropped.
"""

from app import models
from app.services.domain import credits as credits_service


def _anime(db_session, name="測試"):
    a = models.Anime(anime_name_cn=name)
    db_session.add(a)
    db_session.commit()
    return a


def test_detail_response_carries_credits_and_tags(client, db_session):
    a = _anime(db_session)
    credits_service.replace_credits(
        db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT"]
    )
    credits_service.replace_credits(
        db_session, "anime", a.system_id, "composer", ["澤野弘之"]
    )
    credits_service.replace_tags(
        db_session, "anime", a.system_id, "genre_main", ["Action", "Drama"]
    )
    db_session.commit()

    body = client.get(f"/api/anime/{a.system_id}").json()
    # Order is the stored order, and the payload key is the LEGACY name -
    # composer is served as `music`, which is what the detail page reads.
    assert body["studio"] == "MAPPA, WIT"
    assert body["music"] == "澤野弘之"
    assert body["genre_main"] == "Action, Drama"
    assert body["director"] is None


def test_list_response_carries_credits_and_tags(client, db_session):
    a = _anime(db_session, "甲")
    b = _anime(db_session, "乙")
    credits_service.replace_credits(
        db_session, "anime", a.system_id, "studio", ["MAPPA"]
    )
    credits_service.replace_credits(
        db_session, "anime", b.system_id, "studio", ["Bones"]
    )
    db_session.commit()

    rows = {r["system_id"]: r for r in client.get("/api/anime/").json()}
    assert rows[str(a.system_id)]["studio"] == "MAPPA"
    assert rows[str(b.system_id)]["studio"] == "Bones"


def test_comic_list_carries_era_and_events(client, db_session):
    c = models.Comic(comic_name_en="Saga")
    db_session.add(c)
    db_session.commit()
    credits_service.replace_tags(
        db_session, "comic", c.system_id, "comic_era", ["Modern Age"]
    )
    credits_service.replace_tags(
        db_session, "comic", c.system_id, "comic_event", ["Civil War", "Secret Wars"]
    )
    credits_service.replace_credits(
        db_session, "comic", c.system_id, "comic_writer", ["Brian K. Vaughan"]
    )
    db_session.commit()

    row = next(
        r for r in client.get("/api/comic/").json() if r["system_id"] == str(c.system_id)
    )
    # The Comic library builds its Era and Events filter chips from these.
    assert row["era"] == "Modern Age"
    assert row["events"] == "Civil War, Secret Wars"
    assert row["writer"] == "Brian K. Vaughan"


def test_list_read_is_not_n_plus_one(client, db_session):
    """
    Ten entries must cost the same number of link queries as one.

    A per-entry GET /api/credits (or a per-entry credit_names call) would make
    a library page listing hundreds of rows issue hundreds of round trips.
    """
    from sqlalchemy import event

    for i in range(10):
        a = _anime(db_session, f"作品{i}")
        credits_service.replace_credits(
            db_session, "anime", a.system_id, "studio", [f"Studio {i}"]
        )
    db_session.commit()

    seen = []

    def record(conn, cursor, statement, params, context, executemany):
        seen.append(statement)

    engine = db_session.get_bind()
    event.listen(engine, "before_cursor_execute", record)
    try:
        client.get("/api/anime/")
    finally:
        event.remove(engine, "before_cursor_execute", record)

    link_queries = [
        s
        for s in seen
        if "media_credit" in s or "media_tag" in s or "FROM studio" in s
    ]
    # 1 credit + 1 tag + 1 studio lookup. No person/option rows exist, and
    # those lookups are skipped when the id set is empty.
    assert len(link_queries) == 3, link_queries


def test_link_fields_are_read_only_on_the_write_path(admin_client, client, db_session):
    """POSTing a dropped column name must not resurrect it as stored data."""
    r = admin_client.post(
        "/api/anime/", json={"anime_name_cn": "無視", "studio": "Ghost Studio"}
    )
    assert r.status_code == 201
    assert r.json()["studio"] is None

    body = client.get(f"/api/anime/{r.json()['system_id']}").json()
    assert body["studio"] is None


def test_anime_carries_the_label_tag_and_its_sheet_column(client, db_session):
    """
    標籤 Label is scoped to anime and never had a legacy string column, so it
    is served - and backed up - under its own key.
    """
    a = _anime(db_session, "標籤測試")
    credits_service.replace_tags(
        db_session, "anime", a.system_id, "label", ["會跳OP", "很多福利"]
    )
    db_session.commit()

    body = client.get(f"/api/anime/{a.system_id}").json()
    assert body["label"] == "會跳OP, 很多福利"

    headers = credits_service.sheet_link_headers("anime")
    values = credits_service.sheet_link_values(db_session, "anime", a)
    assert values[headers.index("label")] == "會跳OP, 很多福利"
