"""rename note.episode to note.locator

Revision ID: l1o2c3a4t5o6
Revises: n1o2t3e4u5n6
Create Date: 2026-08-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'l1o2c3a4t5o6'
down_revision: Union[str, Sequence[str], None] = 'n1o2t3e4u5n6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    The column never only held episodes. It already carried chapters ("ch 12")
    and ranges ("ep 3-5"), and the sections that use it now reach movies, where
    the anchor is a scene or a timestamp, and questions, where it is the source
    the question came from.

    One column with a per-section label is the right shape for that - a column
    per medium (episode, chapter, scene, timestamp) would be mostly null and
    would cost a migration every time a new medium arrives. So this is a rename,
    not a restructure: same type, same nullability, same position, and the
    section registry supplies the label the way a citation pairs a locator with
    the kind of locator it is.

    A rename moves the Google Sheets header too, so `parse_note_from_sheet`
    accepts the old `episode` header for sheets backed up before this ran.
    """
    op.alter_column("note", "episode", new_column_name="locator")


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("note", "locator", new_column_name="episode")
