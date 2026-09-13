"""The User Media List tab round-trips a list row."""

import pytest

from app.services.pipelines.tabs import SHEET_TABS
from app.utils import formatter


def test_the_tab_is_registered_after_every_media_tab():
    """Restore order is strict: the entries a list row points at must exist
    before the list row is inserted."""
    names = [t.name for t in SHEET_TABS]
    assert "User Media List" in names
    index = names.index("User Media List")
    for media_tab in (
        "Anime", "Anime Movie", "Movies", "TV Shows", "Cartoons",
        "Manga", "Novel", "Comic", "Game",
    ):
        assert names.index(media_tab) < index, media_tab


def test_the_tab_drops_the_three_database_local_ids():
    """
    system_id, user_id and media_id all belong to whichever database wrote the
    sheet. The natural key replaces them, and Pull resolves it back.
    """
    tab = {t.name: t for t in SHEET_TABS}["User Media List"]
    assert set(tab.drop_columns) == {"system_id", "user_id", "media_id"}
    assert {name for name, _fn in tab.extra_columns} == {
        "media_type", "public_id", "username",
    }


def test_the_parser_reads_the_natural_key_and_every_progress_column():
    row = {
        "media_type": "anime",
        "public_id": "412",
        "username": "admin",
        "status": "Completed",
        "my_rating": "S",
        "ep_fin": "28",
        "my_watch_day": "Friday",
        "vol_fin": "3.5",
        "issue_fin": "6",
        "completed_at": "2024-03-22 00:00:00",
    }
    parsed = formatter.parse_user_media_list_from_sheet(row)
    assert parsed["media_type"] == "anime"
    assert parsed["public_id"] == 412
    assert parsed["username"] == "admin"
    assert parsed["status"] == "Completed"
    assert parsed["my_rating"] == "S"
    assert parsed["ep_fin"] == 28
    assert parsed["vol_fin"] == 3.5
    assert parsed["issue_fin"] == 6


def test_the_parser_leaves_a_blank_progress_column_null():
    parsed = formatter.parse_user_media_list_from_sheet(
        {"media_type": "game", "public_id": "77", "username": "admin",
         "status": "Might Play", "ep_fin": "", "my_rating": ""}
    )
    assert parsed["ep_fin"] is None
    assert parsed["my_rating"] is None


@pytest.mark.parametrize("missing", ["media_type", "public_id", "username"])
def test_a_row_missing_part_of_its_key_is_refused(missing):
    row = {"media_type": "anime", "public_id": "1", "username": "admin",
           "status": "Completed"}
    row.pop(missing)
    with pytest.raises((KeyError, ValueError)):
        formatter.parse_user_media_list_from_sheet(row)
