"""Add games.all_achievements and games.all_collected.

Revision ID: ga1c2f3l4g5
Revises: g1a2m3e4s5

`all_endings` gets two siblings. All three are tristate booleans and all three
are orthogonal to `completion_level` and to each other: a main-story run can
see every ending, and a Completionist one can miss a collectible.

`all_achievements` deliberately duplicates what `achievements_earned` /
`achievements_total` could imply. The counts are often unknown (platforms that
publish no achievement list, or a row entered before the numbers were looked
up), so the flag is stored, not derived - nothing writes it from the counts.

Both are nullable with no backfill: existing rows mean "unknown", which is the
truth about them.
"""

import sqlalchemy as sa
from alembic import op

revision = "ga1c2f3l4g5"
down_revision = "g1a2m3e4s5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("games", sa.Column("all_achievements", sa.Boolean(), nullable=True))
    op.add_column("games", sa.Column("all_collected", sa.Boolean(), nullable=True))


def downgrade():
    op.drop_column("games", "all_collected")
    op.drop_column("games", "all_achievements")
