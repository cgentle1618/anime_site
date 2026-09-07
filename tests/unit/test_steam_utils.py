"""Reading a Steam appid out of a store URL."""

from decimal import Decimal

from app.utils.steam_utils import extract_steam_appid, map_steam_to_game_data


def test_a_canonical_store_url_yields_the_appid():
    assert extract_steam_appid("https://store.steampowered.com/app/1245620/") == 1245620


def test_a_url_with_a_trailing_slug_still_yields_the_appid():
    url = "https://store.steampowered.com/app/1245620/ELDEN_RING/"
    assert extract_steam_appid(url) == 1245620


def test_a_community_url_is_not_a_store_url():
    assert extract_steam_appid("https://steamcommunity.com/app/1245620") is None


def test_junk_and_empty_values_yield_none():
    assert extract_steam_appid("not a url") is None
    assert extract_steam_appid("") is None
    assert extract_steam_appid(None) is None


def payloads(**overrides):
    """Three regions as fetch_steam_appdetails returns them."""
    base = {
        "us": {
            "is_free": False,
            "metacritic": {"score": 96},
            "achievements": {"total": 42},
            "price_overview": {"currency": "USD", "initial": 5999, "final": 3599},
        },
        "jp": {
            "price_overview": {"currency": "JPY", "initial": 900000, "final": 450000}
        },
        "tw": {
            "price_overview": {"currency": "TWD", "initial": 179000, "final": 89900}
        },
    }
    base.update(overrides)
    return base


class TestPrices:
    def test_two_implied_decimals_are_removed(self):
        mapped = map_steam_to_game_data(payloads())
        assert mapped["price_original_us"] == Decimal("59.99")
        assert mapped["price_current_us"] == Decimal("35.99")

    def test_yen_uses_the_same_divisor(self):
        """Verified against the live storefront: JPY carries the multiplier too."""
        mapped = map_steam_to_game_data(payloads())
        assert mapped["price_original_jp"] == Decimal("9000.00")
        assert mapped["price_current_jp"] == Decimal("4500.00")

    def test_every_region_lands_in_its_own_columns(self):
        mapped = map_steam_to_game_data(payloads())
        assert mapped["price_current_tw"] == Decimal("899.00")

    def test_a_region_answering_in_the_wrong_currency_is_dropped(self):
        """A redirect must not write a US price into the JP column."""
        wrong = {"price_overview": {"currency": "USD", "initial": 5999, "final": 3599}}
        mapped = map_steam_to_game_data(payloads(jp=wrong))
        assert mapped["price_original_jp"] is None
        assert mapped["price_current_jp"] is None
        assert mapped["price_current_us"] == Decimal("35.99")

    def test_a_free_game_has_no_prices_at_all(self):
        free = {"is_free": True, "metacritic": {"score": 80}}
        mapped = map_steam_to_game_data({"us": free})
        assert mapped["is_free"] is True
        assert mapped["price_original_us"] is None
        assert mapped["price_current_us"] is None

    def test_a_missing_region_is_not_an_error(self):
        mapped = map_steam_to_game_data({"us": payloads()["us"]})
        assert mapped["price_current_jp"] is None
        assert mapped["price_current_us"] == Decimal("35.99")


class TestNonPriceFields:
    def test_the_metacritic_critic_score_comes_through(self):
        assert map_steam_to_game_data(payloads())["metacritic_score"] == 96

    def test_the_achievement_total_comes_through(self):
        assert map_steam_to_game_data(payloads())["achievements_total"] == 42

    def test_a_game_with_neither_block_maps_to_none(self):
        mapped = map_steam_to_game_data({"us": {"is_free": False}})
        assert mapped["metacritic_score"] is None
        assert mapped["achievements_total"] is None

    def test_an_empty_payload_set_maps_to_all_none(self):
        mapped = map_steam_to_game_data({})
        assert mapped["metacritic_score"] is None
        assert mapped["price_current_us"] is None
