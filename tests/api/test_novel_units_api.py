"""Novel units round-trip through the media router factory."""

import uuid


def _novel_payload(**overrides):
    payload = {
        "novel_name_cn": "測試小說",
        "type": "Web",
        "units": [
            {"unit_kind": "arc", "position": 1, "unit_key": "arc 1", "ch_count": 100},
            {"unit_kind": "arc", "position": 2, "unit_key": "arc 2", "ch_count": 112},
        ],
    }
    payload.update(overrides)
    return payload


def test_create_persists_units_and_derives_totals(admin_client):
    resp = admin_client.post("/api/novel/", json=_novel_payload(arc_fin=1, ch_fin_in_arc=101))
    assert resp.status_code == 201
    body = resp.json()

    assert len(body["units"]) == 2
    assert body["arc_total"] == 2
    assert body["ch_total"] == 212
    assert body["ch_fin"] == 201
    assert body["units"][0]["display_key"] == "arc 1"


def test_update_inserts_updates_and_deletes_in_one_request(admin_client):
    created = admin_client.post("/api/novel/", json=_novel_payload()).json()
    keep, drop = created["units"][0], created["units"][1]

    resp = admin_client.put(
        f"/api/novel/{created['system_id']}",
        json={
            "novel_name_cn": "測試小說",
            "type": "Web",
            "units": [
                # updated in place
                {
                    "system_id": keep["system_id"],
                    "unit_kind": "arc",
                    "position": 1,
                    "unit_key": "arc 1",
                    "ch_count": 105,
                },
                # inserted
                {"unit_kind": "arc", "position": 2, "unit_key": "arc 2b", "ch_count": 50},
            ],
        },
    )
    assert resp.status_code == 200
    body = resp.json()

    ids = {u["system_id"] for u in body["units"]}
    assert keep["system_id"] in ids       # kept and updated
    assert drop["system_id"] not in ids   # omitted, therefore deleted
    assert len(body["units"]) == 2
    assert body["ch_total"] == 155


def test_patching_the_cursor_rolls_over(admin_client):
    created = admin_client.post(
        "/api/novel/", json=_novel_payload(arc_fin=1, ch_fin_in_arc=0)
    ).json()

    resp = admin_client.patch(
        f"/api/novel/{created['system_id']}", json={"ch_fin_in_arc": 112}
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["arc_fin"] == 2
    assert body["ch_fin_in_arc"] == 0
    assert body["ch_fin"] == 212


def test_deleting_a_novel_removes_its_units(admin_client, db_session):
    from app import models

    created = admin_client.post("/api/novel/", json=_novel_payload()).json()
    novel_id = uuid.UUID(created["system_id"])

    assert admin_client.delete(f"/api/novel/{novel_id}").status_code == 200

    remaining = (
        db_session.query(models.NovelUnit)
        .filter(models.NovelUnit.novel_id == novel_id)
        .count()
    )
    assert remaining == 0


def test_volume_units_do_not_touch_volume_counters(admin_client):
    resp = admin_client.post(
        "/api/novel/",
        json={
            "novel_name_cn": "輕小說",
            "type": "Light Novel",
            "vol_fin": 9,
            "vol_total_original": 12,
            "units": [
                {"unit_kind": "volume", "position": 1, "name_cn": "第一卷"},
                {"unit_kind": "volume", "position": 2, "name_cn": "第二卷"},
            ],
        },
    )
    body = resp.json()
    # Decision B: naming two volumes must not redefine the denominator.
    assert body["vol_fin"] == 9
    assert body["vol_total_original"] == 12
    assert len(body["units"]) == 2


def test_listing_novels_does_not_n_plus_one(admin_client, test_engine):
    from sqlalchemy import event

    for _ in range(3):
        admin_client.post("/api/novel/", json=_novel_payload())

    statements = []

    def record(conn, cursor, statement, params, context, executemany):
        if "novel_unit" in statement:
            statements.append(statement)

    event.listen(test_engine, "before_cursor_execute", record)
    try:
        resp = admin_client.get("/api/novel/")
    finally:
        event.remove(test_engine, "before_cursor_execute", record)

    assert resp.status_code == 200
    # selectinload issues exactly one query for all novels' units, not one
    # query per novel.
    assert len(statements) == 1
