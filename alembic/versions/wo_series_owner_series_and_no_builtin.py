"""watch_order_list.series_id and collection.no_built_in_orders

Revision ID: wo_series_owner
Revises: z9a0b1c2d3e4
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
# A descriptive id, not the sequential pattern: a concurrent session
# picked the same generated id and both files landed in this tree.
revision: str = 'wo_series_owner'
down_revision: Union[str, Sequence[str], None] = 'z9a0b1c2d3e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    A watch order may now belong to a Series as well as a Franchise or a
    Collection, so the single-owner check constraint grows from two columns to
    three. Collections gain an opt-out from built-in orders, for umbrellas like
    迪士尼 whose members are unrelated standalone works.
    """
    op.add_column("watch_order_list", sa.Column("series_id", sa.UUID(), nullable=True))
    op.create_index(
        op.f("ix_watch_order_list_series_id"),
        "watch_order_list",
        ["series_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_watch_order_list_series_id",
        "watch_order_list",
        "series",
        ["series_id"],
        ["system_id"],
        ondelete="CASCADE",
    )

    # Exactly one of the three owners, replacing the two-column version.
    op.drop_constraint(
        "ck_watch_order_list_single_owner", "watch_order_list", type_="check"
    )
    op.create_check_constraint(
        "ck_watch_order_list_single_owner",
        "watch_order_list",
        "(CASE WHEN franchise_id IS NULL THEN 0 ELSE 1 END"
        " + CASE WHEN collection_id IS NULL THEN 0 ELSE 1 END"
        " + CASE WHEN series_id IS NULL THEN 0 ELSE 1 END) = 1",
    )

    op.add_column(
        "collection", sa.Column("no_built_in_orders", sa.Boolean(), nullable=True)
    )
    op.execute(
        "UPDATE collection SET no_built_in_orders = false "
        "WHERE no_built_in_orders IS NULL"
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("collection", "no_built_in_orders")

    op.drop_constraint(
        "ck_watch_order_list_single_owner", "watch_order_list", type_="check"
    )
    # Series-owned rows cannot satisfy the two-column constraint.
    op.execute("DELETE FROM watch_order_list WHERE series_id IS NOT NULL")
    op.create_check_constraint(
        "ck_watch_order_list_single_owner",
        "watch_order_list",
        "(franchise_id IS NULL) <> (collection_id IS NULL)",
    )

    op.drop_constraint(
        "fk_watch_order_list_series_id", "watch_order_list", type_="foreignkey"
    )
    op.drop_index(
        op.f("ix_watch_order_list_series_id"), table_name="watch_order_list"
    )
    op.drop_column("watch_order_list", "series_id")
