"""
Comparison keys for entity names.

Two spellings of one studio or one director must collapse to one row. The data
that exists today was typed by hand over years, so it differs by trailing
spaces, by an interior space that is sometimes there and sometimes not, and by
full-width Latin characters pasted from Japanese sources.

normalize_name produces a key used ONLY for comparison. The original spelling is
always what gets stored - the key never reaches the database.
"""

import re
import unicodedata
from typing import Optional

_WHITESPACE = re.compile(r"\s+")


def normalize_name(raw: str) -> str:
    """Fold a name to a key that ignores width, case and interior whitespace."""
    # NFKC maps full-width Latin/digits onto their half-width forms.
    folded = unicodedata.normalize("NFKC", raw)
    return _WHITESPACE.sub("", folded).casefold()


def split_names(raw: Optional[str]) -> list[str]:
    """
    Split a comma-joined name column into individual names.

    Empty fragments are dropped and duplicates are removed on the normalized
    key, keeping the first spelling seen so the stored value stays the one the
    column already had.
    """
    if not raw:
        return []

    out: list[str] = []
    seen: set[str] = set()
    for fragment in str(raw).split(","):
        name = fragment.strip()
        if not name:
            continue
        key = normalize_name(name)
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out
