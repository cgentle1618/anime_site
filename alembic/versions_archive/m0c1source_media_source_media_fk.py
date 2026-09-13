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


def drop_uniqueness(bind, table: str, name: str) -> None:
    """Drop `name` off `table` whether it is a table CONSTRAINT or a bare INDEX.

    `uq_media_source_row` has two shapes in the wild. `ms1o2u3r4c5e` created it
    with raw `CREATE UNIQUE INDEX` (NULLS NOT DISTINCT was not expressible as a
    `sa.UniqueConstraint` then), so every database built by the migration chain
    holds an index. A database built by `Base.metadata.create_all` -- or one
    that has cycled down and back up through this revision -- holds a real
    constraint instead, because `app.models.MediaSource` declares one.

    `ALTER TABLE ... DROP CONSTRAINT` cannot remove an index, which is how the
    index-shaped databases died here. Issue both drops: in Postgres, dropping a
    constraint takes its backing index with it, so the second statement is a
    no-op in that case, and `IF EXISTS` makes each harmless when absent.
    """
    bind.execute(sa.text(f"ALTER TABLE {table} DROP CONSTRAINT IF EXISTS {name}"))
    bind.execute(sa.text(f"DROP INDEX IF EXISTS {name}"))


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

    drop_uniqueness(op.get_bind(), "media_source", "uq_media_source_row")
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
    drop_uniqueness(op.get_bind(), "media_source", "uq_media_source_row")
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
