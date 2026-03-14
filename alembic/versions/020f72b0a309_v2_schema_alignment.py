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
    """Upgrade schema."""
    # 1. COMPREHENSIVE TYPE CONVERSIONS (Fixes "Unknown PG numeric type: 1043")
    # Floats
    op.alter_column(
        "anime_entries",
        "watch_order",
        existing_type=sa.VARCHAR(),
        type_=sa.Float(),
        existing_nullable=True,
        postgresql_using="watch_order::double precision",
    )

    op.alter_column(
        "anime_entries",
        "watch_order_rec",
        existing_type=sa.VARCHAR(),
        type_=sa.Float(),
        existing_nullable=True,
        postgresql_using="watch_order_rec::double precision",
    )

    op.alter_column(
        "anime_entries",
        "mal_rating",
        existing_type=sa.VARCHAR(),
        type_=sa.Float(),
        existing_nullable=True,
        postgresql_using="mal_rating::double precision",
    )

    # Integers
    op.alter_column(
        "anime_entries",
        "ep_total",
        existing_type=sa.VARCHAR(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using="ep_total::integer",
    )

    op.alter_column(
        "anime_entries",
        "ep_fin",
        existing_type=sa.VARCHAR(),
        type_=sa.Integer(),
        existing_nullable=True,
        postgresql_using="ep_fin::integer",
    )

    # Booleans
    op.alter_column(
        "anime_entries",
        "source_baha",
        existing_type=sa.VARCHAR(),
        type_=sa.Boolean(),
        existing_nullable=True,
        postgresql_using="source_baha::boolean",
    )

    op.alter_column(
        "anime_entries",
        "source_netflix",
        existing_type=sa.VARCHAR(),
        type_=sa.Boolean(),
        existing_nullable=True,
        postgresql_using="source_netflix::boolean",
    )

    # 2. DATA CLEANUP (Fixes UniqueViolation: Key (series_en)=(One Piece) is duplicated)
    # This deletes duplicate series rows before we try to apply a UNIQUE constraint.
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

    # 3. INDEX ADJUSTMENTS
    # Use if_exists=True for the drop to ensure a smooth run
    op.drop_index(
        op.f("ix_anime_series_series_en"), table_name="anime_series", if_exists=True
    )
    op.create_index(
        op.f("ix_anime_series_series_en"), "anime_series", ["series_en"], unique=True
    )

    # 4. MISC ALIGNMENTS
    op.alter_column(
        "anime_entries",
        "seiyuu",
        existing_type=sa.TEXT(),
        type_=sa.String(),
        existing_nullable=True,
    )

    op.alter_column(
        "system_options", "category", existing_type=sa.VARCHAR(), nullable=False
    )
    op.alter_column(
        "system_options", "option_value", existing_type=sa.VARCHAR(), nullable=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "system_options", "option_value", existing_type=sa.VARCHAR(), nullable=True
    )
    op.alter_column(
        "system_options", "category", existing_type=sa.VARCHAR(), nullable=True
    )
    op.drop_index(op.f("ix_anime_series_series_en"), table_name="anime_series")
    op.create_index(
        op.f("ix_anime_series_series_en"), "anime_series", ["series_en"], unique=False
    )

    op.alter_column(
        "anime_entries",
        "source_netflix",
        existing_type=sa.Boolean(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )
    op.alter_column(
        "anime_entries",
        "source_baha",
        existing_type=sa.Boolean(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )
    op.alter_column(
        "anime_entries",
        "ep_fin",
        existing_type=sa.Integer(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )
    op.alter_column(
        "anime_entries",
        "ep_total",
        existing_type=sa.Integer(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )
    op.alter_column(
        "anime_entries",
        "mal_rating",
        existing_type=sa.Float(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )
    op.alter_column(
        "anime_entries",
        "watch_order_rec",
        existing_type=sa.Float(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )
    op.alter_column(
        "anime_entries",
        "watch_order",
        existing_type=sa.Float(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
    )
