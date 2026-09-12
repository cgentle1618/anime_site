"""credits and system info stop being field groups

Revision ID: q3s4sysinfo
Revises: p2g3guestsafe
Create Date: 2026-09-12 00:00:00.000000

Two keys leave `access_mode_field_group`. Neither is replaced by anything —
not another field group, and not a role permission.

`credits` was never worth gating: studio, director and the rest of the credit
vocabulary are what an entry IS, so they are now served to every viewer.

`system_info` covered `created_at` / `updated_at`, which say when the
catalogue ROW was last edited — a fact about the database rather than about
the work — and which no page displays. The one visible thing it also named,
the entry id printed down a detail page's poster spine, was never gated by it
at all: `system_id` is the route parameter of the page the viewer is already
on. That decoration is now drawn on `is_superuser` in the SPA, which needs no
permission and no column.

Rows only. `field_group_key` is a validated plain string rather than an FK
(field groups are code, not rows), so there is no constraint to alter and
nothing to do to the table itself. A grant naming a key the code no longer
declares would be inert rather than dangerous; it is deleted so that
`/access-modes` and the seed agree with `FIELD_GROUPS`.
"""

import sqlalchemy as sa

from alembic import op

revision = "q3s4sysinfo"
down_revision = "p2g3guestsafe"
branch_labels = None
depends_on = None

_GONE = ("credits", "system_info")


def upgrade():
    op.execute(
        sa.text(
            "DELETE FROM access_mode_field_group "
            "WHERE field_group_key IN ('credits', 'system_info')"
        )
    )


def downgrade():
    """Give both keys back to every mode.

    Widest rather than exact: which modes carried which key is not recorded
    anywhere after the delete, and the seeded four all carried both, so this
    restores the shape a seeded installation had. A downgrade that guessed
    narrower would hide fields an account used to see.
    """
    for key in _GONE:
        op.execute(
            sa.text(
                "INSERT INTO access_mode_field_group (mode_id, field_group_key) "
                "SELECT system_id, :key FROM access_mode "
                "ON CONFLICT DO NOTHING"
            ).bindparams(key=key)
        )
