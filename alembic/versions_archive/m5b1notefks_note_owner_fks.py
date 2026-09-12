"""give note four real owner FKs and drop the FK-less pair

Revision ID: m5b1notefks
Revises: m5a3memeauthor
Create Date: 2026-09-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m5b1notefks"
down_revision: Union[str, Sequence[str], None] = "m5a3memeauthor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OWNER_COLUMNS = ("media_id", "collection_id", "franchise_id", "series_id")

OWNER_TARGETS = (
    ("media_id", "media"),
    ("collection_id", "collection"),
    ("franchise_id", "franchise"),
    ("series_id", "series"),
)


def upgrade() -> None:
    """
    Raw SQL by design - no ORM imports in migrations.

    media.system_id equals the old owner_id for every media owner: Step 0's
    backfill reused each detail row's existing UUID, so this is a rename with a
    join, not a remap.
    """
    for name, _target in OWNER_TARGETS:
        op.add_column(
            "note", sa.Column(name, postgresql.UUID(as_uuid=True), nullable=True)
        )

    op.execute("""
        UPDATE note n
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = n.owner_id AND m.media_type = n.owner_type
    """)
    op.execute("""
        UPDATE note n SET collection_id = n.owner_id
        WHERE n.owner_type = 'collection'
          AND EXISTS (SELECT 1 FROM collection c WHERE c.system_id = n.owner_id)
    """)
    op.execute("""
        UPDATE note n SET franchise_id = n.owner_id
        WHERE n.owner_type = 'franchise'
          AND EXISTS (SELECT 1 FROM franchise f WHERE f.system_id = n.owner_id)
    """)
    op.execute("""
        UPDATE note n SET series_id = n.owner_id
        WHERE n.owner_type = 'series'
          AND EXISTS (SELECT 1 FROM series s WHERE s.system_id = n.owner_id)
    """)

    bind = op.get_bind()
    orphans = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM note "
            "WHERE num_nonnulls(media_id, collection_id, franchise_id, series_id) <> 1"
        )
    ).scalar_one()
    if orphans:
        # Rows the FK-less pair allowed to outlive their owner - exactly what
        # this change exists to prevent. They reference nothing and cannot be
        # migrated, so they go.
        op.execute("""
            DELETE FROM note
            WHERE num_nonnulls(media_id, collection_id, franchise_id, series_id) <> 1
        """)

    for name, target in OWNER_TARGETS:
        op.create_foreign_key(
            f"fk_note_{name}",
            "note",
            target,
            [name],
            ["system_id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_note_{name}", "note", [name])

    op.create_check_constraint(
        "ck_note_one_owner",
        "note",
        "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
    )

    # The remark singleton index and the page's read index both named the old
    # pair, so both are rebuilt on the four columns. NULLS NOT DISTINCT is
    # required: three of the four are always NULL, and Postgres treats NULLs as
    # distinct by default, which would let every owner hold unlimited remarks.
    op.execute("DROP INDEX IF EXISTS ix_note_one_remark_per_owner")
    op.execute("DROP INDEX IF EXISTS ix_note_owner_section")
    op.execute("""
        CREATE UNIQUE INDEX ix_note_one_remark_per_owner
        ON note (media_id, collection_id, franchise_id, series_id)
        NULLS NOT DISTINCT
        WHERE section = 'remark'
    """)
    op.execute("""
        CREATE INDEX ix_note_owner_section
        ON note (media_id, collection_id, franchise_id, series_id, section)
    """)

    op.execute("DROP INDEX IF EXISTS ix_note_owner_type")
    op.execute("DROP INDEX IF EXISTS ix_note_owner_id")
    op.drop_column("note", "owner_type")
    op.drop_column("note", "owner_id")


def downgrade() -> None:
    op.add_column("note", sa.Column("owner_type", sa.String(), nullable=True))
    op.add_column(
        "note", sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.execute("""
        UPDATE note n SET owner_type = m.media_type, owner_id = m.system_id
        FROM media m WHERE m.system_id = n.media_id
    """)
    op.execute(
        "UPDATE note SET owner_type = 'collection', owner_id = collection_id "
        "WHERE collection_id IS NOT NULL"
    )
    op.execute(
        "UPDATE note SET owner_type = 'franchise', owner_id = franchise_id "
        "WHERE franchise_id IS NOT NULL"
    )
    op.execute(
        "UPDATE note SET owner_type = 'series', owner_id = series_id "
        "WHERE series_id IS NOT NULL"
    )
    op.create_index("ix_note_owner_type", "note", ["owner_type"])
    op.create_index("ix_note_owner_id", "note", ["owner_id"])
    op.execute("DROP INDEX IF EXISTS ix_note_one_remark_per_owner")
    op.execute("DROP INDEX IF EXISTS ix_note_owner_section")
    op.execute("""
        CREATE UNIQUE INDEX ix_note_one_remark_per_owner
        ON note (owner_type, owner_id) WHERE section = 'remark'
    """)
    op.execute(
        "CREATE INDEX ix_note_owner_section ON note (owner_type, owner_id, section)"
    )
    op.drop_constraint("ck_note_one_owner", "note", type_="check")
    for name in OWNER_COLUMNS:
        op.drop_constraint(f"fk_note_{name}", "note", type_="foreignkey")
        op.drop_index(f"ix_note_{name}", table_name="note")
        op.drop_column("note", name)
