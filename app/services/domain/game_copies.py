"""
Nested write for a game's copy rows, and the ownership derived from them.

The media-router factory builds an entry with spec.model(**payload) and
assigns updates with a blind setattr loop, so a nested list has to come out
of the payload first - the same escape hatch write_novel_units uses. This
module owns what happens to that list.
"""

import uuid
from typing import Optional

from app.models import GameCopy


def write_game_copies(db, entry, copies, viewer=None) -> None:
    """
    Reconcile entry.copies with the payload, in the caller's transaction.

    Rows carrying a system_id are updated, rows without one are inserted, and
    rows the payload omits are deleted. Passing None means "not supplied" and
    leaves the existing rows alone; passing [] clears them.
    """
    if copies is None:
        return

    existing = {
        c.system_id: c
        for c in db.query(GameCopy).filter(GameCopy.game_id == entry.system_id).all()
    }
    seen = set()

    for item in copies:
        data = item if isinstance(item, dict) else item.model_dump()
        copy_id = data.get("system_id")
        # PUT/POST go through a pydantic schema, which parses this into a
        # UUID before it reaches us. PATCH's payload is a raw dict (see
        # apply_column_patch), so a JSON string survives untouched - coerce
        # it here rather than letting it fail the identity match below and
        # silently duplicate the row as an insert.
        if isinstance(copy_id, str):
            try:
                copy_id = uuid.UUID(copy_id)
            except ValueError:
                copy_id = None
        fields = {
            "storefront": data.get("storefront"),
            "ownership": data.get("ownership"),
            "copy_format": data.get("copy_format"),
            "acquisition": data.get("acquisition"),
            "price_paid": data.get("price_paid"),
            "price_currency": data.get("price_currency"),
            "acquired_date": data.get("acquired_date"),
            "remark": data.get("remark"),
            "position": data.get("position") or 0,
        }

        row = existing.get(copy_id) if copy_id else None
        if row is None:
            row = GameCopy(system_id=uuid.uuid4(), game_id=entry.system_id, **fields)
            db.add(row)
        else:
            for key, value in fields.items():
                setattr(row, key, value)
        seen.add(row.system_id)

    for copy_id, row in existing.items():
        if copy_id not in seen:
            db.delete(row)

    db.flush()
    db.refresh(entry)


def derive_game_ownership(entry) -> Optional[str]:
    """
    One word for "do I have this", derived rather than stored.

    Owned wins over everything, then Subscription, then Free, then Wishlist.
    Nothing to keep in sync: the copy rows are the only truth.
    """
    kinds = {c.ownership for c in (entry.copies or []) if c.ownership}
    for kind in ("Owned", "Subscription", "Free", "Wishlist", "Not Owned"):
        if kind in kinds:
            return kind
    return None
