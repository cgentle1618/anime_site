"""give meme four real owner FKs and drop the FK-less pair

Revision ID: m5b2memefks
Revises: m5b1notefks
Create Date: 2026-09-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m5b2memefks"
down_revision: Union[str, Sequence[str], None] = "m5b1notefks"
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
    join, not a remap. Unlike note, meme has neither a singleton index nor an
    owner_section index to rebuild.
    """
    for name, _target in OWNER_TARGETS:
        op.add_column(
            "meme", sa.Column(name, postgresql.UUID(as_uuid=True), nullable=True)
        )

    op.execute("""
        UPDATE meme n
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = n.owner_id AND m.media_type = n.owner_type
    """)
    op.execute("""
        UPDATE meme n SET collection_id = n.owner_id
        WHERE n.owner_type = 'collection'
          AND EXISTS (SELECT 1 FROM collection c WHERE c.system_id = n.owner_id)
    """)
    op.execute("""
        UPDATE meme n SET franchise_id = n.owner_id
        WHERE n.owner_type = 'franchise'
          AND EXISTS (SELECT 1 FROM franchise f WHERE f.system_id = n.owner_id)
    """)
    op.execute("""
        UPDATE meme n SET series_id = n.owner_id
        WHERE n.owner_type = 'series'
          AND EXISTS (SELECT 1 FROM series s WHERE s.system_id = n.owner_id)
    """)

    bind = op.get_bind()
    orphans = bind.execute(
        sa.text(
            "SELECT COUNT(*) FROM meme "
            "WHERE num_nonnulls(media_id, collection_id, franchise_id, series_id) <> 1"
        )
    ).scalar_one()
    if orphans:
        # Rows the FK-less pair allowed to outlive their owner - exactly what
        # this change exists to prevent. They reference nothing and cannot be
        # migrated, so they go.
        op.execute("""
            DELETE FROM meme
            WHERE num_nonnulls(media_id, collection_id, franchise_id, series_id) <> 1
        """)

    for name, target in OWNER_TARGETS:
        op.create_foreign_key(
            f"fk_meme_{name}",
            "meme",
            target,
            [name],
            ["system_id"],
            ondelete="CASCADE",
        )
        op.create_index(f"ix_meme_{name}", "meme", [name])

    op.create_check_constraint(
        "ck_meme_one_owner",
        "meme",
        "num_nonnulls(media_id, collection_id, franchise_id, series_id) = 1",
    )

    op.execute("DROP INDEX IF EXISTS ix_meme_owner_type")
    op.execute("DROP INDEX IF EXISTS ix_meme_owner_id")
    op.drop_column("meme", "owner_type")
    op.drop_column("meme", "owner_id")


def downgrade() -> None:
    op.add_column("meme", sa.Column("owner_type", sa.String(), nullable=True))
    op.add_column(
        "meme", sa.Column("owner_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.execute("""
        UPDATE meme n SET owner_type = m.media_type, owner_id = m.system_id
        FROM media m WHERE m.system_id = n.media_id
    """)
    op.execute(
        "UPDATE meme SET owner_type = 'collection', owner_id = collection_id "
        "WHERE collection_id IS NOT NULL"
    )
    op.execute(
        "UPDATE meme SET owner_type = 'franchise', owner_id = franchise_id "
        "WHERE franchise_id IS NOT NULL"
    )
    op.execute(
        "UPDATE meme SET owner_type = 'series', owner_id = series_id "
        "WHERE series_id IS NOT NULL"
    )
    op.create_index("ix_meme_owner_type", "meme", ["owner_type"])
    op.create_index("ix_meme_owner_id", "meme", ["owner_id"])
    op.drop_constraint("ck_meme_one_owner", "meme", type_="check")
    for name in OWNER_COLUMNS:
        op.drop_constraint(f"fk_meme_{name}", "meme", type_="foreignkey")
        op.drop_index(f"ix_meme_{name}", table_name="meme")
        op.drop_column("meme", name)
