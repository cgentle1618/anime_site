"""add is_main_entry to anime

Revision ID: a1b2c3d4e5f6
Revises: ed0b5635fbf5
Create Date: 2026-04-18 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'ed0b5635fbf5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('anime', sa.Column('is_main_entry', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('anime', 'is_main_entry')
