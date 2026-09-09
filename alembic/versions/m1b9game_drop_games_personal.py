"""Drop games' personal columns; user_media_list holds them now.

Revision ID: m1b9game
Revises: m1b8comic

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1b9game"
down_revision: Union[str, Sequence[str], None] = "m1b8comic"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM games e "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = e.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} games rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("games", "playing_status")
    op.drop_column("games", "my_rating")
    op.drop_column("games", "completed_at")


def downgrade() -> None:
    op.add_column("games", sa.Column("playing_status", sa.String(), nullable=True))
    op.add_column("games", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("games", sa.Column("completed_at", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE games e SET
            playing_status = l.status,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = e.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE games SET playing_status = 'Might Play' "
        "WHERE playing_status IS NULL"
    )
    op.alter_column("games", "playing_status", nullable=False)
