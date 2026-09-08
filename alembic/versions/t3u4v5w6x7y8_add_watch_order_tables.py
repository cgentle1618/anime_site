"""add watch_order_list and watch_order_item tables

Revision ID: t3u4v5w6x7y8
Revises: s2t3u4v5w6x7
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 't3u4v5w6x7y8'
down_revision: Union[str, Sequence[str], None] = 's2t3u4v5w6x7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    watch_order_item.entry_id has no foreign key on purpose: it points at
    whichever of the seven media tables media_type names, and no single FK can
    span them.
    """
    op.create_table(
        "watch_order_list",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("franchise_id", sa.UUID(), nullable=True),
        sa.Column("collection_id", sa.UUID(), nullable=True),
        sa.Column("list_name", sa.String(), nullable=True),
        sa.Column("list_type", sa.String(), nullable=True),
        sa.Column("is_default", sa.Boolean(), nullable=True),
        sa.Column("sort_index", sa.Float(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "(franchise_id IS NULL) <> (collection_id IS NULL)",
            name="ck_watch_order_list_single_owner",
        ),
        sa.ForeignKeyConstraint(
            ["franchise_id"], ["franchise.system_id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["collection_id"], ["collection.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(
        op.f("ix_watch_order_list_system_id"),
        "watch_order_list",
        ["system_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_watch_order_list_franchise_id"),
        "watch_order_list",
        ["franchise_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_watch_order_list_collection_id"),
        "watch_order_list",
        ["collection_id"],
        unique=False,
    )

    op.create_table(
        "watch_order_item",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("list_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.Float(), nullable=True),
        sa.Column("media_type", sa.String(), nullable=True),
        sa.Column("entry_id", sa.UUID(), nullable=True),
        sa.Column("ep_start", sa.Integer(), nullable=True),
        sa.Column("ep_end", sa.Integer(), nullable=True),
        sa.Column("is_optional", sa.Boolean(), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["list_id"], ["watch_order_list.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(
        op.f("ix_watch_order_item_system_id"),
        "watch_order_item",
        ["system_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_watch_order_item_list_id"),
        "watch_order_item",
        ["list_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_watch_order_item_entry_id"),
        "watch_order_item",
        ["entry_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema. Items are dropped before their parent lists."""
    op.drop_index(op.f("ix_watch_order_item_entry_id"), table_name="watch_order_item")
    op.drop_index(op.f("ix_watch_order_item_list_id"), table_name="watch_order_item")
    op.drop_index(op.f("ix_watch_order_item_system_id"), table_name="watch_order_item")
    op.drop_table("watch_order_item")

    op.drop_index(
        op.f("ix_watch_order_list_collection_id"), table_name="watch_order_list"
    )
    op.drop_index(
        op.f("ix_watch_order_list_franchise_id"), table_name="watch_order_list"
    )
    op.drop_index(op.f("ix_watch_order_list_system_id"), table_name="watch_order_list")
    op.drop_table("watch_order_list")
