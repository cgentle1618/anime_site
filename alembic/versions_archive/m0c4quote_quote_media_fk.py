"""quote addresses its entry by a real media FK, SET NULL on delete

Revision ID: m0c4quote
Revises: m0c3label
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m0c4quote"
down_revision: Union[str, Sequence[str], None] = "m0c3label"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    SET NULL, not CASCADE, and the choice is deliberate.

    A quote carries its own content - text, translation, speaker, episode,
    tags - so it still reads perfectly without the work it came from. Deleting
    an entry must not destroy hand-written text. The model used to say the same
    thing by leaving the reference dangling for the resolver to flag; a real FK
    cannot represent "dangling", so the nearest honest thing is an unattached
    quote. "General quote" is a separate explicit flag (quote.is_general), so
    an unattached quote is not mistaken for a deliberate one.
    """
    op.add_column(
        "quote", sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    # media.system_id equals the old entry_id: the Phase A backfill reused each
    # detail row's existing UUID, so this is a rename with a check.
    op.execute("""
        UPDATE quote q
        SET media_id = m.system_id
        FROM media m
        WHERE m.system_id = q.entry_id AND m.media_type = q.media_type
    """)

    stranded = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM quote "
            "WHERE entry_id IS NOT NULL AND media_id IS NULL"
        )
    ).scalar_one()
    if stranded:
        # Quotes whose entry was already gone. Kept, not deleted - the same
        # rule this FK applies from now on.
        print(f"m0c4quote: {stranded} quotes referenced a missing entry; unattached")

    op.create_foreign_key(
        "fk_quote_media", "quote", "media",
        ["media_id"], ["system_id"], ondelete="SET NULL",
    )
    op.create_index("ix_quote_media_id", "quote", ["media_id"])

    op.drop_index("ix_quote_media_type", table_name="quote")
    op.drop_index("ix_quote_entry_id", table_name="quote")
    op.drop_column("quote", "media_type")
    op.drop_column("quote", "entry_id")


def downgrade() -> None:
    op.add_column("quote", sa.Column("media_type", sa.String(), nullable=True))
    op.add_column(
        "quote", sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.execute("""
        UPDATE quote q
        SET entry_id = m.system_id, media_type = m.media_type
        FROM media m
        WHERE m.system_id = q.media_id
    """)
    op.create_index("ix_quote_media_type", "quote", ["media_type"])
    op.create_index("ix_quote_entry_id", "quote", ["entry_id"])

    op.drop_index("ix_quote_media_id", table_name="quote")
    op.drop_constraint("fk_quote_media", "quote", type_="foreignkey")
    op.drop_column("quote", "media_id")
