"""Drop manga's personal columns; user_media_list holds them now.

Revision ID: m1b6manga
Revises: m1b5cartoon

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1b6manga"
down_revision: Union[str, Sequence[str], None] = "m1b5cartoon"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM manga e "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = e.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} manga rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("manga", "reading_status")
    op.drop_column("manga", "vol_fin")
    op.drop_column("manga", "vol_fin_page")
    op.drop_column("manga", "ch_fin")
    op.drop_column("manga", "my_rating")
    op.drop_column("manga", "completed_at")


def downgrade() -> None:
    # The three counters were Integer NOT NULL DEFAULT 0 here and are nullable
    # on the list row, so they come back with the same server default and a
    # COALESCE below rather than as plain nullable columns.
    op.add_column("manga", sa.Column("reading_status", sa.String(), nullable=True))
    op.add_column(
        "manga",
        sa.Column("vol_fin", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "manga",
        sa.Column("vol_fin_page", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "manga",
        sa.Column("ch_fin", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("manga", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("manga", sa.Column("completed_at", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE manga e SET
            reading_status = l.status,
            vol_fin = COALESCE(l.vol_fin, 0),
            vol_fin_page = COALESCE(l.vol_fin_page, 0),
            ch_fin = COALESCE(l.ch_fin, 0),
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = e.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE manga SET reading_status = 'Might Read' WHERE reading_status IS NULL"
    )
    op.alter_column("manga", "reading_status", nullable=False)
