"""
Clean: applying the deletion.

The safety property under test is not "did the delete run" - a stale review
page produces a successful delete too. It is "is what got deleted still the set
the server itself judges orphaned". That is why apply re-scans, and why the
re-scan is what these tests exercise.
"""

import json
import uuid

import pytest

from app import models
from app.services.pipelines import clean
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


def _item(media):
    return {"tab": "Media", "system_id": str(media.system_id)}


def test_apply_deletes_the_media_row_and_cascades_the_detail(db_session, fake_sheet):  # noqa: F811
    media = _anime(db_session, "Doomed Show")
    system_id = media.system_id
    fake_sheet(media_rows=[])

    result = clean.apply_clean(db_session, [_item(media)])

    assert result["deleted"] == 1
    assert result["per_tab"] == {"Media": 1}
    assert (
        db_session.query(models.Media)
        .filter(models.Media.system_id == system_id)
        .first()
        is None
    )
    assert (
        db_session.query(models.Anime)
        .filter(models.Anime.system_id == system_id)
        .first()
        is None
    )


def test_apply_refuses_an_id_the_rescan_does_not_call_an_orphan(db_session, fake_sheet):  # noqa: F811
    """THE test for this task. The client asks to delete a row that IS still in
    the sheet - which is exactly what a stale review page sends. The delete
    must not happen, and saying 'the request succeeded' is not enough."""
    media = _anime(db_session, "Still In The Sheet")
    system_id = media.system_id
    fake_sheet(media_rows=[media])

    result = clean.apply_clean(db_session, [_item(media)])

    assert result["deleted"] == 0
    assert result["skipped"][0]["system_id"] == str(system_id)
    assert result["skipped"][0]["reason"]
    assert (
        db_session.query(models.Media)
        .filter(models.Media.system_id == system_id)
        .first()
        is not None
    )


def test_apply_deletes_only_the_named_ids(db_session, fake_sheet):  # noqa: F811
    """Both are orphaned; only one was ticked. The other must survive."""
    doomed = _anime(db_session, "Ticked")
    spared = _anime(db_session, "Not Ticked")
    spared_id = spared.system_id
    fake_sheet(media_rows=[])

    result = clean.apply_clean(db_session, [_item(doomed)])

    assert result["deleted"] == 1
    assert (
        db_session.query(models.Media)
        .filter(models.Media.system_id == spared_id)
        .first()
        is not None
    )


def test_apply_is_a_no_op_when_the_sheet_cannot_be_read(db_session, fake_sheet):  # noqa: F811
    """A Sheets outage must not become a mass delete. scan_orphans raises
    rather than returning an empty answer, and apply inherits that."""
    media = _anime(db_session, "Protected By The Outage")
    system_id = media.system_id
    fake_sheet(media_rows=[], unreadable={"Media"})

    with pytest.raises(clean.CleanAborted):
        clean.apply_clean(db_session, [_item(media)])

    assert (
        db_session.query(models.Media)
        .filter(models.Media.system_id == system_id)
        .first()
        is not None
    )


def test_apply_writes_a_deleted_record_and_an_audit_row(db_session, fake_sheet):  # noqa: F811
    media = _anime(db_session, "Recorded On The Way Out")
    fake_sheet(media_rows=[])

    clean.apply_clean(db_session, [_item(media)])

    record = db_session.query(models.DeletedRecord).one()
    assert record.name_en == "Recorded On The Way Out" or record.name_cn

    log = (
        db_session.query(models.DataControlLog)
        .filter(models.DataControlLog.action_main == "Clean")
        .one()
    )
    assert log.action_specific == "Clean Orphans"
    assert log.type == "Manual"
    assert log.status == "Success"
    assert log.rows_deleted == 1
    # details_json is a TEXT column and every other caller json.dumps into it;
    # a dict would be stored as a Python repr that nothing can parse back.
    assert json.loads(log.details_json) == {"Media": 1}


def test_apply_with_nothing_ticked_deletes_nothing_and_still_reports(
    db_session, fake_sheet  # noqa: F811
):
    _anime(db_session, "Untouched")
    fake_sheet(media_rows=[])

    result = clean.apply_clean(db_session, [])

    assert result["deleted"] == 0
    assert result["per_tab"] == {}
    assert db_session.query(models.Media).count() == 1


def test_tiers_are_deleted_child_first_and_unticked_children_survive(
    db_session, fake_sheet  # noqa: F811
):
    """collection_id / franchise_id / series_id are ON DELETE SET NULL, so a
    child that was NOT ticked survives its deleted parent orphaned-but-alive
    rather than being destroyed."""
    franchise = models.Franchise(
        system_id=uuid.uuid4(),
        franchise_name_en="Abandoned Franchise",
        franchise_type="TV",
    )
    db_session.add(franchise)
    db_session.flush()

    media = _anime(db_session, "Child Entry")
    media.franchise_id = franchise.system_id
    db_session.flush()
    child_id = media.system_id

    # The franchise is orphaned in the sheet; the entry is not.
    fake_sheet(media_rows=[media], tiers={"Franchise": []})

    result = clean.apply_clean(
        db_session, [{"tab": "Franchise", "system_id": str(franchise.system_id)}]
    )

    assert result["deleted"] == 1
    survivor = (
        db_session.query(models.Media)
        .filter(models.Media.system_id == child_id)
        .one()
    )
    assert survivor.franchise_id is None
