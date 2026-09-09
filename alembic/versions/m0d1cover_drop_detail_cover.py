"""serve covers from the supertable: drop cover_image_file from the nine tables

Revision ID: m0d1cover
Revises: m0c5worder
Create Date: 2026-09-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m0d1cover"
down_revision: Union[str, Sequence[str], None] = "m0c5worder"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = (
    "anime", "anime_movies", "movies", "tv_shows", "cartoons",
    "manga", "novel", "comic", "games",
)


def upgrade() -> None:
    """
    media.cover_image_file was filled by the Phase A backfill and has been kept
    current on every write since, so this drops a copy, not the value. The
    guard below is what proves that before anything is dropped.
    """
    bind = op.get_bind()
    for table in TABLES:
        stale = bind.execute(
            sa.text(f"""
                SELECT COUNT(*) FROM {table} t
                JOIN media m ON m.system_id = t.system_id
                WHERE t.cover_image_file IS DISTINCT FROM m.cover_image_file
            """)
        ).scalar_one()
        if stale:
            raise RuntimeError(
                f"{table}: {stale} rows whose cover_image_file disagrees with "
                "media. Refusing to drop the column - reconcile first."
            )

    for table in TABLES:
        op.drop_column(table, "cover_image_file")


def downgrade() -> None:
    for table in TABLES:
        op.add_column(
            table, sa.Column("cover_image_file", sa.String(), nullable=True)
        )
        op.execute(f"""
            UPDATE {table} t
            SET cover_image_file = m.cover_image_file
            FROM media m
            WHERE m.system_id = t.system_id
        """)
