"""flatten watch order reading order into item.position

Parts stop being a sort tier. Reading order becomes `watch_order_item.position`
alone, and a part is drawn around whichever run of adjacent steps shares a
`section_id` - which is what lets an unfiled step sit between two parts, a
position the old rule could not express.

The old rule ranked steps by their section first and read every unfiled step
ahead of every part. Under the new rule those same rows would reshuffle, so
this rewrites `position` to 1..N in each list's *current* effective reading
order. Every existing guide therefore reads exactly as it did before, and the
Krakoan / A.X.E. orders seeded in 7c299db are unchanged.

Sections keep `position`, but it now anchors only a part that has no steps yet;
it is rewritten here to sit in the same stream as the items so an empty part
still lands where it was authored.

Revision ID: wo_flat_order
Revises: ws1e2c3t4i5n
Create Date: 2026-08-28
"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "wo_flat_order"
down_revision = "ws1e2c3t4i5n"
branch_labels = None
depends_on = None


def _section_rank(sections):
    """
    The old read-time rank of each section: by `position`, NULLs last, ties
    broken by the order the query returned - the same key the retired
    `sort_items_by_section` used, so the replay matches what admins saw.
    """
    ordered = sorted(
        enumerate(sections),
        key=lambda pair: (pair[1][1] is None, pair[1][1] or 0.0, pair[0]),
    )
    return {row[0]: float(index) for index, (_original, row) in enumerate(ordered)}


def upgrade():
    conn = op.get_bind()

    list_ids = [
        row[0] for row in conn.execute(sa.text("SELECT system_id FROM watch_order_list"))
    ]

    for list_id in list_ids:
        sections = conn.execute(
            sa.text(
                "SELECT system_id, position FROM watch_order_section"
                " WHERE list_id = :lid"
            ),
            {"lid": list_id},
        ).fetchall()
        rank = _section_rank(sections)

        items = conn.execute(
            sa.text(
                "SELECT system_id, position, section_id FROM watch_order_item"
                " WHERE list_id = :lid"
            ),
            {"lid": list_id},
        ).fetchall()

        # Replays the old key exactly: unfiled steps first, then section by
        # section, each section's steps by their own position with NULLs last.
        # A step naming another list's section ranked as unfiled, and still
        # does - `rank.get` returns None for it.
        def key(item, _rank=rank):
            section_rank = _rank.get(item[2])
            return (
                0 if section_rank is None else 1,
                section_rank or 0.0,
                item[1] is None,
                item[1] or 0.0,
            )

        for index, item in enumerate(sorted(items, key=key), start=1):
            conn.execute(
                sa.text(
                    "UPDATE watch_order_item SET position = :pos"
                    " WHERE system_id = :sid"
                ),
                {"pos": float(index), "sid": item[0]},
            )

        # A part now anchors in the item stream. One with steps takes its place
        # from them and this value is ignored; one without lands after the last
        # step, which is where an empty part was authored.
        end = float(len(items))
        for offset, (section_id, _position) in enumerate(
            sorted(sections, key=lambda row: (row[1] is None, row[1] or 0.0)), start=1
        ):
            conn.execute(
                sa.text(
                    "UPDATE watch_order_section SET position = :pos"
                    " WHERE system_id = :sid"
                ),
                {"pos": end + offset, "sid": section_id},
            )


def downgrade():
    """
    Irreversible in substance, and deliberately a no-op.

    The old order is recoverable from the new one - the rewrite is a permutation
    - but only with the section ranks that were discarded above. Restoring
    approximate positions would be worse than leaving the flattened ones, which
    the old read-time rule still sorts into a valid, if differently grouped,
    guide.
    """
