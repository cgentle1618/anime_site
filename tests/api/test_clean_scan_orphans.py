"""
Clean: the whole-database diff.

Where tasks 1-3 compose. All three of the things that were nearly wrong have to
hold at once here: the public_id type mismatch (Integer locally, text in the
sheet), the weak third identity arm (display_name is denormalized, not
independent), and the SET NULL that makes a quote detach rather than die.
"""

import uuid

import pytest

from app import models
from app.services.integrations.sheets import SheetsUnavailableError
from app.services.pipelines import clean

MEDIA_HEADERS = ["system_id", "media_type", "public_id", "display_name"]
TIER_HEADERS = {
    "Collection": ["system_id", "public_id", "collection_name_en", "collection_name_cn"],
    "Franchise": ["system_id", "public_id", "franchise_name_en", "franchise_name_cn"],
    "Series": ["system_id", "public_id", "series_name_en", "series_name_cn"],
}


@pytest.fixture
def fake_sheet(monkeypatch):
    """
    Serve a full 13-tab sheet.

    Every tab needs at least two rows or read_tab aborts, which is the point of
    task 1 - so the default is a single placeholder row per tab that matches
    nothing in the database.
    """

    def install(media_rows=None, tiers=None, unreadable=frozenset()):
        tabs: dict[str, list[list[str]]] = {}
        for tab in clean.CLEAN_TABS:
            if tab == "Media":
                rows = [MEDIA_HEADERS] + [
                    [str(m.system_id), m.media_type, str(m.public_id), m.display_name]
                    for m in (media_rows or [])
                ]
                if len(rows) < 2:
                    rows.append(["placeholder-id", "anime", "999999", "Placeholder"])
            elif tab in TIER_HEADERS:
                supplied = (tiers or {}).get(tab, [])
                prefix = {"Collection": "collection", "Franchise": "franchise", "Series": "series"}[tab]
                rows = [TIER_HEADERS[tab]] + [
                    [
                        str(r.system_id),
                        str(r.public_id),
                        getattr(r, f"{prefix}_name_en") or "",
                        getattr(r, f"{prefix}_name_cn") or "",
                    ]
                    for r in supplied
                ]
                if len(rows) < 2:
                    rows.append(["placeholder-id", "999999", "Placeholder", ""])
            else:
                rows = [["system_id"], ["placeholder-id"]]
            tabs[tab] = rows

        def reader(tab_name):
            if tab_name in unreadable:
                raise SheetsUnavailableError("simulated outage")
            return tabs[tab_name]

        monkeypatch.setattr(clean, "get_all_raw_rows", reader)
        return tabs

    return install


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


def test_an_entry_the_sheet_has_forgotten_is_reported(db_session, fake_sheet):
    media = _anime(db_session, "Forgotten Show")
    fake_sheet(media_rows=[])

    report = clean.scan_orphans(db_session)
    ids = [c["system_id"] for c in report["tabs"]["Media"]]
    assert str(media.system_id) in ids
    assert report["totals"]["candidates"] >= 1


def test_an_entry_still_in_the_sheet_is_not_reported(db_session, fake_sheet):
    media = _anime(db_session, "Still Here")
    fake_sheet(media_rows=[media])

    report = clean.scan_orphans(db_session)
    assert [c["system_id"] for c in report["tabs"]["Media"]] == []


def test_a_renamed_entry_is_not_reported(db_session, fake_sheet):
    """End-to-end form of the decision-3b guard: the sheet carries a different
    uuid AND a different name, and only (media_type, public_id) spares it."""
    media = _anime(db_session, "Local Name")
    tabs = fake_sheet(media_rows=[media])
    tabs["Media"][1][0] = "a-different-uuid"
    tabs["Media"][1][3] = "A Different Name Entirely"

    report = clean.scan_orphans(db_session)
    assert [c["system_id"] for c in report["tabs"]["Media"]] == []


def test_a_candidate_carries_its_blast_radius_and_timestamps(db_session, fake_sheet):
    media = _anime(db_session, "Doomed")
    fake_sheet(media_rows=[])

    candidate = clean.scan_orphans(db_session)["tabs"]["Media"][0]
    assert candidate["display_name"] == "Doomed"
    assert candidate["public_id"] == media.public_id
    assert candidate["created_at"] is not None
    assert "deleted" in candidate["blast_radius"]
    assert "detached" in candidate["blast_radius"]


def test_the_scan_aborts_entirely_when_one_tab_is_unreadable(db_session, fake_sheet):
    """Not 'skip that tab and report it'. A partial read is indistinguishable
    from 'everything the unread tabs cover is orphaned'."""
    _anime(db_session, "Innocent Bystander")
    fake_sheet(media_rows=[], unreadable={"Movies"})

    with pytest.raises(clean.CleanAborted):
        clean.scan_orphans(db_session)


def test_the_scan_carries_the_last_successful_backup_timestamp(db_session, fake_sheet):
    log = models.DataControlLog(
        action_main="Backup",
        action_specific="Backup",
        type="Manual",
        status="Success",
    )
    db_session.add(log)
    db_session.flush()
    fake_sheet(media_rows=[])

    report = clean.scan_orphans(db_session)
    assert report["last_backup_at"] == log.timestamp.isoformat()


def test_a_failed_backup_does_not_count_as_the_last_backup(db_session, fake_sheet):
    """The timestamp tells the operator how stale the sheet is. A failed run
    wrote nothing, so claiming it as the last backup would overstate freshness
    - and the whole staleness story of the review screen rests on it."""
    db_session.add(
        models.DataControlLog(
            action_main="Backup",
            action_specific="Backup",
            type="Manual",
            status="Failed",
        )
    )
    db_session.flush()
    fake_sheet(media_rows=[])

    assert clean.scan_orphans(db_session)["last_backup_at"] is None


def test_an_orphaned_tier_row_is_reported(db_session, fake_sheet):
    collection = models.Collection(
        system_id=uuid.uuid4(), collection_name_en="Abandoned Collection"
    )
    db_session.add(collection)
    db_session.flush()
    fake_sheet(media_rows=[], tiers={"Collection": []})

    report = clean.scan_orphans(db_session)
    assert str(collection.system_id) in [
        c["system_id"] for c in report["tabs"]["Collection"]
    ]


def test_a_tier_row_still_in_the_sheet_is_spared(db_session, fake_sheet):
    collection = models.Collection(
        system_id=uuid.uuid4(), collection_name_en="Kept Collection"
    )
    db_session.add(collection)
    db_session.flush()
    fake_sheet(media_rows=[], tiers={"Collection": [collection]})

    report = clean.scan_orphans(db_session)
    assert [c["system_id"] for c in report["tabs"]["Collection"]] == []
