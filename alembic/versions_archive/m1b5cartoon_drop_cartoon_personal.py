"""Drop cartoons' personal columns; user_media_list holds them now.

Revision ID: m1b5cartoon
Revises: m1b4tvshow

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1b5cartoon"
down_revision: Union[str, Sequence[str], None] = "m1b4tvshow"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM cartoons e "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = e.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} cartoons rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("cartoons", "watching_status")
    op.drop_column("cartoons", "ep_fin")
    op.drop_column("cartoons", "my_rating")
    op.drop_column("cartoons", "completed_at")


def downgrade() -> None:
    op.add_column("cartoons", sa.Column("watching_status", sa.String(), nullable=True))
    op.add_column("cartoons", sa.Column("ep_fin", sa.Integer(), nullable=True))
    op.add_column("cartoons", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("cartoons", sa.Column("completed_at", sa.DateTime(), nullable=True))

    # ep_fin narrows from double precision back to integer, so it is rounded
    # rather than truncated by the implicit cast.
    op.execute(
        """
        UPDATE cartoons e SET
            watching_status = l.status,
            ep_fin = l.ep_fin,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = e.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE cartoons SET watching_status = 'Might Watch' "
        "WHERE watching_status IS NULL"
    )
    op.alter_column("cartoons", "watching_status", nullable=False)
