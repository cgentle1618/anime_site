"""add media_source

Revision ID: ms1o2u3r4c5e
Revises: su1s2a3g4e5
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "ms1o2u3r4c5e"
down_revision = "su1s2a3g4e5"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "media_source",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(), nullable=False),
        sa.Column("bucket", sa.String(), nullable=False),
        sa.Column("option_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("available", sa.Boolean(), nullable=True),
        sa.Column("url", sa.String(), nullable=True),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(option_id, name) = 1",
            name="ck_media_source_one_target",
        ),
        sa.ForeignKeyConstraint(
            ["option_id"], ["system_option.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index("ix_media_source_system_id", "media_source", ["system_id"])
    op.create_index("ix_media_source_kind", "media_source", ["kind"])
    op.create_index("ix_media_source_bucket", "media_source", ["bucket"])
    op.create_index("ix_media_source_option_id", "media_source", ["option_id"])
    op.create_index(
        "ix_media_source_entry", "media_source", ["media_type", "entry_id"]
    )
    # NULLS NOT DISTINCT is not expressible through sa.UniqueConstraint in this
    # Alembic version, so the index is created by hand.
    op.execute(
        "CREATE UNIQUE INDEX uq_media_source_row ON media_source "
        "(media_type, entry_id, kind, bucket, option_id, name) "
        "NULLS NOT DISTINCT"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS uq_media_source_row")
    op.drop_index("ix_media_source_entry", "media_source")
    op.drop_index("ix_media_source_option_id", "media_source")
    op.drop_index("ix_media_source_bucket", "media_source")
    op.drop_index("ix_media_source_kind", "media_source")
    op.drop_index("ix_media_source_system_id", "media_source")
    op.drop_table("media_source")
