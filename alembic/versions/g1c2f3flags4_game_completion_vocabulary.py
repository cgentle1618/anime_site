"""game completion axes become a vocabulary with an Inapplicable state

Revision ID: g1c2f3flags4
Revises: al1n2ilist
Create Date: 2026-09-13

games.all_endings / all_achievements / all_collected were nullable booleans,
which can hold three states and needed four. "Inapplicable" - the game ships no
endings, publishes no achievements, hides no collectibles - is an answer about
the game, and it is not the same claim as NULL, which is only "not recorded
yet". So the columns carry GAME_COMPLETION_FLAGS and NULL keeps its meaning.

The data step rides on the cast rather than a separate UPDATE, so this revision
imports nothing from app.models: a data migration that selects through a live
model breaks the moment a later revision adds a column the model does not yet
declare. CASE with no ELSE leaves NULL as NULL, which is the whole point.

games.steam_progress_sync is deliberately untouched. It reads as a lock on
Steam writes (autofill.py tests it with `is False`) rather than as a completion
axis, and it has no use for a fourth state.

The downgrade is lossy in one direction only, and unavoidably: 'Inapplicable'
has no boolean to land on, so it becomes NULL - back to "not recorded", which
is the honest answer once the column can no longer express it.
"""

import sqlalchemy as sa
from alembic import op

revision = "g1c2f3flags4"
down_revision = "al1n2ilist"
branch_labels = None
depends_on = None

COLUMNS = ("all_endings", "all_achievements", "all_collected")


def upgrade():
    for column in COLUMNS:
        op.alter_column(
            "games",
            column,
            existing_type=sa.Boolean(),
            type_=sa.String(),
            existing_nullable=True,
            postgresql_using=(
                f"CASE {column} WHEN true THEN 'Yes' WHEN false THEN 'No' END"
            ),
        )


def downgrade():
    for column in COLUMNS:
        op.alter_column(
            "games",
            column,
            existing_type=sa.String(),
            type_=sa.Boolean(),
            existing_nullable=True,
            postgresql_using=(
                f"CASE {column} WHEN 'Yes' THEN true WHEN 'No' THEN false END"
            ),
        )
