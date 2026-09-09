"""media_source addresses its entry by a real media FK

Revision ID: m0c1source
Revises: m0b1game
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m0c1source"
down_revision: Union[str, Sequence[str], None] = "m0b1game"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "media_source",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # media.system_id equals the old entry_id: the Phase A backfill reused each
    # detail row's existing UUID, so this is a rename with a check.
    op.execute("""
        UPDATE media_source s
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = s.entry_id AND m.media_type = s.media_type
    """)

    orphans = op.get_bind().execute(
        sa.text("SELECT COUNT(*) FROM media_source WHERE media_id IS NULL")
    ).scalar_one()
    if orphans:
        # Rows the old FK-less pair allowed to outlive their entry - exactly
        # what this change exists to prevent. They reference nothing and cannot
        # be migrated.
        print(f"m0c1source: deleting {orphans} orphaned media_source rows")
        op.execute("DELETE FROM media_source WHERE media_id IS NULL")

    op.alter_column("media_source", "media_id", nullable=False)
    op.create_foreign_key(
        "fk_media_source_media", "media_source", "media",
        ["media_id"], ["system_id"], ondelete="CASCADE",
    )

    op.drop_constraint("uq_media_source_row", "media_source", type_="unique")
    op.drop_index("ix_media_source_entry", table_name="media_source")
    op.drop_column("media_source", "media_type")
    op.drop_column("media_source", "entry_id")

    op.execute(
        "ALTER TABLE media_source ADD CONSTRAINT uq_media_source_row "
        "UNIQUE NULLS NOT DISTINCT (media_id, kind, bucket, option_id, name)"
    )
    op.create_index("ix_media_source_entry", "media_source", ["media_id"])


def downgrade() -> None:
    op.add_column(
        "media_source", sa.Column("media_type", sa.String(), nullable=True)
    )
    op.add_column(
        "media_source",
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute("""
        UPDATE media_source s
        SET entry_id = m.system_id, media_type = m.media_type
        FROM media m
        WHERE m.system_id = s.media_id
    """)
    op.alter_column("media_source", "media_type", nullable=False)
    op.alter_column("media_source", "entry_id", nullable=False)

    op.drop_index("ix_media_source_entry", table_name="media_source")
    op.drop_constraint("uq_media_source_row", "media_source", type_="unique")
    op.drop_constraint("fk_media_source_media", "media_source", type_="foreignkey")
    op.drop_column("media_source", "media_id")

    op.execute(
        "ALTER TABLE media_source ADD CONSTRAINT uq_media_source_row "
        "UNIQUE NULLS NOT DISTINCT "
        "(media_type, entry_id, kind, bucket, option_id, name)"
    )
    op.create_index(
        "ix_media_source_entry", "media_source", ["media_type", "entry_id"]
    )
