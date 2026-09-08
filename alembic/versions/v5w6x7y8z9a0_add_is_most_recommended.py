"""add watch_order_list.is_most_recommended

Revision ID: v5w6x7y8z9a0
Revises: u4v5w6x7y8z9
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'v5w6x7y8z9a0'
down_revision: Union[str, Sequence[str], None] = 'u4v5w6x7y8z9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Marks the single list to follow when an owner has several recommended ones.
    Distinct from is_default, which only decides what opens first.
    """
    op.add_column(
        "watch_order_list",
        sa.Column("is_most_recommended", sa.Boolean(), nullable=True),
    )
    # Existing rows predate the flag; leaving them NULL would make "no list is
    # the most recommended" indistinguishable from "not set".
    op.execute(
        "UPDATE watch_order_list SET is_most_recommended = false "
        "WHERE is_most_recommended IS NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("watch_order_list", "is_most_recommended")
