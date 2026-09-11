"""
Clean: the two routes.

Both sit on the data-control router and inherit its two gates. The mode gate
matters more here than for the pipelines it was written for: clean/scan names
every orphan in the database, so the report is an unrestricted read of the
whole catalogue by construction, and clean/apply deletes by system_id.
"""

import uuid

from app import models
from tests.api.test_clean_scan_orphans import fake_sheet  # noqa: F401


def _anime(db_session, name):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        anime_name_en=name,
        airing_type="TV",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    return (
        db_session.query(models.Media)
        .filter(models.Media.system_id == entry.system_id)
        .one()
    )


def test_scan_returns_the_report(admin_client, db_session, fake_sheet):  # noqa: F811
    media = _anime(db_session, "Forgotten By The Sheet")
    fake_sheet(media_rows=[])

    res = admin_client.get("/api/data-control/clean/scan")

    assert res.status_code == 200
    body = res.json()
    assert "tabs" in body and "totals" in body and "last_backup_at" in body
    assert str(media.system_id) in [c["system_id"] for c in body["tabs"]["Media"]]


def test_scan_is_503_when_the_sheet_cannot_be_read(
    admin_client, db_session, fake_sheet  # noqa: F811
):
    """503, not 500: the request was fine, the sheet is unavailable, and
    retrying later is the right advice."""
    fake_sheet(media_rows=[], unreadable={"Media"})

    res = admin_client.get("/api/data-control/clean/scan")

    assert res.status_code == 503


def test_scan_writes_no_log_row(admin_client, db_session, fake_sheet):  # noqa: F811
    """The scan is read-only, like check/duplicates."""
    _anime(db_session, "Observed Only")
    fake_sheet(media_rows=[])

    admin_client.get("/api/data-control/clean/scan")

    assert db_session.query(models.DataControlLog).count() == 0


def test_apply_deletes_the_named_id(admin_client, db_session, fake_sheet):  # noqa: F811
    media = _anime(db_session, "Ticked For Deletion")
    system_id = media.system_id
    fake_sheet(media_rows=[])

    res = admin_client.post(
        "/api/data-control/clean/apply",
        json={"items": [{"tab": "Media", "system_id": str(system_id)}]},
    )

    assert res.status_code == 200
    assert res.json()["deleted"] == 1
    assert (
        db_session.query(models.Media)
        .filter(models.Media.system_id == system_id)
        .first()
        is None
    )


def test_apply_is_503_when_the_sheet_cannot_be_read(
    admin_client, db_session, fake_sheet  # noqa: F811
):
    media = _anime(db_session, "Saved By The Outage")
    system_id = media.system_id
    fake_sheet(media_rows=[], unreadable={"Media"})

    res = admin_client.post(
        "/api/data-control/clean/apply",
        json={"items": [{"tab": "Media", "system_id": str(system_id)}]},
    )

    assert res.status_code == 503
    assert (
        db_session.query(models.Media)
        .filter(models.Media.system_id == system_id)
        .first()
        is not None
    )


def test_a_narrowed_session_is_refused_the_scan(mode_client, nsfw_label):
    """Decision 9. A narrowed operator must not read out a report naming every
    entry in the catalogue, nor delete rows their mode conceals.

    nsfw_label is load-bearing, not decoration. is_unscoped compares the mode
    against ALL content labels, so with no labels in the database `normal`
    withholds nothing and legitimately qualifies as unscoped. The label is what
    makes it narrowed and gives the gate something to refuse.
    """
    narrowed = mode_client("normal")

    assert narrowed.get("/api/data-control/clean/scan").status_code == 401


def test_a_narrowed_session_is_refused_the_apply(mode_client, nsfw_label):
    narrowed = mode_client("normal")

    res = narrowed.post("/api/data-control/clean/apply", json={"items": []})

    assert res.status_code == 401


def test_an_unscoped_session_passes_the_mode_gate(
    mode_client, nsfw_label, db_session, fake_sheet  # noqa: F811
):
    """The mirror of the two refusals: with the SAME label present, an
    unrestricted session reaches the handler - so the gate is the mode and not
    something incidental about the route."""
    fake_sheet(media_rows=[])

    res = mode_client("unrestricted").get("/api/data-control/clean/scan")

    assert res.status_code == 200
