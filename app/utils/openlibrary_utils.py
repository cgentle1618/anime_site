"""
openlibrary_utils.py
Pure transformations of Open Library JSON into the shapes the novel autofill
writes. No HTTP here — the client lives in
app/services/integrations/openlibrary.py.
"""

import re
from datetime import date
from typing import Any, Dict, List, Optional

from app.utils.release_date import normalize

# Only a *work* URL. An edition (/books/OL...M) or an author (/authors/OL...A)
# names the wrong kind of thing, and a wrong id is worse than no id.
OPENLIBRARY_WORK_ID_PATTERN = re.compile(r"openlibrary\.org/works/(OL\d+W)")


def extract_openlibrary_id(url: Optional[str]) -> Optional[str]:
    """
    Extracts the OL...W work id from an Open Library work URL.
    Returns None if the URL is empty, malformed, or points at a non-work resource.
    """
    if not url:
        return None
    match = OPENLIBRARY_WORK_ID_PATTERN.search(url)
    if match:
        return match.group(1)
    return None


COVER_URL_TEMPLATE = "https://covers.openlibrary.org/b/id/{cover_id}-L.jpg"

# publish_date is free text: "2006", "July 2015", "March 1, 2011", "n.d.".
YEAR_PATTERN = re.compile(r"(1[4-9]\d\d|20\d\d)")


def _earliest_edition_year(editions: Optional[List[Dict[str, Any]]]) -> Optional[int]:
    """
    The earliest year any edition of this work was published.

    work.first_publish_date is the field this should have used, but it is
    unpopulated on real records, so the editions list is the only source. The
    earliest edition beat the search API's first_publish_year on every entry
    tested; see the spec's probe findings.
    """
    ceiling = date.today().year + 1
    years = []
    for edition in editions or []:
        match = YEAR_PATTERN.search(str(edition.get("publish_date") or ""))
        if not match:
            continue
        year = int(match.group(1))
        if year <= ceiling:
            years.append(year)
    return min(years) if years else None


def _pick_cover_url(work: Dict[str, Any]) -> Optional[str]:
    """
    The first real cover id. Open Library writes -1 for "no cover here" rather
    than omitting the slot, and that id 404s when downloaded.
    """
    for cover_id in work.get("covers") or []:
        if isinstance(cover_id, int) and cover_id > 0:
            return COVER_URL_TEMPLATE.format(cover_id=cover_id)
    return None


def map_openlibrary_to_novel_data(raw: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """
    The three things an anchor book can tell us about the whole entry: when the
    entry starts, who wrote it, and what it looks like.

    Nothing else is mapped. end_date, volume and chapter totals and
    serialization status are true of the *set*, and one book cannot know them —
    see the design spec, Decision A.
    """
    payload = raw or {}
    work = payload.get("work") or {}

    names = [
        (author.get("name") or "").strip()
        for author in payload.get("authors") or []
    ]
    names = [name for name in names if name]

    return {
        "release_date": normalize(_earliest_edition_year(payload.get("editions"))),
        "author": ", ".join(names) or None,
        "cover_image_url": _pick_cover_url(work),
    }
