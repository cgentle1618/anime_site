"""drop the notes JSONB column from the seven media tables

Revision ID: note_drop_jsonb
Revises: note_backfill_rows
Create Date: 2026-08-23 00:00:00.000000

The content moved to the `note` table in note_backfill_rows. This revision is run
only once that backfill has been verified against real data, because
downgrading restores the columns but not what was in them - the note rows
would have to be folded back by hand.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'note_drop_jsonb'
down_revision: Union[str, Sequence[str], None] = 'note_backfill_rows'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = ("anime", "anime_movies", "movies", "tv_shows", "cartoons", "manga", "novel")


def upgrade() -> None:
    """Drop the notes column now that every row lives in `note`."""
    for table in TABLES:
        op.drop_column(table, "notes")


def downgrade() -> None:
    """Restore the columns, empty.

    Their content is in `note` and is not folded back automatically: the
    expansion was one-to-many and two parts of it are documented as lossy.
    """
    for table in TABLES:
        op.add_column(
            table, sa.Column("notes", postgresql.JSONB(), nullable=True)
        )
