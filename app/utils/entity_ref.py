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

from sqlalchemy import select

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


def media_entity_ref_filter(model, ref: str):
    """
    A clause selecting the media entry this reference names.

    The nine media types keep their public_id on `media`, so a public_id
    reference resolves through a subquery against it. The eight non-media
    entities (person, studio, publisher, character, watch_order_list and the
    three grouping tiers) still hold their own public_id and keep using
    entity_ref_filter unchanged.

    A subquery rather than a join, deliberately: _get_or_404 builds
    `db.query(spec.model).filter(clause)` and every caller downstream assumes
    that query returns detail rows only. A join would change its shape.

    Filtering on public_id alone is safe here because the query is already
    scoped to one detail table, so it can only match that type's rows - the
    media_type half of uq_media_type_public_id is implied by the table being
    queried.
    """
    from app.models.media import Media

    kind, value = parse_entity_ref(ref)
    if kind == "system_id":
        return model.system_id == value
    return model.system_id.in_(
        select(Media.system_id).where(Media.public_id == value)
    )


def find_entity(db, model, ref: str):
    """
    The row `ref` names, or None when it names nothing.

    Wraps the parse and the query together so the seventeen detail endpoints
    share one definition of "this id did not resolve" - a junk segment and an
    unmatched id are the same answer, because both mean the page is missing.
    Returns rather than raises so each router keeps its own 404 wording, and
    so this module stays free of any web framework.
    """
    try:
        clause = entity_ref_filter(model, ref)
    except ValueError:
        return None
    return db.query(model).filter(clause).first()
