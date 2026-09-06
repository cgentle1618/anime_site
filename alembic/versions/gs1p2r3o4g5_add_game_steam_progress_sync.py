"""Add games.steam_progress_sync.

Revision ID: gs1p2r3o4g5
Revises: gm1e2t3a4c5

Whether Steam is the authority for this entry's own progress. It exists for
the game owned on Steam but played elsewhere: 200 hours on a console, 2 on
Steam, and without the lock a Replace run would overwrite 200 with 2.

Tristate like the completion flags, and read the same way: NULL means the
question was never asked, and is treated as "yes" because most games carrying
an appid really are played on Steam. Only an explicit False stops the writes.

It governs `hours_played` and `achievements_earned` and nothing else - prices
and the Metacritic score ignore it, since those are facts about the game
rather than about this collection.

Nullable with no backfill: existing rows mean "never asked", which is true.
"""

import sqlalchemy as sa
from alembic import op

revision = "gs1p2r3o4g5"
down_revision = "gm1e2t3a4c5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "games", sa.Column("steam_progress_sync", sa.Boolean(), nullable=True)
    )


def downgrade():
    op.drop_column("games", "steam_progress_sync")
