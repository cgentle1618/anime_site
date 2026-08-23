"""replace watch_order_item.is_optional with a three-value importance column

Revision ID: wo_item_importance
Revises: note_add_table
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'wo_item_importance'
down_revision: Union[str, Sequence[str], None] = 'note_add_table'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """A step sits on exactly one rung, so one column replaces the boolean.

    is_optional could only say "optional or not"; the ladder now has three
    rungs. The old flag maps straight onto the bottom one, and everything it
    left unmarked becomes "Normal" - including rows where the flag was NULL,
    which the guide already treated as not-optional.
    """
    op.add_column(
        "watch_order_item",
        sa.Column("importance", sa.String(), nullable=True),
    )
    op.execute(
        "UPDATE watch_order_item"
        " SET importance = CASE WHEN is_optional IS TRUE"
        " THEN 'Optional' ELSE 'Normal' END"
    )
    op.drop_column("watch_order_item", "is_optional")


def downgrade() -> None:
    """Collapses the ladder back to the boolean.

    Lossy by nature: "Essential" and "Normal" both come back as FALSE, since
    the boolean has no rung to put "Essential" on.
    """
    op.add_column(
        "watch_order_item",
        sa.Column("is_optional", sa.Boolean(), nullable=True),
    )
    op.execute(
        "UPDATE watch_order_item"
        " SET is_optional = (importance = 'Optional')"
    )
    op.drop_column("watch_order_item", "importance")
