"""
Backup and Pull share one tab registry, and Backup reads link columns in a
fixed number of queries.

Requires PostgreSQL (anime_site_test DB). See tests/api/conftest.py.
"""

from app import models
from app.services.domain.credits import (
    replace_credits,
    sheet_link_headers,
    sheet_link_rows,
    sheet_link_values,
)
from app.services.pipelines import backup, pull
from app.services.pipelines.tabs import MEDIA_TYPE_FOR_TAB, SHEET_TABS, TAB_NAMES
from app.utils.media_resolver import MEDIA_TABLES


def test_pull_restores_exactly_the_registry_in_registry_order():
    assert pull.TABS_IN_ORDER == TAB_NAMES
    assert pull.MEDIA_TYPE_FOR_TAB == MEDIA_TYPE_FOR_TAB


def test_every_media_type_has_a_tab_and_vice_versa():
    assert set(MEDIA_TYPE_FOR_TAB.values()) == set(MEDIA_TABLES)


def test_backup_writes_every_tab_in_registry_order(db_session, monkeypatch):
    written = []

    def record(tab, matrix):
        written.append((tab, matrix[0]))
        return True

    monkeypatch.setattr(backup, "bulk_overwrite_sheet", record)
    backup.execute_backup(db_session)

    assert [tab for tab, _ in written] == TAB_NAMES
    headers = dict(written)
    for tab in SHEET_TABS:
        expected = [c.name for c in tab.model.__table__.columns]
        if tab.media_type:
            expected += sheet_link_headers(tab.media_type)
        assert headers[tab.name] == expected, tab.name


def test_batched_link_rows_match_the_per_row_values(db_session):
    a = models.Anime(anime_name_cn="測試")
    b = models.Anime(anime_name_cn="第二")
    db_session.add_all([a, b])
    db_session.flush()
    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA", "WIT"])
    replace_credits(db_session, "anime", b.system_id, "director", ["Someone"])

    rows = sheet_link_rows(db_session, "anime", [a, b])

    assert rows == [
        sheet_link_values(db_session, "anime", a),
        sheet_link_values(db_session, "anime", b),
    ]
    assert "MAPPA, WIT" in rows[0]
