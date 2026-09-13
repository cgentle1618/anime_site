"""LIST_FIELDS / STATUS_FIELD / split_list_payload. Pure functions, no DB."""

import pytest

from app.services.domain.user_list import (
    DEFAULT_STATUS,
    LIST_FIELDS,
    STATUS_FIELD,
    split_list_payload,
)


def test_all_nine_hyphenated_media_types_are_present():
    expected = {
        "anime", "anime-movie", "movie", "tv-show", "cartoon",
        "manga", "novel", "comic", "game",
    }
    assert set(LIST_FIELDS) == expected
    assert set(STATUS_FIELD) == expected
    assert set(DEFAULT_STATUS) == expected


@pytest.mark.parametrize(
    "media_type, status_field, default",
    [
        ("anime", "watching_status", "Might Watch"),
        ("anime-movie", "watching_status", "Might Watch"),
        ("movie", "watching_status", "Might Watch"),
        ("tv-show", "watching_status", "Might Watch"),
        ("cartoon", "watching_status", "Might Watch"),
        ("manga", "reading_status", "Might Read"),
        ("novel", "reading_status", "Might Read"),
        ("comic", "reading_status", "Might Read"),
        ("game", "playing_status", "Might Play"),
    ],
)
def test_status_field_and_default_per_type(media_type, status_field, default):
    assert STATUS_FIELD[media_type] == status_field
    assert DEFAULT_STATUS[media_type] == default


@pytest.mark.parametrize(
    "media_type, expected",
    [
        ("anime", ("watching_status", "my_rating", "ep_fin", "my_watch_day", "completed_at")),
        ("anime-movie", ("watching_status", "my_rating", "completed_at")),
        ("movie", ("watching_status", "my_rating", "completed_at")),
        ("tv-show", ("watching_status", "my_rating", "ep_fin", "completed_at")),
        ("cartoon", ("watching_status", "my_rating", "ep_fin", "completed_at")),
        ("manga", ("reading_status", "my_rating", "vol_fin", "vol_fin_page",
                   "ch_fin", "completed_at")),
        ("novel", ("reading_status", "my_rating", "vol_fin", "arc_fin", "ch_fin",
                   "ch_fin_in_arc", "progress_display", "completed_at")),
        ("comic", ("reading_status", "my_rating", "issue_fin", "completed_at")),
        ("game", ("playing_status", "my_rating", "completed_at")),
    ],
)
def test_list_fields_per_type(media_type, expected):
    assert set(LIST_FIELDS[media_type]) == set(expected)


def test_every_list_field_except_the_status_alias_is_a_real_column():
    from app import models

    columns = set(models.UserMediaList.__table__.columns.keys())
    for media_type, fields in LIST_FIELDS.items():
        for field in fields:
            if field == STATUS_FIELD[media_type]:
                continue
            assert field in columns, f"{media_type}.{field}"


def test_split_list_payload_separates_the_two_kinds_of_fact():
    payload = {
        "anime_name_cn": "葬送的芙莉蓮",
        "ep_total": 28,
        "watching_status": "Completed",
        "my_rating": "9.5",
        "ep_fin": 28,
    }
    catalog, personal = split_list_payload("anime", payload)
    assert catalog == {"anime_name_cn": "葬送的芙莉蓮", "ep_total": 28}
    assert personal == {
        "watching_status": "Completed", "my_rating": "9.5", "ep_fin": 28,
    }


def test_split_list_payload_leaves_the_input_untouched():
    payload = {"ep_total": 12, "my_rating": "8"}
    split_list_payload("anime", payload)
    assert payload == {"ep_total": 12, "my_rating": "8"}


def test_split_list_payload_keeps_a_types_own_keys_only():
    """ep_fin is a movie's nothing: it must stay in the catalogue half so the
    normal unknown-column error fires instead of being silently swallowed."""
    catalog, personal = split_list_payload("movie", {"ep_fin": 3, "my_rating": "7"})
    assert catalog == {"ep_fin": 3}
    assert personal == {"my_rating": "7"}
