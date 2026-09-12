"""Add games.metacritic_score and games.metacritic_user_score.

Revision ID: gm1e2t3a4c5
Revises: ga1c2f3l4g5

Metacritic publishes two figures on two scales, so this is two columns rather
than one: the critic metascore is an integer out of 100, the user score a
float out of 10. Neither is derived from the other, and neither replaces
`my_rating`, which stays a personal judgement.

No CHECK on the ranges, matching every other game numeric (`hltb_*`, the
achievement counts, the prices): an out-of-range value here is a typo to
correct, not data that breaks a derivation.

Both are nullable with no backfill, and nothing fills them automatically yet -
they are typed in on Add/Modify. An IGDB `aggregated_rating` autofill would be
a later change and needs no migration of its own.
"""

import sqlalchemy as sa
from alembic import op

revision = "gm1e2t3a4c5"
down_revision = "ga1c2f3l4g5"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("games", sa.Column("metacritic_score", sa.Integer(), nullable=True))
    op.add_column(
        "games", sa.Column("metacritic_user_score", sa.Float(), nullable=True)
    )


def downgrade():
    op.drop_column("games", "metacritic_user_score")
    op.drop_column("games", "metacritic_score")
