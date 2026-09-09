"""resolve public_id through the supertable

Revision ID: m0d3publicid
Revises: m0d2parents
Create Date: 2026-09-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m0d3publicid"
down_revision: Union[str, Sequence[str], None] = "m0d2parents"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, hyphenated media_type key). The per-table SEQUENCES are deliberately
# NOT dropped: media.public_id is still fed by <table>_public_id_seq, one per
# type, so every existing id - and every SPA URL built from one - is unchanged.
TABLES = (
    ("anime", "anime"),
    ("anime_movies", "anime-movie"),
    ("movies", "movie"),
    ("tv_shows", "tv-show"),
    ("cartoons", "cartoon"),
    ("manga", "manga"),
    ("novel", "novel"),
    ("comic", "comic"),
    ("games", "game"),
)


def upgrade() -> None:
    bind = op.get_bind()
    for table, _key in TABLES:
        stale = bind.execute(
            sa.text(f"""
                SELECT COUNT(*) FROM {table} t
                JOIN media m ON m.system_id = t.system_id
                WHERE t.public_id IS DISTINCT FROM m.public_id
            """)
        ).scalar_one()
        if stale:
            raise RuntimeError(
                f"{table}.public_id: {stale} rows disagree with media. "
                "Refusing to drop the column - reconcile first."
            )

    for table, _key in TABLES:
        op.drop_constraint(f"uq_{table}_public_id", table, type_="unique")
        op.drop_column(table, "public_id")


def downgrade() -> None:
    for table, key in TABLES:
        op.add_column(table, sa.Column("public_id", sa.Integer(), nullable=True))
        op.execute(f"""
            UPDATE {table} t
            SET public_id = m.public_id
            FROM media m
            WHERE m.system_id = t.system_id
        """)
        op.alter_column(table, "public_id", nullable=False)
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT uq_{table}_public_id "
            "UNIQUE (public_id) DEFERRABLE INITIALLY DEFERRED"
        )
        op.execute(
            f"ALTER TABLE {table} ALTER COLUMN public_id "
            f"SET DEFAULT nextval('{table}_public_id_seq')"
        )
