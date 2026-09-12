"""image library: uploaded files and their attachments

Revision ID: c1image0001
Revises: al1n2ilist
Create Date: 2026-09-12

Phase 1 of an expand/contract. These tables become the source of truth for
images; `cover_image_file` is kept written-through so every existing reader -
the Sheets formatters, the download pipelines, the orphan checks, the SPA -
is untouched. Phases 2 and 3 are on the roadmap.
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "c1image0001"
down_revision = "al1n2ilist"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "image",
        sa.Column(
            "system_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column("storage_key", sa.String(), nullable=False),
        sa.Column("thumb_key", sa.String(), nullable=True),
        sa.Column("checksum", sa.String(length=64), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=True),
        sa.Column("byte_size", sa.Integer(), nullable=True),
        sa.Column("width", sa.Integer(), nullable=True),
        sa.Column("height", sa.Integer(), nullable=True),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["uploaded_by"], ["users.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_image_system_id", "image", ["system_id"])
    op.create_index("ix_image_checksum", "image", ["checksum"], unique=True)
    op.create_index("ix_image_uploaded_by", "image", ["uploaded_by"])

    op.create_table(
        "image_attachment",
        sa.Column(
            "system_id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column("image_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("owner_type", sa.String(), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(), nullable=False, server_default="cover"),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.ForeignKeyConstraint(
            ["image_id"], ["image.system_id"], ondelete="CASCADE"
        ),
        sa.UniqueConstraint(
            "owner_type",
            "owner_id",
            "role",
            "position",
            name="uq_image_attachment_owner_role_position",
        ),
    )
    op.create_index("ix_image_attachment_system_id", "image_attachment", ["system_id"])
    op.create_index("ix_image_attachment_image_id", "image_attachment", ["image_id"])
    op.create_index("ix_image_attachment_owner_type", "image_attachment", ["owner_type"])
    op.create_index("ix_image_attachment_owner_id", "image_attachment", ["owner_id"])


def downgrade():
    op.drop_table("image_attachment")
    op.drop_table("image")
