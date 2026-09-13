"""Drop movies' personal columns; user_media_list holds them now.

Revision ID: m1b3movie
Revises: m1b2animemovie

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1b3movie"
down_revision: Union[str, Sequence[str], None] = "m1b2animemovie"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM movies m "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = m.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} movies rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("movies", "watching_status")
    op.drop_column("movies", "my_rating")
    op.drop_column("movies", "completed_at")


def downgrade() -> None:
    op.add_column("movies", sa.Column("watching_status", sa.String(), nullable=True))
    op.add_column("movies", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("movies", sa.Column("completed_at", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE movies m SET
            watching_status = l.status,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = m.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE movies SET watching_status = 'Might Watch' "
        "WHERE watching_status IS NULL"
    )
    op.alter_column("movies", "watching_status", nullable=False)
