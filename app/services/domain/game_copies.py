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
from app.services.domain.user_list import acting_user_id
from app.services.rbac.permissions import PERM_SELF_LIST


def write_game_copies(db, entry, copies, viewer=None) -> None:
    """
    Reconcile entry.copies with the payload, in the caller's transaction.

    Rows carrying a system_id are updated, rows without one are inserted, and
    rows the payload omits are deleted. Passing None means "not supplied" and
    leaves the existing rows alone; passing [] clears them.
    """
    if copies is None:
        return

    # Scoped to the acting user: a copy belongs to whoever bought it, and a
    # reconcile that saw everyone's rows would delete other people's
    # purchases as soon as this payload omitted them.
    user_id = acting_user_id(db, viewer)
    if user_id is None:
        # Nobody to own them. Every caller is an admin-gated request path, so
        # this is unreachable in practice - but game_copy.user_id is NOT NULL,
        # and reaching the INSERT would raise an IntegrityError that says
        # nothing about the cause. novel_unit_writer guards the same way.
        return
    # Somebody is acting, but may not KEEP rows of their own. A copy is a
    # personal-ownership row that happens to be written through a catalogue
    # route (the Game entry form), so `manage.catalog` is the wrong question
    # and `self.list` is the right one: an administrative account edits the
    # game and does not thereby acquire a copy of it.
    #
    # Skipped rather than refused, deliberately. This is a nested field of a
    # write the caller IS allowed to make, so failing the whole Game edit
    # would refuse the catalogue change over a payload the SPA does not even
    # render for this account - GameCopiesEditor is gated on the same
    # permission. This is the second stop, not the only one.
    if viewer is not None and not viewer.has(PERM_SELF_LIST):
        return
    existing = {
        c.system_id: c
        for c in db.query(GameCopy)
        .filter(
            GameCopy.game_id == entry.system_id,
            GameCopy.user_id == user_id,
        )
        .all()
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
            row = GameCopy(
                system_id=uuid.uuid4(),
                game_id=entry.system_id,
                user_id=user_id,
                **fields,
            )
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
