"""Clear the chapter and arc counters on volume-only novels.

Revision ID: v1o2l3o4n5l6

WHAT WAS WRONG
--------------
A Light Novel and a Novel are counted in volumes. Nothing in the UI ever
offered a chapter or an arc for them - NOVEL_UNIT_KINDS_BY_TYPE has allowed
only "volume" on both types since the novel_unit table landed - but the
`novel` row still carried arc_total / arc_fin / ch_total / ch_fin /
ch_fin_in_arc from before that table existed, and the detail page rendered
them anyway. A finished 11-volume light novel read as "CHAPTERS 0 / 110".

Those numbers are not stale-but-true; they are meaningless for the type. This
clears them once, and derive_novel_progress() keeps them clear on every write
path afterwards (forms, tracker PATCH, Pull, Fill, Calculate).

The unit rows go too: an arc, story or chapter row cannot be created for these
types through the editor, but a Pull from the sheet can carry one in, and a
surviving arc row would be a counter the type does not have. Volume rows -
the only kind these types may hold - are untouched.

WHY THE DOWNGRADE DOES NOT RESTORE
----------------------------------
The old values are not recoverable: nothing else in the schema records what
ch_total was, and the deleted unit rows carry names of their own. The
downgrade is a no-op on purpose rather than a lie. Restoring means a Pull
from a sheet backed up before this ran.

Revises: c1h2a3r4a5c6
Create Date: 2026-09-05
"""

from alembic import op
from app.utils.constants import NOVEL_VOLUME_ONLY_TYPES

revision = "v1o2l3o4n5l6"
down_revision = "c1h2a3r4a5c6"
branch_labels = None
depends_on = None

# Rendered from the same tuple the runtime rule reads, so the migration cannot
# clean a different set of types than derive_novel_progress() maintains.
VOLUME_ONLY_TYPES_SQL = ", ".join(f"'{t}'" for t in NOVEL_VOLUME_ONLY_TYPES)

DELETE_NON_VOLUME_UNITS = f"""
    DELETE FROM novel_unit
    WHERE unit_kind <> 'volume'
      AND novel_id IN (
          SELECT system_id FROM novel WHERE type IN ({VOLUME_ONLY_TYPES_SQL})
      )
"""

CLEAR_COUNTERS = f"""
    UPDATE novel
    SET arc_total = NULL,
        ch_total = NULL,
        arc_fin = 0,
        ch_fin = 0,
        ch_fin_in_arc = 0
    WHERE type IN ({VOLUME_ONLY_TYPES_SQL})
      AND (
          arc_total IS NOT NULL
          OR ch_total IS NOT NULL
          OR arc_fin <> 0
          OR ch_fin <> 0
          OR ch_fin_in_arc <> 0
      )
"""


def upgrade() -> None:
    op.execute(DELETE_NON_VOLUME_UNITS)
    op.execute(CLEAR_COUNTERS)


def downgrade() -> None:
    # Deliberately empty: see "WHY THE DOWNGRADE DOES NOT RESTORE" above.
    pass
