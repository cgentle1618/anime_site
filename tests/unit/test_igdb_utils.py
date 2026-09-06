"""Mapping IGDB's payload onto game columns."""

from app.utils.igdb_utils import extract_igdb_id, map_igdb_to_game_data

RAW = {
    "id": 1029,
    "name": "Elden Ring",
    "summary": "A vast world.",
    # 2022-02-25 UTC
    "first_release_date": 1645747200,
    "url": "https://www.igdb.com/games/elden-ring",
    "cover": {"url": "//images.igdb.com/igdb/image/upload/t_thumb/co4jni.jpg"},
    "genres": [{"name": "Role-playing (RPG)"}],
    "themes": [{"name": "Fantasy"}, {"name": "Open world"}],
    "game_modes": [{"name": "Single player"}, {"name": "Multiplayer"}],
    "involved_companies": [
        {"company": {"name": "FromSoftware"}, "developer": True, "publisher": False},
        {"company": {"name": "Bandai Namco"}, "developer": False, "publisher": True},
        {"company": {"name": "A Porter"}, "developer": False, "publisher": False},
    ],
    "parent_game": 1029,
}


def test_release_date_is_a_truncated_iso_day():
    assert map_igdb_to_game_data(RAW)["release_date"] == "2022-02-25"


def test_cover_url_is_upgraded_from_thumb_and_given_a_scheme():
    url = map_igdb_to_game_data(RAW)["cover_image_url"]
    assert url.startswith("https://")
    assert "t_thumb" not in url


def test_developers_and_publishers_are_separated():
    mapped = map_igdb_to_game_data(RAW)
    assert mapped["developers"] == ["FromSoftware"]
    assert mapped["publishers"] == ["Bandai Namco"]


def test_a_company_that_is_neither_is_dropped():
    """porting and supporting companies are not credits we keep."""
    assert "A Porter" not in map_igdb_to_game_data(RAW)["developers"]


def test_vocabularies_come_through_as_raw_english_for_the_alias_layer():
    mapped = map_igdb_to_game_data(RAW)
    assert mapped["genres"] == ["Role-playing (RPG)"]
    assert mapped["themes"] == ["Fantasy", "Open world"]
    assert mapped["game_modes"] == ["Single player", "Multiplayer"]


def test_parent_game_is_carried_for_dlc_resolution():
    assert map_igdb_to_game_data(RAW)["parent_igdb_id"] == 1029


def test_missing_keys_map_to_none_and_empty_lists():
    mapped = map_igdb_to_game_data({"id": 5, "name": "Bare"})
    assert mapped["release_date"] is None
    assert mapped["cover_image_url"] is None
    assert mapped["developers"] == []
    assert mapped["genres"] == []


def test_extract_igdb_id_from_a_slug_url():
    assert extract_igdb_id("https://www.igdb.com/games/elden-ring") is None, (
        "a slug URL carries no numeric id"
    )
    assert extract_igdb_id("https://api.igdb.com/v4/games/1029") == 1029
    assert extract_igdb_id(None) is None
