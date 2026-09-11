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


# ---------------------------------------------------------------------------
# Task 2: the identity index, and the rule that decides a candidate.
#
# The sparing direction is tested harder than the deleting direction on
# purpose. A missed orphan is a stale row somebody can see and fix; a wrongly
# deleted entry cascades into credits, sources, notes, quotes and every user's
# list rows, silently. Decision 3b.
# ---------------------------------------------------------------------------

from types import SimpleNamespace  # noqa: E402

HEADERS = ["system_id", "media_type", "public_id", "display_name"]


def _media(system_id, media_type, public_id, display_name):
    return SimpleNamespace(
        system_id=system_id,
        media_type=media_type,
        public_id=public_id,
        display_name=display_name,
    )


def test_index_tab_reads_columns_by_header_name_not_position():
    """Backup appends the credit and tag link columns after the plain ones, so
    a column's position moves whenever a media type gains a role."""
    rows = [
        ["display_name", "public_id", "media_type", "system_id"],
        ["Cowboy Bebop", "12", "anime", "uuid-1"],
    ]
    idx = clean.index_tab(rows)
    assert idx.ids == {"uuid-1"}
    assert idx.pairs == {("anime", "12")}
    assert idx.names == {"Cowboy Bebop"}


def test_index_tab_ignores_blank_rows():
    rows = [HEADERS, ["", "", "", ""], ["uuid-1", "anime", "12", "Bebop"]]
    assert clean.index_tab(rows).ids == {"uuid-1"}


def test_index_tab_tolerates_a_short_row():
    """A trailing empty cell is simply absent from the row Sheets returns."""
    rows = [HEADERS, ["uuid-1", "anime"]]
    idx = clean.index_tab(rows)
    assert idx.ids == {"uuid-1"}
    assert idx.pairs == set()


def test_index_tab_survives_a_tab_with_no_media_columns():
    """Collection and the other tier tabs carry none of media_type/public_id."""
    rows = [["system_id", "collection_name_en"], ["uuid-1", "Ghibli"]]
    idx = clean.index_tab(rows)
    assert idx.ids == {"uuid-1"}
    assert idx.pairs == set()


# --- sparing direction -----------------------------------------------------


def test_row_present_by_system_id_is_spared():
    idx = clean.index_tab([HEADERS, ["uuid-1", "anime", "12", "Cowboy Bebop"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Cowboy Bebop"), idx) is False


def test_renamed_entry_is_spared_by_the_public_id_pair():
    """THE decision-3b test. The sheet knows it as uuid-9/'Bebop'; locally it is
    uuid-1/'Cowboy Bebop'. It misses on id and on name, and a names-only rule -
    the one copied from pull.py - would have deleted it and cascaded away its
    credits, sources, notes and every user's list rows."""
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "12", "Bebop"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Cowboy Bebop"), idx) is False


def test_reidentified_entry_is_spared_by_display_name():
    """Re-created locally after a restore: new uuid, new public_id, same name."""
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "77", "Cowboy Bebop"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Cowboy Bebop"), idx) is False


def test_public_id_is_compared_across_the_int_text_boundary():
    """public_id is an int locally and text in the sheet; a bare == is always
    False, which would make every entry look orphaned."""
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "12", "Something"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Other Name"), idx) is False


def test_whitespace_around_a_sheet_value_still_spares():
    idx = clean.index_tab([HEADERS, ["  uuid-1  ", "anime", " 12 ", " Bebop "]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 99, "Nope"), idx) is False


# --- deleting direction ----------------------------------------------------


def test_public_id_pair_is_scoped_by_media_type():
    """anime #12 in the sheet must not spare manga #12 locally."""
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "12", "Something"]])
    assert clean.is_orphan_media(_media("uuid-1", "manga", 12, "Other"), idx) is True


def test_row_missing_on_every_identity_is_an_orphan():
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "77", "Something Else"]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, "Cowboy Bebop"), idx) is True


def test_an_empty_local_display_name_does_not_match_an_empty_sheet_cell():
    """Two rows both missing a name are not thereby the same row."""
    idx = clean.index_tab([HEADERS, ["uuid-9", "anime", "77", ""]])
    assert clean.is_orphan_media(_media("uuid-1", "anime", 12, ""), idx) is True
