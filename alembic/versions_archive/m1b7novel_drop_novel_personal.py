"""Drop novel's personal columns; user_media_list holds them now.

Revision ID: m1b7novel
Revises: m1b6manga

novel is the widest of the nine, and the only one where a derivation spans
both kinds of fact - derive_novel_progress split into derive_novel_catalog and
derive_novel_list in the same change.

"""
from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1b7novel"
down_revision: Union[str, Sequence[str], None] = "m1b6manga"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    missing = conn.execute(
        sa.text(
            "SELECT count(*) FROM novel e "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM user_media_list l WHERE l.media_id = e.system_id"
            ")"
        )
    ).scalar_one()
    if missing:
        raise RuntimeError(
            f"{missing} novel rows have no user_media_list row; "
            "run the m1a2umbackfill backfill before dropping these columns."
        )

    op.drop_column("novel", "reading_status")
    op.drop_column("novel", "vol_fin")
    op.drop_column("novel", "arc_fin")
    op.drop_column("novel", "ch_fin")
    op.drop_column("novel", "ch_fin_in_arc")
    op.drop_column("novel", "progress_display")
    op.drop_column("novel", "my_rating")
    op.drop_column("novel", "completed_at")


def downgrade() -> None:
    # The four counters were NOT NULL DEFAULT 0 here and are nullable on the
    # list row, hence the server default plus COALESCE below.
    op.add_column("novel", sa.Column("reading_status", sa.String(), nullable=True))
    for col in ("vol_fin", "arc_fin", "ch_fin", "ch_fin_in_arc"):
        op.add_column(
            "novel",
            sa.Column(col, sa.Float(), nullable=False, server_default="0"),
        )
    op.add_column("novel", sa.Column("progress_display", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("my_rating", sa.String(), nullable=True))
    op.add_column("novel", sa.Column("completed_at", sa.DateTime(), nullable=True))

    op.execute(
        """
        UPDATE novel e SET
            reading_status = l.status,
            vol_fin = COALESCE(l.vol_fin, 0),
            arc_fin = COALESCE(l.arc_fin, 0),
            ch_fin = COALESCE(l.ch_fin, 0),
            ch_fin_in_arc = COALESCE(l.ch_fin_in_arc, 0),
            progress_display = l.progress_display,
            my_rating = l.my_rating,
            completed_at = l.completed_at
        FROM user_media_list l
        JOIN users u ON u.id = l.user_id
        JOIN role r ON r.system_id = u.role_id
        WHERE l.media_id = e.system_id AND r.name = 'admin'
        """
    )
    op.execute(
        "UPDATE novel SET reading_status = 'Might Read' WHERE reading_status IS NULL"
    )
    op.alter_column("novel", "reading_status", nullable=False)
