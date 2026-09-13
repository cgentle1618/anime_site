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


def test_the_completion_flags_parse_as_a_four_state_vocabulary():
    """"Inapplicable" is the fourth state: the game has no endings to see at
    all, which is a different claim from "I did not see them" and from the
    blank "I have not recorded this"."""
    parsed = parse_game_from_sheet(
        {
            "all_endings": "Yes",
            "all_achievements": "No",
            "all_collected": "Inapplicable",
        }
    )
    assert parsed["all_endings"] == "Yes"
    assert parsed["all_achievements"] == "No"
    assert parsed["all_collected"] == "Inapplicable"


def test_a_blank_completion_flag_is_still_unknown():
    parsed = parse_game_from_sheet({"all_endings": ""})
    assert parsed["all_endings"] is None


def test_completion_flags_accept_the_booleans_older_backups_hold():
    """A sheet written before these columns became a vocabulary holds TRUE and
    FALSE. Pull must map those, or it would store the literal string."""
    parsed = parse_game_from_sheet(
        {"all_endings": "TRUE", "all_achievements": "false", "all_collected": "Y"}
    )
    assert parsed["all_endings"] == "Yes"
    assert parsed["all_achievements"] == "No"
    assert parsed["all_collected"] == "Yes"


def test_a_completion_flag_outside_the_vocabulary_is_dropped():
    """Better unknown than a value no code branch recognises."""
    parsed = parse_game_from_sheet({"all_endings": "banana"})
    assert parsed["all_endings"] is None


def test_steam_progress_sync_stays_a_boolean():
    """It is a lock on Steam writes, not a completion axis - see
    autofill.py, which tests it with `is False`."""
    parsed = parse_game_from_sheet({"steam_progress_sync": "FALSE"})
    assert parsed["steam_progress_sync"] is False


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
