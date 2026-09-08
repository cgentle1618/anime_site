"""add broadcast schedule columns to anime

Revision ID: r1s2t3u4v5w6
Revises: 289f134d3bea
Create Date: 2026-08-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'r1s2t3u4v5w6'
down_revision: Union[str, Sequence[str], None] = '289f134d3bea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('anime', sa.Column('broadcast_day', sa.String(), nullable=True))
    op.add_column('anime', sa.Column('broadcast_time', sa.Time(), nullable=True))
    op.add_column('anime', sa.Column('my_watch_day', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('anime', 'my_watch_day')
    op.drop_column('anime', 'broadcast_time')
    op.drop_column('anime', 'broadcast_day')
