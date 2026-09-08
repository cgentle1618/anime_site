"""create the media_relation table

Revision ID: media_relation_add
Revises: s1e2r3i4e5s6
Create Date: 2026-08-23 00:00:00.000000

Purely additive: the legacy prequel_id / sequel_id / alternative columns are
dropped in a later revision, once no code reads them. That split means this one
can be applied and verified against real data on its own.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'media_relation_add'
down_revision: Union[str, Sequence[str], None] = 's1e2r3i4e5s6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "media_relation",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("from_type", sa.String(), nullable=False),
        sa.Column("from_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("relation_type", sa.String(), nullable=False),
        sa.Column("to_type", sa.String(), nullable=False),
        sa.Column("to_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.CheckConstraint(
            "NOT (from_type = to_type AND from_id = to_id)",
            name="ck_media_relation_no_self",
        ),
        sa.UniqueConstraint(
            "from_type",
            "from_id",
            "relation_type",
            "to_type",
            "to_id",
            name="uq_media_relation_pair",
        ),
    )
    op.create_index(
        "ix_media_relation_system_id", "media_relation", ["system_id"]
    )
    op.create_index(
        "ix_media_relation_from", "media_relation", ["from_type", "from_id"]
    )
    op.create_index(
        "ix_media_relation_to", "media_relation", ["to_type", "to_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_media_relation_to", table_name="media_relation")
    op.drop_index("ix_media_relation_from", table_name="media_relation")
    op.drop_index("ix_media_relation_system_id", table_name="media_relation")
    op.drop_table("media_relation")
