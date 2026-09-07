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
        db_session, "comic", c.system_id, "author", ["Brian K. Vaughan"]
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


def test_anime_carries_the_quality_tag_and_its_sheet_column(client, db_session):
    """
    Quality 品質 is anime-only and, like 標籤 Label, never had a legacy string
    column, so it is served - and backed up - under its own key.
    """
    a = _anime(db_session, "品質測試")
    credits_service.replace_tags(
        db_session, "anime", a.system_id, "quality", ["作畫崩壞", "神作畫"]
    )
    db_session.commit()

    body = client.get(f"/api/anime/{a.system_id}").json()
    assert body["quality"] == "作畫崩壞, 神作畫"

    headers = credits_service.sheet_link_headers("anime")
    values = credits_service.sheet_link_values(db_session, "anime", a)
    assert values[headers.index("quality")] == "作畫崩壞, 神作畫"


# ---------------------------------------------------------------------------
# credit_refs: the same person credits, with ids and the per-media-type label,
# so a detail page can link to the person the legacy string only names.
# ---------------------------------------------------------------------------


def test_credit_refs_carry_ids_and_derived_labels(client, manga_with_credits):
    body = client.get(f"/api/manga/{manga_with_credits.system_id}").json()

    assert body["author_plot"] == "諫山創"  # legacy string unchanged
    refs = body["credit_refs"]["author"]
    assert refs[0]["display_name"] == "諫山創"
    assert refs[0]["label"] == "原作"
    assert refs[0]["system_id"]

    assert body["credit_refs"]["illustrator"][0]["label"] == "作畫"


def test_credit_refs_keep_stored_order(client, manga_with_two_authors):
    """
    media_credit.position carries the order the names had in the comma-joined
    column this table replaced, so "A, B" must still read in that order.
    """
    body = client.get(f"/api/manga/{manga_with_two_authors.system_id}").json()
    assert [r["display_name"] for r in body["credit_refs"]["author"]] == [
        "First Author",
        "Second Author",
    ]


def test_a_list_endpoint_serves_refs_without_an_n_plus_1(
    client, db_session, three_manga_with_credits
):
    """
    attach_link_fields exists to batch; a per-row loader would reintroduce the
    N+1 it was written to remove. The query COUNT is asserted, not just that
    the field is present - presence passes just as happily with an N+1 behind
    it.
    """
    from sqlalchemy import event

    seen = []

    def count(*_args, **_kwargs):
        seen.append(1)

    engine = db_session.get_bind()

    def queries_for(url):
        seen.clear()
        event.listen(engine, "before_cursor_execute", count)
        try:
            body = client.get(url).json()
        finally:
            event.remove(engine, "before_cursor_execute", count)
        return len(seen), body

    # Warm up first: the RBAC permission cache is process-local and loads on
    # the first call, so an unwarmed first measurement counts a query the
    # second never issues and the comparison measures the cache, not the N+1.
    client.get("/api/manga/?limit=1")

    two, body = queries_for("/api/manga/?limit=2")
    assert all("credit_refs" in e for e in body)

    three, _ = queries_for("/api/manga/?limit=3")
    assert three == two, "query count grew with the row count"


def test_studio_credits_are_not_in_credit_refs(client, anime_with_studio):
    """
    credit_refs is people only. Studios ride beside it as studio_refs, a bare
    list because studio is a single role.
    """
    body = client.get(f"/api/anime/{anime_with_studio.system_id}").json()
    assert "studio" not in body.get("credit_refs", {})
    assert body["studio_refs"][0]["display_name"] == "MAPPA"
