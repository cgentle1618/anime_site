"""a logged-out visitor always gets the safe mode, so the flag is gone

Revision ID: p2g3guestsafe
Revises: o1a1ownerflag
Create Date: 2026-09-12 00:00:00.000000

`access_mode.is_guest_default` made the anonymous policy configurable: an
administrator picked which mode a logged-out visitor resolved to. It is now
the `safe` mode by definition, looked up by key in
services/rbac/modes.py::resolve_mode.

The flag is dropped rather than pinned because it was ordinary data, and the
direction it could drift in is the dangerous one. A Pull All, a hand-edit or a
half-applied migration could move it to `unrestricted`, which publishes every
labelled entry to the anonymous internet - while looking like a successful
restore, and with nothing on any screen reporting that it happened. A constant
in code cannot be moved by a restore.

Dropping a column loses which mode the flag named. That is deliberate and
harmless: it is `safe` on every installation the seeder built, and any other
value was the misconfiguration this migration exists to make unreachable. The
downgrade therefore restores the column and flags `safe`, which is what the
upgrade means, rather than pretending to recover a value it did not keep.
"""

import sqlalchemy as sa

from alembic import op

revision = "p2g3guestsafe"
down_revision = "o1a1ownerflag"
branch_labels = None
depends_on = None


def upgrade():
    # The partial unique index enforced "at most one mode is the anonymous
    # policy". With no column there is no policy row to constrain.
    op.drop_index("ix_one_guest_default_access_mode", table_name="access_mode")
    op.drop_column("access_mode", "is_guest_default")


def downgrade():
    op.add_column(
        "access_mode",
        sa.Column(
            "is_guest_default",
            sa.Boolean(),
            nullable=False,
            server_default="false",
        ),
    )
    # Flag `safe` before creating the index, so the partial unique index is
    # built over a table that already satisfies it.
    op.execute(
        "UPDATE access_mode SET is_guest_default = true WHERE key = 'safe'"
    )
    op.create_index(
        "ix_one_guest_default_access_mode",
        "access_mode",
        [sa.text("(true)")],
        unique=True,
        postgresql_where=sa.text("is_guest_default"),
    )
