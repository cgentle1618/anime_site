"""
A sheet written by an older version of the app must still pull.

Step 1 moved the personal columns (watching_status, my_rating, ep_fin, ...)
off the nine detail models and into user_media_list, so the sheet in Google
Drive carries headers the models no longer have. Without a guard the parser
still emits those keys, the header filter keeps them, and Anime(**payload)
raises TypeError - aborting the WHOLE tab. The first Pull All after step 1
hits that on nine tabs at once.

The guard itself (pull.drop_non_columns) is step 0's, installed there for the
denormalised display_name column. These tests pin that it also covers step 1's
column move, and that an unexpected drop is reported rather than silent.

Requires PostgreSQL. See tests/api/conftest.py.
"""

import uuid

import pytest

from app import models
from app.services.pipelines import pull


@pytest.fixture
def db(db_session):
    return db_session


@pytest.fixture
def sheets(monkeypatch):
    def _install(tabs):
        monkeypatch.setattr(pull, "get_all_raw_rows", lambda tab: tabs[tab])

    return _install


def test_the_guard_from_step_0_covers_the_personal_columns():
    """Unit-level. drop_non_columns is step 0's; this pins that step 1's
    column move falls inside what it already covers."""
    payload = {
        "anime_name_cn": "測試",
        "ep_total": 28,
        "display_name": "測試",          # step 0's denormalised column
        "watching_status": "Completed",  # step 1 moved this out
        "ep_fin": 28,                    # and this
    }
    kept = pull.drop_non_columns(models.Anime, payload)
    assert set(kept) == {"anime_name_cn", "ep_total"}


def test_a_personal_column_left_in_the_sheet_is_ignored(db, sheets):
    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "ep_total", "watching_status", "ep_fin"],
            [str(uuid.uuid4()), "陳舊表頭", "28", "Completed", "28"],
        ]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    assert result["status"] == "success"
    anime = db.query(models.Anime).filter_by(anime_name_cn="陳舊表頭").one()
    assert anime.ep_total == 28
    assert not hasattr(anime, "watching_status")


def test_a_stale_column_on_an_UPDATE_is_dropped_too(db, sheets):
    """
    The UPDATE branch setattr()s the same payload the INSERT branch splats.
    An unknown key there does NOT raise - SQLAlchemy lets you set any
    attribute on a mapped instance - it silently sets a plain Python attribute
    that is never persisted. Quiet, but still a payload the guard must have
    cleaned, which is why the call sits before the UPSERT branch and not
    inside one arm of it.
    """
    existing = models.Anime(anime_name_cn="更新", ep_total=12)
    db.add(existing)
    db.flush()

    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "ep_total", "watching_status"],
            [str(existing.system_id), "更新", "24", "Completed"],
        ]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    assert result["status"] == "success"
    db.refresh(existing)
    assert existing.ep_total == 24
    assert not hasattr(existing, "watching_status")


def test_the_dropped_columns_are_reported_not_silent(db, sheets):
    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "watching_status"],
            [str(uuid.uuid4()), "回報", "Completed"],
        ]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    assert result["status"] == "success"
    assert any("watching_status" in ref for ref in result["unresolved_refs"])


def test_the_report_is_one_line_per_column_not_per_row(db, sheets):
    """A tab with a thousand stale rows must not write a thousand lines into
    the audit row."""
    header = ["system_id", "anime_name_cn", "watching_status"]
    sheets({
        "Anime": [header]
        + [[str(uuid.uuid4()), f"重複{n}", "Completed"] for n in range(5)]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    hits = [r for r in result["unresolved_refs"] if "watching_status" in r]
    assert len(hits) == 1


def test_the_expected_denormalised_column_is_not_reported(db, sheets):
    """
    display_name is on the sheet ON PURPOSE - step 0 writes it so a human can
    read the tab during an environment switch. Reporting it every Pull would
    train the reader to ignore the report, so it is dropped silently and only
    the unexpected columns are named.
    """
    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "display_name"],
            [str(uuid.uuid4()), "不回報", "不回報"],
        ]
    })

    result = pull.execute_pull_specific(db, "Anime", log_action=False)

    assert result["status"] == "success"
    assert not any("display_name" in ref for ref in result["unresolved_refs"])


def test_a_current_column_is_still_stored(db, sheets):
    """The guard must not eat real columns."""
    sheets({
        "Anime": [
            ["system_id", "anime_name_cn", "ep_total"],
            [str(uuid.uuid4()), "正常", "12"],
        ]
    })

    pull.execute_pull_specific(db, "Anime", log_action=False)

    stored = db.query(models.Anime).filter_by(anime_name_cn="正常").one()
    assert stored.ep_total == 12
