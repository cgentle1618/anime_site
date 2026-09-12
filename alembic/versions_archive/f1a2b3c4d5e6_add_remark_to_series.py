"""add remark to series

Revision ID: f1a2b3c4d5e6
Revises: ed0b5635fbf5
Create Date: 2026-04-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('series', sa.Column('remark', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('series', 'remark')
