"""
igdb_utils.py
Turns a raw IGDB game object into the shape `autofill_game_from_igdb` writes.

Two deliberate non-translations live here:

* Genres, themes, game modes and platforms come through as **raw English**.
  Turning "Role-playing (RPG)" into the vocabulary value is the alias layer's
  job (`system_option_alias` / `resolve_option_alias`), because an unmatched
  value must surface as a gap to fill rather than be silently invented here.
* `parent_game` is carried as a bare IGDB id. Resolving it to a `system_id`
  needs the database, which a pure mapper does not have.
"""

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from app.utils.release_date import normalize

logger = logging.getLogger(__name__)

# IGDB API URLs carry the numeric id; the public www.igdb.com URLs carry only a
# slug, so they yield nothing. Matching the API shape keeps `igdb_link` honest:
# a slug URL is a link, not an identifier.
IGDB_ID_PATTERN = re.compile(r"api\.igdb\.com/v\d+/games/(\d+)")

# IGDB serves protocol-relative cover URLs sized `t_thumb` (90x128). The size is
# a path segment, swapped for the largest 2x size IGDB publishes.
COVER_THUMB_SEGMENT = "t_thumb"
COVER_LARGE_SEGMENT = "t_cover_big_2x"


def extract_igdb_id(url: Optional[str]) -> Optional[int]:
    """
    Extracts the numeric game ID from an IGDB API URL.
    Returns None for an empty value or a slug URL, which carries no id.
    """
    if not url:
        return None
    match = IGDB_ID_PATTERN.search(str(url))
    return int(match.group(1)) if match else None


def _names(items: Optional[List[Dict[str, Any]]]) -> List[str]:
    """The `name` of every expanded sub-object, in IGDB's own order."""
    if not items:
        return []
    return [item.get("name") for item in items if isinstance(item, dict) and item.get("name")]


def _release_day(timestamp: Any) -> Optional[str]:
    """
    IGDB's `first_release_date` is Unix seconds UTC; the column is a truncated
    ISO day. Read as UTC deliberately — IGDB dates are authored in UTC, and a
    local-time read would shift a midnight release by a day.
    """
    if timestamp is None:
        return None
    try:
        day = datetime.fromtimestamp(float(timestamp), tz=timezone.utc).date()
    except (TypeError, ValueError, OSError, OverflowError):
        logger.warning("IGDB first_release_date '%s' is not a timestamp.", timestamp)
        return None
    return normalize(day.isoformat())


def _cover_url(cover: Optional[Dict[str, Any]]) -> Optional[str]:
    """`//images.igdb.com/.../t_thumb/co4jni.jpg` -> a large https URL."""
    if not isinstance(cover, dict):
        return None
    url = cover.get("url")
    if not url:
        return None
    url = url.replace(f"/{COVER_THUMB_SEGMENT}/", f"/{COVER_LARGE_SEGMENT}/")
    if url.startswith("//"):
        url = f"https:{url}"
    return url


def _companies(raw: Dict[str, Any]) -> Dict[str, List[str]]:
    """
    Partitions `involved_companies` on its two booleans. A company that is
    neither — a porting or supporting studio — is dropped: it is not a credit
    this project keeps, and crediting it as a developer would be wrong.
    """
    developers: List[str] = []
    publishers: List[str] = []
    for involved in raw.get("involved_companies") or []:
        if not isinstance(involved, dict):
            continue
        name = (involved.get("company") or {}).get("name")
        if not name:
            continue
        if involved.get("developer"):
            developers.append(name)
        if involved.get("publisher"):
            publishers.append(name)
    return {"developers": developers, "publishers": publishers}


def map_igdb_to_game_data(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """Maps one raw IGDB game object onto the columns and credits Fill writes."""
    raw = raw or {}
    companies = _companies(raw)

    return {
        "igdb_id": raw.get("id"),
        "name": raw.get("name"),
        "summary": raw.get("summary"),
        "release_date": _release_day(raw.get("first_release_date")),
        "igdb_link": raw.get("url"),
        "cover_image_url": _cover_url(raw.get("cover")),
        "developers": companies["developers"],
        "publishers": companies["publishers"],
        "genres": _names(raw.get("genres")),
        "themes": _names(raw.get("themes")),
        "game_modes": _names(raw.get("game_modes")),
        "platforms": _names(raw.get("platforms")),
        "parent_igdb_id": raw.get("parent_game"),
    }
