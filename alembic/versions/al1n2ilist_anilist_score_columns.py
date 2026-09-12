"""anilist score and rank columns

Revision ID: al1n2ilist
Revises: b1n2amealign
Create Date: 2026-09-12

anilist_rating already existed as a hand-typed String and was filled on 0 of
1192 rows, so it is retyped to Integer here rather than left as text: a score
is a number, and this is the only moment the change costs nothing.
"""

import sqlalchemy as sa
from alembic import op

revision = "al1n2ilist"
down_revision = "s1r2rootflag"
branch_labels = None
depends_on = None

TABLES = ("anime", "anime_movies", "manga", "novel")


def upgrade():
    for table in TABLES:
        op.alter_column(
            table,
            "anilist_rating",
            existing_type=sa.String(),
            type_=sa.Integer(),
            existing_nullable=True,
            postgresql_using="anilist_rating::integer",
        )
        op.add_column(table, sa.Column("anilist_rank", sa.Integer(), nullable=True))
        op.add_column(
            table, sa.Column("anilist_popularity_rank", sa.Integer(), nullable=True)
        )


def downgrade():
    for table in TABLES:
        op.drop_column(table, "anilist_popularity_rank")
        op.drop_column(table, "anilist_rank")
        op.alter_column(
            table,
            "anilist_rating",
            existing_type=sa.Integer(),
            type_=sa.String(),
            existing_nullable=True,
        )
