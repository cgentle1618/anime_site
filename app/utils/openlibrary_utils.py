"""
openlibrary_utils.py
Pure transformations of Open Library JSON into the shapes the novel autofill
writes. No HTTP here — the client lives in
app/services/integrations/openlibrary.py.
"""

import re
from typing import Optional

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
