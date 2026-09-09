"""create the media supertable (empty)

Revision ID: m0a1media
Revises: pdf1e2r3d4e5
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m0a1media"
down_revision: Union[str, Sequence[str], None] = "pdf1e2r3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the table only. Backfill happens per media type, later."""
    op.create_table(
        "media",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("public_id", sa.Integer(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column("cover_image_file", sa.String(), nullable=True),
        sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["franchise_id"], ["franchise.system_id"], ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["series_id"], ["series.system_id"], ondelete="SET NULL"
        ),
        sa.UniqueConstraint("system_id", "media_type", name="uq_media_id_type"),
    )
    op.create_index("ix_media_system_id", "media", ["system_id"])
    op.create_index("ix_media_media_type", "media", ["media_type"])
    op.create_index("ix_media_display_name", "media", ["display_name"])
    # Deferrable uniques cannot be declared inline by create_table's helper in
    # a way that carries DEFERRABLE, so it is added explicitly.
    op.execute(
        "ALTER TABLE media ADD CONSTRAINT uq_media_type_public_id "
        "UNIQUE (media_type, public_id) DEFERRABLE INITIALLY DEFERRED"
    )


def downgrade() -> None:
    op.drop_index("ix_media_display_name", table_name="media")
    op.drop_index("ix_media_media_type", table_name="media")
    op.drop_index("ix_media_system_id", table_name="media")
    op.drop_table("media")
