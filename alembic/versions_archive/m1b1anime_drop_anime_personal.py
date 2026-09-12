"""Drop anime's five personal columns; user_media_list holds them now.

Revision ID: m1b1anime
Revises: m1a2umbackfill
Create Date: 2026-09-09 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1b1anime"
down_revision: Union[str, Sequence[str], None] = "m1a2umbackfill"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Refuse to drop columns whose values were never copied. m1a2umbackfill
    # ran before this and should have written one row per anime; if it did
    # not, dropping now destroys the only copy.
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM anime a "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = a.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} anime rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("anime", "watching_status")
    op.drop_column("anime", "ep_fin")
    op.drop_column("anime", "my_rating")
    op.drop_column("anime", "my_watch_day")
    op.drop_column("anime", "completed_at")


def downgrade() -> None:
    op.add_column("anime", sa.Column("watching_status", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("ep_fin", sa.Integer(), nullable=True))
    op.add_column("anime", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("my_watch_day", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("completed_at", sa.DateTime(), nullable=True))

    # Restore from the admin's rows. ep_fin narrows from double precision back
    # to integer, so it is rounded rather than truncated by the implicit cast.
    op.execute(
        """
        UPDATE anime a SET
            watching_status = l.status,
            ep_fin = l.ep_fin,
            my_rating = l.my_rating,
            my_watch_day = l.my_watch_day,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = a.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE anime SET watching_status = 'Might Watch' "
        "WHERE watching_status IS NULL"
    )
    op.alter_column("anime", "watching_status", nullable=False)
