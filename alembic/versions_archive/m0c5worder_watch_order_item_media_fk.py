"""watch_order_item addresses its entry by a real media FK, CASCADE on delete

Revision ID: m0c5worder
Revises: m0c4quote
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m0c5worder"
down_revision: Union[str, Sequence[str], None] = "m0c4quote"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    CASCADE, unlike quote's SET NULL, and for the opposite reason.

    A step is almost pure pointer: ep_start, ep_end, position and section_id
    only mean anything relative to an entry. A step left behind with nothing to
    point at is a blank row in a curated list, so the entry's delete takes it.
    Pre-existing orphans are a different case and are NOT deleted here - a
    migration must not quietly shorten a hand-built watch order - so they are
    left unattached, which the column already allows.
    """
    op.add_column(
        "watch_order_item",
        sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    # media.system_id equals the old entry_id: the Phase A backfill reused each
    # detail row's existing UUID, so this is a rename with a check.
    op.execute("""
        UPDATE watch_order_item i
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = i.entry_id AND m.media_type = i.media_type
    """)

    stranded = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM watch_order_item "
            "WHERE entry_id IS NOT NULL AND media_id IS NULL"
        )
    ).scalar_one()
    if stranded:
        print(
            f"m0c5worder: {stranded} watch order steps referenced a missing "
            "entry; left unattached rather than deleted"
        )

    op.create_foreign_key(
        "fk_watch_order_item_media", "watch_order_item", "media",
        ["media_id"], ["system_id"], ondelete="CASCADE",
    )
    op.create_index("ix_watch_order_item_media_id", "watch_order_item", ["media_id"])

    op.drop_index("ix_watch_order_item_entry_id", table_name="watch_order_item")
    op.drop_column("watch_order_item", "media_type")
    op.drop_column("watch_order_item", "entry_id")


def downgrade() -> None:
    op.add_column(
        "watch_order_item", sa.Column("media_type", sa.String(), nullable=True)
    )
    op.add_column(
        "watch_order_item",
        sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute("""
        UPDATE watch_order_item i
        SET entry_id = m.system_id, media_type = m.media_type
        FROM media m
        WHERE m.system_id = i.media_id
    """)
    op.create_index("ix_watch_order_item_entry_id", "watch_order_item", ["entry_id"])

    op.drop_index("ix_watch_order_item_media_id", table_name="watch_order_item")
    op.drop_constraint(
        "fk_watch_order_item_media", "watch_order_item", type_="foreignkey"
    )
    op.drop_column("watch_order_item", "media_id")
