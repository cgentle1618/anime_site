"""add notes to anime movies

Revision ID: g5h6i7j8k9l0
Revises: fbc168649b9d
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'g5h6i7j8k9l0'
down_revision: Union[str, Sequence[str], None] = 'fbc168649b9d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('anime_movies', sa.Column('notes', postgresql.JSONB(astext_type=sa.Text()), nullable=True))


def downgrade() -> None:
    op.drop_column('anime_movies', 'notes')
