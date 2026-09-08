"""rename cover_anime_id to cover_entry_id and add type_covers

Revision ID: k9l0m1n2o3p4
Revises: a3b4c5d6e7f8
Create Date: 2026-05-14 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'k9l0m1n2o3p4'
down_revision: Union[str, Sequence[str], None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Drop FK constraint on cover_anime_id before renaming
    op.drop_constraint('franchise_cover_anime_id_fkey', 'franchise', type_='foreignkey')
    # Rename column cover_anime_id → cover_entry_id
    op.alter_column('franchise', 'cover_anime_id', new_column_name='cover_entry_id')
    # Add type_covers JSONB column
    op.add_column('franchise', sa.Column('type_covers', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('franchise', 'type_covers')
    op.alter_column('franchise', 'cover_entry_id', new_column_name='cover_anime_id')
    op.create_foreign_key('franchise_cover_anime_id_fkey', 'franchise', 'anime', ['cover_anime_id'], ['system_id'], ondelete='SET NULL')
