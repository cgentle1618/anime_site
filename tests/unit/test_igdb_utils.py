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
    "platforms": [{"name": "PlayStation 5"}, {"name": "PC (Microsoft Windows)"}],
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
    assert mapped["platforms"] == ["PlayStation 5", "PC (Microsoft Windows)"]


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


STEAM_ROW = {
    "id": 119133,
    "name": "Elden Ring",
    "external_games": [
        {"category": 1, "uid": "1245620"},
        {"category": 11, "uid": "somexboxid"},
    ],
}


def test_the_steam_appid_is_read_from_external_games():
    assert map_igdb_to_game_data(STEAM_ROW)["steam_appid"] == 1245620


def test_a_canonical_steam_link_is_synthesised_from_the_appid():
    mapped = map_igdb_to_game_data(STEAM_ROW)
    assert mapped["steam_link"] == "https://store.steampowered.com/app/1245620/"


def test_a_game_with_no_steam_row_yields_neither():
    raw = {"id": 5, "external_games": [{"category": 11, "uid": "xbox"}]}
    mapped = map_igdb_to_game_data(raw)
    assert mapped["steam_appid"] is None
    assert mapped["steam_link"] is None


def test_a_game_with_no_external_games_at_all_yields_neither():
    mapped = map_igdb_to_game_data({"id": 5, "name": "Bare"})
    assert mapped["steam_appid"] is None
    assert mapped["steam_link"] is None


def test_a_non_numeric_uid_is_ignored_rather_than_crashing():
    raw = {"id": 5, "external_games": [{"category": 1, "uid": "not-a-number"}]}
    assert map_igdb_to_game_data(raw)["steam_appid"] is None


def test_the_appid_is_found_when_category_is_null_but_the_new_field_is_set():
    """IGDB mid-migration: the legacy key is sent as null, not omitted."""
    raw = {
        "id": 5,
        "external_games": [{"category": None, "external_game_source": 1, "uid": "1245620"}],
    }
    assert map_igdb_to_game_data(raw)["steam_appid"] == 1245620
