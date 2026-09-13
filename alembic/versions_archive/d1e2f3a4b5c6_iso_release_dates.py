"""Convert every media release column to truncated ISO-8601.

Revision ID: d1e2f3a4b5c6
Revises: wo_flat_order

Note: the brief for this migration specified revision id "a1b2c3d4e5f6" with
down_revision "z9a0b1c2d3e4" (the head when the brief was written). Neither
holds by the time this migration was authored: "a1b2c3d4e5f6" collides with
a much older in-chain migration (add_is_main_entry_to_anime), which would
have created a revision cycle, so this migration uses "d1e2f3a4b5c6"
instead. And other work has since landed on this branch (comic table,
note/watch-order tables, etc.), so the real current head is "wo_flat_order"
rather than "z9a0b1c2d3e4" — down_revision points there to keep a single
linear history and to make `alembic upgrade head` actually reach this
revision.
"""

import logging
from typing import Optional, Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.utils.release_date import normalize

revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "wo_flat_order"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.iso_release_dates")

ISO_CHECK = r"^\d{4}(-\d{2}(-\d{2})?)?$"

# Tables whose existing column keeps its name and only needs its values rewritten.
IN_PLACE = [
    ("anime_movies", "release_date_jp"),
    ("anime_movies", "release_date_tw"),
    ("movies", "release_date_usa"),
    ("movies", "release_date_tw"),
    ("tv_shows", "release_date"),
    ("cartoons", "release_date"),
]

# Tables whose year columns are renamed (and, for novel and comic, retyped).
RENAMED = [
    ("manga", "release_year", "release_date", False),
    ("manga", "end_year", "end_date", False),
    ("novel", "release_year", "release_date", True),
    ("novel", "end_year", "end_date", True),
    ("comic", "release_year", "release_date", True),
    ("comic", "end_year", "end_date", True),
]


def merge_anime_release(year: Optional[str], month: Optional[str]) -> Optional[str]:
    """
    Anime's split columns collapsed into one value.

    A year with a recognized month name yields YYYY-MM; a year alone yields
    YYYY. A month with no year is an orphan with no meaningful ISO form, so it
    yields None and the caller logs it.
    """
    if not year:
        return None
    if month:
        merged = normalize(f"{month} {year}")
        if merged:
            return merged
    return normalize(year)


def _log_unparseable(table: str, pk: str, column: str, raw) -> None:
    logger.warning(
        "iso_release_dates: could not parse %s.%s for id=%s, raw=%r — set NULL",
        table, column, pk, raw,
    )


def upgrade() -> None:
    conn = op.get_bind()

    # --- Anime: merge release_year + release_month into release_date --------
    op.add_column("anime", sa.Column("release_date", sa.String(), nullable=True))
    rows = conn.execute(
        sa.text("SELECT system_id, release_year, release_month FROM anime")
    ).fetchall()
    for pk, year, month in rows:
        merged = merge_anime_release(year, month)
        if merged is None and (year or month):
            _log_unparseable("anime", pk, "release_year/release_month", (year, month))
        if merged is not None:
            conn.execute(
                sa.text("UPDATE anime SET release_date = :v WHERE system_id = :id"),
                {"v": merged, "id": pk},
            )
    op.drop_column("anime", "release_year")
    op.drop_column("anime", "release_month")

    # --- In-place rewrites ---------------------------------------------------
    for table, column in IN_PLACE:
        rows = conn.execute(
            sa.text(f"SELECT system_id, {column} FROM {table} WHERE {column} IS NOT NULL")
        ).fetchall()
        for pk, raw in rows:
            converted = normalize(raw)
            if converted is None:
                _log_unparseable(table, pk, column, raw)
            conn.execute(
                sa.text(f"UPDATE {table} SET {column} = :v WHERE system_id = :id"),
                {"v": converted, "id": pk},
            )

    # --- Renames, with a String retype for the Integer columns ---------------
    for table, old, new, was_integer in RENAMED:
        op.add_column(table, sa.Column(new, sa.String(), nullable=True))
        rows = conn.execute(
            sa.text(f"SELECT system_id, {old} FROM {table} WHERE {old} IS NOT NULL")
        ).fetchall()
        for pk, raw in rows:
            converted = normalize(raw)
            if converted is None:
                _log_unparseable(table, pk, old, raw)
            conn.execute(
                sa.text(f"UPDATE {table} SET {new} = :v WHERE system_id = :id"),
                {"v": converted, "id": pk},
            )
        op.drop_column(table, old)

    # --- Constraints, applied only after every value is canonical ------------
    for table, column in [("anime", "release_date")] + IN_PLACE + [
        (t, n) for t, _, n, _ in RENAMED
    ]:
        op.create_check_constraint(
            f"ck_{table}_{column}_iso", table, f"{column} ~ '{ISO_CHECK}'"
        )


def downgrade() -> None:
    """
    Structural reversal only. The original "JUL 2001" spellings are not
    reconstructed — the ISO values are copied back into the old column names
    and types, which is lossless for ordering but changes the text.
    """
    conn = op.get_bind()

    for table, column in [("anime", "release_date")] + IN_PLACE + [
        (t, n) for t, _, n, _ in RENAMED
    ]:
        op.drop_constraint(f"ck_{table}_{column}_iso", table, type_="check")

    for table, old, new, was_integer in RENAMED:
        col_type = sa.Integer() if was_integer else sa.String()
        op.add_column(table, sa.Column(old, col_type, nullable=True))
        cast = "::integer" if was_integer else ""
        conn.execute(
            sa.text(
                f"UPDATE {table} SET {old} = substring({new} from 1 for 4){cast} "
                f"WHERE {new} IS NOT NULL"
            )
        )
        op.drop_column(table, new)

    op.add_column("anime", sa.Column("release_year", sa.String(), nullable=True))
    op.add_column("anime", sa.Column("release_month", sa.String(), nullable=True))
    conn.execute(
        sa.text(
            "UPDATE anime SET release_year = substring(release_date from 1 for 4) "
            "WHERE release_date IS NOT NULL"
        )
    )
    op.drop_column("anime", "release_date")
