"""
comicvine_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
Comic Vine API into the formats required by our database models.

A Comic Vine "volume" is one numbered run, which is exactly what one row of the
`comic` table represents.
"""

import logging
import re
from typing import Any, Dict, Iterable, List, Optional

from app.utils.release_date import normalize

logger = logging.getLogger(__name__)

# ==========================================
# CONSTANTS & MAPPINGS
# ==========================================

# Comic Vine site URLs embed the resource type as a prefix: 4050 is a volume,
# 4000 an issue, 4005 a character. Only volume URLs identify a run, so the
# prefix is matched literally rather than captured.
COMICVINE_VOLUME_ID_PATTERN = re.compile(r"comicvine\.gamespot\.com/[^/]+/4050-(\d+)")

# Comic Vine credits a penciler under any of these role tokens depending on the
# era of the entry; "artist" is the modern catch-all.
WRITER_ROLES = ("writer",)
ARTIST_ROLES = ("penciler", "penciller", "artist")

# Rather than omitting `image`, Comic Vine serves a stock placeholder. Downloading
# one would leave every unmatched entry sharing the same grey square.
PLACEHOLDER_IMAGE_MARKERS = ("blank.png", "image_not_available")

# Cover sizes in descending preference. Covers are displayed large, so the
# original is worth the bytes.
COVER_URL_KEYS = ("original_url", "super_url", "medium_url")


# ==========================================
# DATA TRANSFORMERS
# ==========================================


def extract_comicvine_id(url: Optional[str]) -> Optional[int]:
    """
    Extracts the numeric volume ID from a Comic Vine volume URL.
    Returns None if the URL is invalid, empty, or points at a non-volume resource.
    """
    if not url:
        return None
    match = COMICVINE_VOLUME_ID_PATTERN.search(url)
    if match:
        return int(match.group(1))
    return None


def _split_roles(role_string: Optional[str]) -> List[str]:
    """Comic Vine joins a person's roles into one string: 'penciler, inker'."""
    if not role_string:
        return []
    return [token.strip().lower() for token in role_string.split(",") if token.strip()]


def _extract_credits_by_role(
    person_credits: Optional[List[Dict[str, Any]]], roles: Iterable[str]
) -> Optional[str]:
    """
    Returns a comma-joined list of everyone credited under any of `roles`,
    in the order Comic Vine returned them. Matching is on whole role tokens, so
    'ink' does not match 'inker'. A person credited under two of the requested
    roles is listed once.
    """
    if not person_credits:
        return None

    wanted = {role.lower() for role in roles}
    names: List[str] = []

    for credit in person_credits:
        name = (credit.get("name") or "").strip()
        if not name or name in names:
            continue
        if wanted & set(_split_roles(credit.get("role"))):
            names.append(name)

    return ", ".join(names) if names else None


def _build_volume_label(start_year: Any) -> Optional[str]:
    """Formats a run designator from the start year: 2018 -> '(2018)'."""
    if start_year is None or str(start_year).strip() == "":
        return None
    return f"({str(start_year).strip()})"


def _parse_year(start_year: Any) -> Optional[str]:
    """
    Comic Vine's start_year as a canonical release date.

    A volume only ever carries the year it began, so the stored value stops at
    year precision.
    """
    return normalize(start_year)


def _pick_cover_url(image: Optional[Dict[str, Any]]) -> Optional[str]:
    """Returns the largest available real cover URL, or None if only a placeholder."""
    if not image:
        return None

    for key in COVER_URL_KEYS:
        url = image.get(key)
        if not url:
            continue
        if any(marker in url for marker in PLACEHOLDER_IMAGE_MARKERS):
            return None
        return url

    return None


# ==========================================
# MASTER ORCHESTRATORS
# ==========================================


def map_comicvine_to_comic_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Parses a raw Comic Vine volume detail result into the flat dict expected by
    the Comic model.

    end_date is deliberately absent: the volume object's `last_issue` carries no
    cover date, so deriving it would cost a second request per entry. It stays
    a manual field.
    """
    publisher = raw_data.get("publisher") or {}
    person_credits = raw_data.get("person_credits") or []
    start_year = raw_data.get("start_year")

    return {
        "comic_name_en": raw_data.get("name"),
        "volume_label": _build_volume_label(start_year),
        "publisher": publisher.get("name"),
        "issue_total": raw_data.get("count_of_issues"),
        "release_date": _parse_year(start_year),
        "writer": _extract_credits_by_role(person_credits, WRITER_ROLES),
        "artist": _extract_credits_by_role(person_credits, ARTIST_ROLES),
        "cover_image_url": _pick_cover_url(raw_data.get("image")),
    }
