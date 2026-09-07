"""
Resolving the id segment of a detail-page URL.

The SPA addresses detail pages by public_id (/anime/47/...), but every internal
caller still holds a UUID, and the same endpoint serves both. One parser decides
which it is, so the seventeen routers cannot drift apart in what they accept.

A public_id is a positive decimal integer with no sign, no separators and no
exponent - deliberately stricter than int(), which happily reads " 47 " and
"+47" and would let two spellings of the same URL exist.
"""

import re
import uuid

_POSITIVE_INT = re.compile(r"^[1-9][0-9]*$")


def parse_entity_ref(ref: str) -> tuple[str, object]:
    """('public_id', int) or ('system_id', UUID). Raises ValueError otherwise."""
    if not isinstance(ref, str):
        raise ValueError("entity reference must be a string")
    if _POSITIVE_INT.match(ref):
        return "public_id", int(ref)
    try:
        return "system_id", uuid.UUID(ref)
    except (ValueError, AttributeError, TypeError):
        raise ValueError(f"not a public_id or a system_id: {ref!r}")


def entity_ref_filter(model, ref: str):
    """A SQLAlchemy clause selecting the row this reference names."""
    kind, value = parse_entity_ref(ref)
    return getattr(model, kind) == value
