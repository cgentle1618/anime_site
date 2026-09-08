"""drop the per-entry watch_order column

Revision ID: drop_entry_watch_order
Revises: a0b1c2d3e4f5
Create Date: 2026-08-26 00:00:00.000000

The last of the per-entry ordering columns. Curated ordering now lives in
watch_order_list / watch_order_item, which can hold several orderings per
franchise, span media types, and be reordered by hand - none of which a single
Float on each entry could do. The derivation that filled this column is retired
alongside it.

anime_movies and comics are absent because they never had the column.

Nothing is backfilled into watch_order_item: the values here were produced by
that derivation rather than curated, so carrying them over would import
guesses as if they were decisions. Downgrade restores the columns EMPTY. Run
the Backup pipeline before upgrading if the old values matter.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'drop_entry_watch_order'
down_revision: Union[str, Sequence[str], None] = 'a0b1c2d3e4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


WATCH_ORDER_TABLES = ("anime", "cartoons", "manga", "movies", "tv_shows")


def upgrade() -> None:
    for table in WATCH_ORDER_TABLES:
        op.drop_column(table, "watch_order")


def downgrade() -> None:
    """Restore the columns, empty. Their content is not folded back."""
    for table in WATCH_ORDER_TABLES:
        op.add_column(table, sa.Column("watch_order", sa.Float(), nullable=True))
