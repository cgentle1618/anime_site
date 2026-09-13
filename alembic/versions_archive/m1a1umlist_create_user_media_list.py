"""Create user_media_list, empty and unreferenced.

Revision ID: m1a1umlist
Revises: m0d3publicid
Create Date: 2026-09-09 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m1a1umlist"
# Step 0's last migration, which dropped public_id from the nine detail tables.
down_revision: Union[str, Sequence[str], None] = "m0d3publicid"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "user_media_list",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("my_watch_day", sa.String(), nullable=True),
        sa.Column("ep_fin", sa.Integer(), nullable=True),
        sa.Column("vol_fin", sa.Float(), nullable=True),
        sa.Column("vol_fin_page", sa.Integer(), nullable=True),
        sa.Column("ch_fin", sa.Float(), nullable=True),
        sa.Column("arc_fin", sa.Float(), nullable=True),
        sa.Column("ch_fin_in_arc", sa.Float(), nullable=True),
        sa.Column("progress_display", sa.String(), nullable=True),
        sa.Column("issue_fin", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_user_media_list_user", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["media_id"], ["media.system_id"],
            name="fk_user_media_list_media", ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "media_id", name="uq_user_media"),
    )
    op.create_index("ix_user_media_list_system_id", "user_media_list", ["system_id"])
    op.create_index(
        "ix_user_media_list_user_status", "user_media_list", ["user_id", "status"]
    )
    op.create_index("ix_user_media_list_media", "user_media_list", ["media_id"])


def downgrade() -> None:
    op.drop_index("ix_user_media_list_media", table_name="user_media_list")
    op.drop_index("ix_user_media_list_user_status", table_name="user_media_list")
    op.drop_index("ix_user_media_list_system_id", table_name="user_media_list")
    op.drop_table("user_media_list")
