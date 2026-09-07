"""
steam_utils.py
Pure helpers for the Steam integration: reading an appid out of a store URL,
and mapping storefront payloads onto game columns. No I/O lives here.
"""

import logging
import re
from decimal import Decimal
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Only the store host carries an appid we trust. A steamcommunity.com URL uses
# the same /app/<id>/ shape but is a hub link, not the store page the prices
# and Metacritic score come from.
STEAM_APPID_PATTERN = re.compile(r"store\.steampowered\.com/app/(\d+)")

# The three storefronts the price columns model, and the currency each must
# answer in. A mismatch means Steam redirected the request to another region.
REGIONS = ("us", "jp", "tw")
EXPECTED_CURRENCY = {"us": "USD", "jp": "JPY", "tw": "TWD"}


def extract_steam_appid(url: Optional[str]) -> Optional[int]:
    """
    Extracts the numeric appid from a Steam store URL.
    Returns None for an empty value or a non-store URL.
    """
    if not url:
        return None
    match = STEAM_APPID_PATTERN.search(str(url))
    return int(match.group(1)) if match else None


def steam_link_for(appid: int) -> str:
    """The canonical store URL we store, so its shape is ours and is stable."""
    return f"https://store.steampowered.com/app/{appid}/"


# Steam returns every price as an integer with two implied decimals, whatever
# the currency - yen included, despite having no minor unit in the real world.
# Verified against the live storefront on 2026-09-06 with app 1245620:
# USD 5999 -> $59.99, JPY 902000 -> Y9,020, TWD 179000 -> NT$1,790.
PRICE_SCALE = Decimal(100)


def _price(block: Optional[Dict[str, Any]], key: str, cc: str) -> Optional[Decimal]:
    """
    One price out of a region's price_overview, or None.

    A region answering in the wrong currency has been redirected, and its
    numbers belong to some other storefront - dropped with a warning rather
    than written into this region's column.
    """
    if not block:
        return None

    currency = block.get("currency")
    if currency != EXPECTED_CURRENCY.get(cc):
        logger.warning(
            f"Steam answered {cc} in {currency}, expected "
            f"{EXPECTED_CURRENCY.get(cc)}; dropping that region's prices."
        )
        return None

    value = block.get(key)
    if value is None:
        return None

    return Decimal(int(value)) / PRICE_SCALE


def map_steam_to_game_data(payloads: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
    """
    Maps the per-region storefront payloads onto the columns Fill writes.

    `payloads` is {country code: the `data` block}, as
    `fetch_steam_appdetails` returns it. A missing region is ordinary - the
    app may not be sold there - and so is a missing `price_overview`, which is
    what a free or unreleased game answers.

    The non-price fields are read from the `us` payload, since `appdetails`
    returns them identically for every region.
    """
    primary = payloads.get("us") or next(iter(payloads.values()), {}) or {}

    metacritic = primary.get("metacritic") or {}
    achievements = primary.get("achievements") or {}

    mapped: Dict[str, Any] = {
        "metacritic_score": metacritic.get("score"),
        "achievements_total": achievements.get("total"),
        "is_free": bool(primary.get("is_free")),
    }

    for cc in REGIONS:
        block = (payloads.get(cc) or {}).get("price_overview")
        mapped[f"price_original_{cc}"] = _price(block, "initial", cc)
        mapped[f"price_current_{cc}"] = _price(block, "final", cc)

    return mapped
