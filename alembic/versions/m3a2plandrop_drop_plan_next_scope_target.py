"""plan_next: drop the FK-less (scope, target_id) pair

Contract half of m3a1plannext. Nothing has written these two columns since the
model was rewritten; scope and target_id are read-only properties derived from
whichever owner FK is set.

The downgrade recreates the columns and refills them from the FKs, so a rolled
back database is usable rather than merely well-shaped.

Revision ID: m3a2plandrop
Revises: m3a1plannext
Create Date: 2026-09-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m3a2plandrop"
down_revision: Union[str, Sequence[str], None] = "m3a1plannext"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column("plan_next", "scope")
    op.drop_column("plan_next", "target_id")


def downgrade() -> None:
    op.add_column("plan_next", sa.Column("scope", sa.String(), nullable=True))
    op.add_column(
        "plan_next",
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute(
        "UPDATE plan_next SET scope = 'entry', target_id = media_id "
        "WHERE media_id IS NOT NULL"
    )
    op.execute(
        "UPDATE plan_next SET scope = 'franchise', target_id = franchise_id "
        "WHERE franchise_id IS NOT NULL"
    )
    op.execute(
        "UPDATE plan_next SET scope = 'series', target_id = series_id "
        "WHERE series_id IS NOT NULL"
    )
    op.alter_column("plan_next", "scope", nullable=False)
    op.alter_column("plan_next", "target_id", nullable=False)
