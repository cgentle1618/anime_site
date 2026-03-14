"""v2_schema_alignment

Revision ID: 020f72b0a309
Revises: 708e4a1a76c5
Create Date: 2026-03-14 19:39:12.620966

"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "020f72b0a309"
down_revision: Union[str, Sequence[str], None] = "708e4a1a76c5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to align with V2 models and fix 1043 errors."""

    # --- 1. ANIME ENTRIES CONVERSIONS ---
    # We use NULLIF(TRIM()) to safely handle empty strings or spaces

    # Floats (Note: watch_order_rec is strictly omitted to stay String/VARCHAR per schemas.py)
    op.alter_column(
        "anime_entries",
        "watch_order",
        type_=sa.Float(),
        postgresql_using="NULLIF(TRIM(watch_order::text), '')::double precision",
    )

    op.alter_column(
        "anime_entries",
        "mal_rating",
        type_=sa.Float(),
        postgresql_using="NULLIF(TRIM(mal_rating::text), '')::double precision",
    )

    # Integers
    for col in ["ep_total", "ep_fin", "mal_id", "mal_rank"]:
        op.alter_column(
            "anime_entries",
            col,
            type_=sa.Integer(),
            postgresql_using=f"NULLIF(TRIM({col}::text), '')::integer",
        )

    # Booleans (Perfectly matching models.py requirements)
    for col in ["source_baha", "source_netflix"]:
        op.alter_column(
            "anime_entries",
            col,
            type_=sa.Boolean(),
            postgresql_using=f"NULLIF(TRIM({col}::text), '')::boolean",
        )

    # --- 2. ANIME SERIES CONVERSIONS ---
    op.alter_column(
        "anime_series",
        "favorite_3x3_slot",
        type_=sa.Integer(),
        postgresql_using="NULLIF(TRIM(favorite_3x3_slot::text), '')::integer",
    )

    # --- 3. DATA CLEANUP & INDEXING ---
    # Fix duplicate series names before creating unique index
    op.execute(
        """
        DELETE FROM anime_series
        WHERE system_id NOT IN (
            SELECT MIN(system_id)
            FROM anime_series
            GROUP BY series_en
        )
    """
    )

    # --- 4. TEXT ALIGNMENTS ---
    op.alter_column(
        "anime_entries",
        "seiyuu",
        existing_type=sa.TEXT(),
        type_=sa.String(),
        existing_nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_anime_series_series_en"), table_name="anime_series")
    op.create_index(
        op.f("ix_anime_series_series_en"), "anime_series", ["series_en"], unique=False
    )

    # Simple revert - does not strictly recreate the exact VARCHAR state of data
    op.alter_column("anime_entries", "watch_order", type_=sa.VARCHAR())
    op.alter_column("anime_entries", "mal_rating", type_=sa.VARCHAR())
    op.alter_column("anime_entries", "ep_total", type_=sa.VARCHAR())
    op.alter_column("anime_entries", "ep_fin", type_=sa.VARCHAR())
    op.alter_column("anime_entries", "mal_id", type_=sa.VARCHAR())
    op.alter_column("anime_entries", "mal_rank", type_=sa.VARCHAR())
    op.alter_column("anime_entries", "source_baha", type_=sa.VARCHAR())
    op.alter_column("anime_entries", "source_netflix", type_=sa.VARCHAR())
    op.alter_column("anime_series", "favorite_3x3_slot", type_=sa.VARCHAR())
