"""add watch_order_section tier and watch_order_item.section_id

Adds the optional grouping tier between a watch order and its steps. Modelled
on collection -> franchise: the section owns its identity and ordering, and an
item points at it with SET NULL so dropping a section leaves its steps in the
list rather than deleting them.

Backward compatible by construction. Every existing item gets section_id NULL,
and unsectioned items sort ahead of sections by the read-time rule, so lists
authored before this revision order by item position exactly as before.

Revision ID: ws1e2c3t4i5n
Revises: i1n2s3e4r5t6
Create Date: 2026-08-28
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "ws1e2c3t4i5n"
down_revision = "i1n2s3e4r5t6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "watch_order_section",
        sa.Column(
            "system_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column(
            "list_id",
            postgresql.UUID(as_uuid=True),
            nullable=False,
        ),
        sa.Column("position", sa.Float(), nullable=True),
        sa.Column("section_name", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(
            ["list_id"],
            ["watch_order_list.system_id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(
        op.f("ix_watch_order_section_system_id"),
        "watch_order_section",
        ["system_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_watch_order_section_list_id"),
        "watch_order_section",
        ["list_id"],
        unique=False,
    )

    op.add_column(
        "watch_order_item",
        sa.Column("section_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_index(
        op.f("ix_watch_order_item_section_id"),
        "watch_order_item",
        ["section_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_watch_order_item_section_id",
        "watch_order_item",
        "watch_order_section",
        ["section_id"],
        ["system_id"],
        ondelete="SET NULL",
    )


def downgrade():
    op.drop_constraint(
        "fk_watch_order_item_section_id", "watch_order_item", type_="foreignkey"
    )
    op.drop_index(op.f("ix_watch_order_item_section_id"), table_name="watch_order_item")
    op.drop_column("watch_order_item", "section_id")

    op.drop_index(
        op.f("ix_watch_order_section_list_id"), table_name="watch_order_section"
    )
    op.drop_index(
        op.f("ix_watch_order_section_system_id"), table_name="watch_order_section"
    )
    op.drop_table("watch_order_section")
