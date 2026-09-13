"""hold franchise and series links on the supertable

Revision ID: m0d2parents
Revises: m0d1cover
Create Date: 2026-09-09 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m0d2parents"
down_revision: Union[str, Sequence[str], None] = "m0d1cover"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# anime_movies has no series_id and never did: anime movies have no series.
WITH_SERIES = (
    "anime", "movies", "tv_shows", "cartoons", "manga", "novel", "comic", "games",
)
ALL_TABLES = WITH_SERIES + ("anime_movies",)


def upgrade() -> None:
    """
    media.franchise_id / media.series_id were filled by the Phase A backfill and
    have been kept current on every write since, so this drops copies, not
    values. The guard proves that per table before anything is dropped.
    """
    bind = op.get_bind()
    for table in ALL_TABLES:
        columns = ["franchise_id"] + (
            ["series_id"] if table in WITH_SERIES else []
        )
        for column in columns:
            stale = bind.execute(
                sa.text(f"""
                    SELECT COUNT(*) FROM {table} t
                    JOIN media m ON m.system_id = t.system_id
                    WHERE t.{column} IS DISTINCT FROM m.{column}
                """)
            ).scalar_one()
            if stale:
                raise RuntimeError(
                    f"{table}.{column}: {stale} rows disagree with media. "
                    "Refusing to drop the column - reconcile first."
                )

    for table in WITH_SERIES:
        op.drop_column(table, "series_id")
    for table in ALL_TABLES:
        op.drop_column(table, "franchise_id")


def downgrade() -> None:
    for table in ALL_TABLES:
        op.add_column(
            table,
            sa.Column("franchise_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"{table}_franchise_id_fkey", table, "franchise",
            ["franchise_id"], ["system_id"], ondelete="SET NULL",
        )
    for table in WITH_SERIES:
        op.add_column(
            table,
            sa.Column("series_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"{table}_series_id_fkey", table, "series",
            ["series_id"], ["system_id"], ondelete="SET NULL",
        )

    for table in ALL_TABLES:
        columns = ["franchise_id"] + (["series_id"] if table in WITH_SERIES else [])
        assignments = ", ".join(f"{c} = m.{c}" for c in columns)
        op.execute(f"""
            UPDATE {table} t
            SET {assignments}
            FROM media m
            WHERE m.system_id = t.system_id
        """)
