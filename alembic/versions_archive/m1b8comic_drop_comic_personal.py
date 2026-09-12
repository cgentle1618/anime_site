"""Drop comic' personal columns; user_media_list holds them now.

Revision ID: m1b8comic
Revises: m1b7novel

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1b8comic"
down_revision: Union[str, Sequence[str], None] = "m1b7novel"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM comic e "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = e.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} comic rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("comic", "issue_fin")
    op.drop_column("comic", "reading_status")
    op.drop_column("comic", "my_rating")
    op.drop_column("comic", "completed_at")


def downgrade() -> None:
    op.add_column(
        "comic",
        sa.Column("issue_fin", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("comic", sa.Column("reading_status", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("comic", sa.Column("completed_at", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE comic e SET
            issue_fin = COALESCE(l.issue_fin, 0),
            reading_status = l.status,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = e.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE comic SET reading_status = 'Might Read' "
        "WHERE reading_status IS NULL"
    )
    op.alter_column("comic", "reading_status", nullable=False)
