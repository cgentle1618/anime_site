"""add watch_order_list.auto_source

Revision ID: x7y8z9a0b1c2
Revises: w6x7y8z9a0b1
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'x7y8z9a0b1c2'
down_revision: Union[str, Sequence[str], None] = 'w6x7y8z9a0b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    Marks a list whose steps are generated rather than stored. 'release' means
    the steps are computed from the entries' release dates on every read, so a
    newly added entry appears without anyone regenerating anything; such a list
    has no watch_order_item rows at all. NULL means an ordinary hand-built list.
    """
    op.add_column(
        "watch_order_list", sa.Column("auto_source", sa.String(), nullable=True)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("watch_order_list", "auto_source")
