"""
Nested write for a novel's units.

The media-router factory builds an entry with spec.model(**payload) and
assigns updates with a blind setattr loop, so a nested list has to come out
of the payload first — the same escape hatch pop_remark and pop_plan_flag
use. This module owns what happens to that list.
"""

import uuid

from app.models import NovelUnit


def write_novel_units(db, entry, units, viewer=None) -> None:
    """
    Reconcile entry.units with the payload, in the caller's transaction.

    Rows carrying a system_id are updated, rows without one are inserted, and
    rows the payload omits are deleted. Passing None means "not supplied" and
    leaves the existing rows alone; passing [] clears them.
    """
    if units is None:
        return

    existing = {
        u.system_id: u
        for u in db.query(NovelUnit).filter(NovelUnit.novel_id == entry.system_id).all()
    }
    seen = set()

    for item in units:
        data = item if isinstance(item, dict) else item.model_dump()
        unit_id = data.get("system_id")
        # PUT/POST go through a pydantic schema, which parses this into a
        # UUID before it reaches us. PATCH's payload is a raw dict (see
        # apply_column_patch), so a JSON string survives untouched — coerce
        # it here rather than letting it fail the identity match below and
        # silently duplicate the row as an insert.
        if isinstance(unit_id, str):
            try:
                unit_id = uuid.UUID(unit_id)
            except ValueError:
                unit_id = None
        fields = {
            "unit_kind": data.get("unit_kind"),
            "position": data.get("position"),
            "unit_key": data.get("unit_key"),
            "name_cn": data.get("name_cn"),
            "name_en": data.get("name_en"),
            "remark": data.get("remark"),
            # Guarded by ck_novel_unit_ch_count_arc_only; normalise here so a
            # client that leaves a stale count on a re-kinded row cannot trip
            # the constraint.
            "ch_count": data.get("ch_count") if data.get("unit_kind") == "arc" else None,
            "my_rating": data.get("my_rating"),
        }

        row = existing.get(unit_id) if unit_id else None
        if row is None:
            row = NovelUnit(system_id=uuid.uuid4(), novel_id=entry.system_id, **fields)
            db.add(row)
        else:
            for key, value in fields.items():
                setattr(row, key, value)
        seen.add(row.system_id)

    for unit_id, row in existing.items():
        if unit_id not in seen:
            db.delete(row)

    db.flush()
    db.refresh(entry)
