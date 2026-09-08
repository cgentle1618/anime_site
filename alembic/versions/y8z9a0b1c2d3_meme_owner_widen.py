"""widen meme's owner from a media entry to any tier

Revision ID: y8z9a0b1c2d3
Revises: x7y8z9a0b1c2
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'y8z9a0b1c2d3'
down_revision: Union[str, Sequence[str], None] = 'x7y8z9a0b1c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    A meme can belong to a series, franchise or collection rather than to a
    single media entry, so its reference is no longer specifically an entry:
    media_type/entry_id become owner_type/owner_id and accept ten values
    instead of seven.

    Renames rather than new columns, because the pair means the same thing -
    only its range widened. `quote` is deliberately untouched: a quote is said
    in a specific work and stays entry-only.
    """
    op.alter_column("meme", "media_type", new_column_name="owner_type")
    op.alter_column("meme", "entry_id", new_column_name="owner_id")

    op.execute("ALTER INDEX ix_meme_media_type RENAME TO ix_meme_owner_type")
    op.execute("ALTER INDEX ix_meme_entry_id RENAME TO ix_meme_owner_id")


def downgrade() -> None:
    """Downgrade schema.

    Memes owned by a tier have no representation in the entry-only shape, so
    they are dropped rather than left pointing at a media table that has no
    such row.
    """
    op.execute(
        "DELETE FROM meme WHERE owner_type IN ('series', 'franchise', 'collection')"
    )

    op.execute("ALTER INDEX ix_meme_owner_type RENAME TO ix_meme_media_type")
    op.execute("ALTER INDEX ix_meme_owner_id RENAME TO ix_meme_entry_id")

    op.alter_column("meme", "owner_type", new_column_name="media_type")
    op.alter_column("meme", "owner_id", new_column_name="entry_id")
