"""Backfill user_media_list from the nine detail tables, all to the admin.

Raw SQL only. Importing app.models here would SELECT every column those models
declare today and break the moment a later migration adds one - the open defect
class recorded in docs/PROGRESS.md.

Revision ID: m1a2umbackfill
Revises: m1a1umlist
Create Date: 2026-09-09 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "m1a2umbackfill"
down_revision: Union[str, Sequence[str], None] = "m1a1umlist"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, status column, extra target columns, extra source expressions).
# The four always-present columns - status, my_rating, completed_at and the
# timestamps - are written for every type; these are the per-type additions.
BACKFILL = [
    ("anime", "watching_status", "my_watch_day, ep_fin", "my_watch_day, ep_fin"),
    ("anime_movies", "watching_status", "", ""),
    ("movies", "watching_status", "", ""),
    ("tv_shows", "watching_status", "ep_fin", "ep_fin"),
    ("cartoons", "watching_status", "ep_fin", "ep_fin"),
    ("manga", "reading_status", "vol_fin, vol_fin_page, ch_fin",
     "vol_fin, vol_fin_page, ch_fin"),
    ("novel", "reading_status",
     "vol_fin, arc_fin, ch_fin, ch_fin_in_arc, progress_display",
     "vol_fin, arc_fin, ch_fin, ch_fin_in_arc, progress_display"),
    ("comic", "reading_status", "issue_fin", "issue_fin"),
    ("games", "playing_status", "", ""),
]


def upgrade() -> None:
    conn = op.get_bind()

    # The lowest-numbered admin by username, so the choice is deterministic on
    # a database that somehow has two. A database with no admin cannot be
    # backfilled and must fail loudly rather than silently skip everyone's data.
    admin_id = conn.execute(
        sa.text(
            "SELECT u.id FROM users u "
            "JOIN role r ON r.system_id = u.role_id "
            "WHERE r.name = 'admin' ORDER BY u.username LIMIT 1"
        )
    ).scalar()
    if admin_id is None:
        raise RuntimeError(
            "No admin user found; user_media_list cannot be backfilled. "
            "Create the admin account first, then re-run this migration."
        )

    for table, status_col, extra_targets, extra_sources in BACKFILL:
        targets = "system_id, user_id, media_id, status, my_rating, completed_at"
        sources = (
            f"gen_random_uuid(), :uid, system_id, {status_col}, my_rating, "
            "completed_at"
        )
        if extra_targets:
            targets = f"{targets}, {extra_targets}"
            sources = f"{sources}, {extra_sources}"
        targets = f"{targets}, created_at, updated_at"
        sources = f"{sources}, COALESCE(created_at, now()), COALESCE(updated_at, now())"
        conn.execute(
            sa.text(
                f"INSERT INTO user_media_list ({targets}) "
                f"SELECT {sources} FROM {table}"
            ).bindparams(uid=admin_id)
        )

    # Every entry must have got exactly one row. A mismatch means a detail
    # table gained or lost rows between Step 0's media backfill and this one,
    # and continuing would silently lose somebody's ratings.
    media_count = conn.execute(sa.text("SELECT count(*) FROM media")).scalar_one()
    list_count = conn.execute(
        sa.text("SELECT count(*) FROM user_media_list")
    ).scalar_one()
    if media_count != list_count:
        raise RuntimeError(
            f"user_media_list backfill wrote {list_count} rows for "
            f"{media_count} media rows; refusing to continue."
        )


def downgrade() -> None:
    # The detail columns still exist at this revision - nothing has been
    # dropped yet - so the rows are pure duplication and can simply go.
    op.execute("DELETE FROM user_media_list")
