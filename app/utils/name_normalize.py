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


# Kana, the CJK unified ideographs and their extension/compatibility blocks.
# A name containing any of these is not an English name, so the "en" slot is
# out even for a mostly Latin string like "Studio五組".
_CJK = re.compile(r"[぀-ヿ㐀-䶿一-鿿豈-﫿]")

# Novel types whose authors this collection records in Japanese rather than in
# Chinese-rendered kanji. Values are app/models/novel.py's `type` column.
_JP_NOVEL_TYPES = frozenset({"Light Novel", "Web"})

# (role, scope) pairs whose CJK names this collection records in
# Chinese-rendered kanji.
_CN_ROLE_SCOPES = frozenset(
    {
        ("director", "anime"),
        ("director", "anime-movie"),
        ("producer", "anime"),
        ("composer", "anime"),
    }
)


def name_slot_for(
    name: str,
    *,
    role: str,
    scope: str,
    novel_type: Optional[str] = None,
) -> str:
    """
    Which of person's name columns a name belongs in: "en", "cn" or "jp".

    Anime staff and translated literary novelists are recorded in this
    collection as Chinese-rendered kanji; manga, comic and light-novel creators
    are recorded in Japanese. Latin names are English. Measured on the live data
    2026-09-04: 218 Latin, 167 in the cn bucket, 169 in the jp bucket.

    The rule is shared by the reshape migration and by resolve_person so that a
    name cannot land in one column during the migration and another the next
    day - the migration is not the only writer of a new person.

    `novel_type` is only knowable where a join to `novel` exists: the migration
    passes it, resolve_person cannot and passes None. None therefore means
    "assume light novel", which is the majority of this collection's novels
    (55 Light Novel/Web against 43 that are not).

    Never returns "alt". That slot means "a name that is none of these three",
    which only a human can assert; a writer guessing its way in would make the
    meaning useless.
    """
    if not _CJK.search(name or ""):
        return "en"
    if (role, scope) in _CN_ROLE_SCOPES:
        return "cn"
    if role == "author" and scope == "novel":
        return "jp" if novel_type is None or novel_type in _JP_NOVEL_TYPES else "cn"
    return "jp"


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
