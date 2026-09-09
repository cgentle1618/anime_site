"""Sheet parsers for the game tabs."""

from app.utils.formatter import (
    parse_game_copy_from_sheet,
    parse_game_from_sheet,
    parse_system_option_alias_from_sheet,
)


def test_blank_cells_become_none():
    parsed = parse_game_from_sheet({"game_name_en": "Hades"})
    assert parsed["hours_played"] is None
    assert parsed["game_name_cn"] is None


def test_playing_status_is_not_parsed_at_all():
    """Step 1 confined the pipelines: the status is the player's and travels
    in the User Media List tab, so the Game parser no longer emits it and the
    Might Play default it used to apply lives in user_list.DEFAULT_STATUS."""
    parsed = parse_game_from_sheet(
        {"game_name_en": "Hades", "playing_status": "Completed"}
    )
    assert "playing_status" not in parsed


def test_release_date_is_normalised():
    assert parse_game_from_sheet({"release_date": "MAR 2022"})["release_date"] == "2022-03"


def test_a_franchise_name_survives_as_a_string_for_the_resolver():
    parsed = parse_game_from_sheet({"franchise_id": "Souls"})
    assert parsed["franchise_id"] == "Souls"


def test_numeric_columns_are_typed():
    parsed = parse_game_from_sheet(
        {"hours_played": "32.5", "achievements_earned": "12", "price_current_us": "19.99"}
    )
    assert parsed["hours_played"] == 32.5
    assert parsed["achievements_earned"] == 12


def test_game_copy_parses_its_fk_strictly():
    assert parse_game_copy_from_sheet({"game_id": "not-a-uuid"})["game_id"] is None


def test_game_copy_normalises_its_date():
    assert (
        parse_game_copy_from_sheet({"acquired_date": "MAR 2022"})["acquired_date"]
        == "2022-03"
    )


def test_alias_parses_its_three_columns():
    parsed = parse_system_option_alias_from_sheet(
        {"id": "3", "option_id": "not-a-uuid", "source": "igdb", "value": "RPG"}
    )
    assert parsed == {"id": 3, "option_id": None, "source": "igdb", "value": "RPG"}


def test_the_completion_flags_parse_as_tristate_booleans():
    parsed = parse_game_from_sheet(
        {"all_endings": "TRUE", "all_achievements": "FALSE", "all_collected": ""}
    )
    assert parsed["all_endings"] is True
    assert parsed["all_achievements"] is False
    assert parsed["all_collected"] is None


def test_the_metacritic_scores_keep_their_two_scales():
    """The metascore is an integer out of 100; the user score is a float out of 10."""
    parsed = parse_game_from_sheet(
        {"metacritic_score": "96", "metacritic_user_score": "8.4"}
    )
    assert parsed["metacritic_score"] == 96
    assert parsed["metacritic_user_score"] == 8.4
    blank = parse_game_from_sheet({})
    assert blank["metacritic_score"] is None
    assert blank["metacritic_user_score"] is None
