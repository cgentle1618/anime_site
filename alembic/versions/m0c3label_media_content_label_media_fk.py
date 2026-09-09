"""media_content_label addresses its entry by a real media FK

Revision ID: m0c3label
Revises: m0c2credit
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m0c3label"
down_revision: Union[str, Sequence[str], None] = "m0c2credit"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "media_content_label",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # media.system_id equals the old entry_id: the Phase A backfill reused each
    # detail row's existing UUID, so this is a rename with a check.
    op.execute("""
        UPDATE media_content_label l
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = l.entry_id AND m.media_type = l.media_type
    """)

    orphans = op.get_bind().execute(
        sa.text("SELECT COUNT(*) FROM media_content_label WHERE media_id IS NULL")
    ).scalar_one()
    if orphans:
        # A label on an entry that no longer exists. Nothing cleaned these up
        # before - media_content_label had no cleanup path at all - so this is
        # the first time they are collected.
        print(f"m0c3label: deleting {orphans} orphaned media_content_label rows")
        op.execute("DELETE FROM media_content_label WHERE media_id IS NULL")

    op.alter_column("media_content_label", "media_id", nullable=False)
    op.create_foreign_key(
        "fk_media_content_label_media", "media_content_label", "media",
        ["media_id"], ["system_id"], ondelete="CASCADE",
    )

    op.drop_constraint(
        "uq_media_content_label_row", "media_content_label", type_="unique"
    )
    op.drop_index("ix_media_content_label_entry", table_name="media_content_label")
    op.drop_column("media_content_label", "media_type")
    op.drop_column("media_content_label", "entry_id")

    op.create_unique_constraint(
        "uq_media_content_label_row",
        "media_content_label",
        ["media_id", "label_id"],
    )
    op.create_index(
        "ix_media_content_label_entry", "media_content_label", ["media_id"]
    )


def downgrade() -> None:
    op.add_column(
        "media_content_label", sa.Column("media_type", sa.String(), nullable=True)
    )
    op.add_column(
        "media_content_label",
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute("""
        UPDATE media_content_label l
        SET entry_id = m.system_id, media_type = m.media_type
        FROM media m
        WHERE m.system_id = l.media_id
    """)
    op.alter_column("media_content_label", "media_type", nullable=False)
    op.alter_column("media_content_label", "entry_id", nullable=False)

    op.drop_index("ix_media_content_label_entry", table_name="media_content_label")
    op.drop_constraint(
        "uq_media_content_label_row", "media_content_label", type_="unique"
    )
    op.drop_constraint(
        "fk_media_content_label_media", "media_content_label", type_="foreignkey"
    )
    op.drop_column("media_content_label", "media_id")

    op.create_unique_constraint(
        "uq_media_content_label_row",
        "media_content_label",
        ["media_type", "entry_id", "label_id"],
    )
    op.create_index(
        "ix_media_content_label_entry",
        "media_content_label",
        ["media_type", "entry_id"],
    )
