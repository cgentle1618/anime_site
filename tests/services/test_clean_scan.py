"""
Clean: reading the in-scope tabs, and refusing a sheet that cannot be trusted.

The two refusals here are the whole safety story of the feature. Pull's policy
for both conditions is to continue and report, which is right for an upsert and
catastrophic for a delete: an unreadable tab is indistinguishable from
"everything in it is orphaned", and an empty tab means "delete this table".
"""

import pytest

from app.services.integrations.sheets import SheetsUnavailableError
from app.services.pipelines import clean


def test_clean_tabs_are_the_thirteen_in_scope():
    assert clean.CLEAN_TABS == (
        "Collection",
        "Franchise",
        "Series",
        "Media",
        "Anime",
        "Anime Movie",
        "Movies",
        "TV Shows",
        "Cartoons",
        "Manga",
        "Novel",
        "Comic",
        "Game",
    )


def test_clean_tabs_are_all_real_sheet_tabs():
    """A typo here would silently scan nothing for that tab."""
    from app.services.pipelines.tabs import SHEET_TABS

    known = {tab.name for tab in SHEET_TABS}
    assert set(clean.CLEAN_TABS) <= known


def test_clean_tabs_exclude_the_authorization_and_per_user_tabs():
    """Decision 2. A delete path into Users would let a sheet edit remove an
    account; a delete path into User Media List would remove somebody's
    ratings."""
    for forbidden in (
        "Users",
        "Content Label",
        "Media Content Label",
        "User Media List",
        "Plan Next",
        "Seasonal",
        "Game Copy",
        "System Options",
        "Person",
        "Studio",
    ):
        assert forbidden not in clean.CLEAN_TABS


def test_read_tab_aborts_when_sheets_is_unavailable(monkeypatch):
    def boom(tab):
        raise SheetsUnavailableError("quota exceeded")

    monkeypatch.setattr(clean, "get_all_raw_rows", boom)
    with pytest.raises(clean.CleanAborted) as exc:
        clean.read_tab("Anime")
    assert "Anime" in str(exc.value)


def test_read_tab_aborts_on_a_tab_with_only_a_header_row(monkeypatch):
    monkeypatch.setattr(clean, "get_all_raw_rows", lambda tab: [["system_id"]])
    with pytest.raises(clean.CleanAborted):
        clean.read_tab("Anime")


def test_read_tab_aborts_on_a_completely_empty_tab(monkeypatch):
    monkeypatch.setattr(clean, "get_all_raw_rows", lambda tab: [])
    with pytest.raises(clean.CleanAborted):
        clean.read_tab("Anime")


def test_read_tab_returns_rows_when_the_tab_is_healthy(monkeypatch):
    rows = [["system_id"], ["abc"]]
    monkeypatch.setattr(clean, "get_all_raw_rows", lambda tab: rows)
    assert clean.read_tab("Anime") == rows
