"""Shared normalisation for `manga.serialization_platform` free text.

Two migrations read this column and must agree on the vocabulary they land
on, or values are silently lost:

- `sv1o2c3a4b_seed_source_vocabulary` seeds `system_option` rows for the
  "Serialization Platform" category from whatever has been typed so far.
- A later migration backfills `media_tag` rows pointing at those options,
  splitting a compound raw value into one tag row per part.

Migrations must not import each other, so the algorithm lives here instead,
where it is unit-testable (a migration body never runs under pytest - the
test suite builds schemas from models). See
`.superpowers/sdd/2026-09-04-media-sources/task-10-decisions.md` for the
worked examples and the controller's answers this implements:

- comma-compound values are split into separate options;
- case variants and parentheticals are auto-merged.
"""

from __future__ import annotations

import re
from collections import defaultdict
from collections.abc import Iterable

_PARENTHETICAL_RE = re.compile(r"^(.*?)\s*\((.+)\)$")


def normalise(raw: str) -> list[tuple[str, str | None]]:
    """Split one raw `serialization_platform` value into (base, remark) parts.

    1. Split on `,`.
    2. Trim each part; drop empties.
    3. If a part matches `^(.*?)\\s*\\((.+)\\)$`, the base is group 1 and the
       remark is group 2; otherwise remark is None.
    """
    parts: list[tuple[str, str | None]] = []
    for chunk in raw.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        match = _PARENTHETICAL_RE.match(chunk)
        if match:
            base = match.group(1).strip()
            remark = match.group(2).strip()
            parts.append((base, remark))
        else:
            parts.append((chunk, None))
    return parts


def _uppercase_ascii_count(value: str) -> int:
    return sum(1 for ch in value if ch.isascii() and ch.isupper())


def canonical_values(
    raws: Iterable[str],
) -> dict[str, tuple[str, str | None]]:
    """Merge every base spelling across `raws` into one canonical option each.

    Returns a dict keyed by `str.casefold()` of the base, mapping to
    `(canonical_value, remark)`. Grouping and tie-breaks:

    a. the spelling that occurs most often across all rows wins;
    b. tie -> the spelling with the fewest uppercase ASCII characters;
    c. tie -> lexicographically first.

    Remarks: if any variant in a group carried a remark, it is attached to
    the canonical option. If two variants carry different remarks, they are
    joined with "; " rather than one being dropped.
    """
    counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    remarks: dict[str, list[str]] = defaultdict(list)

    for raw in raws:
        for base, remark in normalise(raw):
            key = base.casefold()
            counts[key][base] += 1
            if remark is not None and remark not in remarks[key]:
                remarks[key].append(remark)

    result: dict[str, tuple[str, str | None]] = {}
    for key, spellings in counts.items():
        max_count = max(spellings.values())
        candidates = [s for s, c in spellings.items() if c == max_count]
        if len(candidates) > 1:
            min_upper = min(_uppercase_ascii_count(s) for s in candidates)
            candidates = [
                s for s in candidates if _uppercase_ascii_count(s) == min_upper
            ]
        canonical = sorted(candidates)[0]
        joined_remark = "; ".join(remarks[key]) if remarks[key] else None
        result[key] = (canonical, joined_remark)
    return result


def resolve(raw: str, canonical_map: dict[str, tuple[str, str | None]]) -> list[str]:
    """The ordered list of canonical values one raw row splits into.

    `canonical_map` must be (a superset of) the result of `canonical_values`
    over the full corpus that raw came from - every base this raw normalises
    to must already have a group.
    """
    return [canonical_map[base.casefold()][0] for base, _remark in normalise(raw)]
