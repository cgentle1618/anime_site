"""add comicvine_id and comicvine_link to comic

Revision ID: cv1d2e3f4a5b
Revises: drop_entry_watch_order
Create Date: 2026-08-27

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'cv1d2e3f4a5b'
down_revision: Union[str, Sequence[str], None] = 'drop_entry_watch_order'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('comic', sa.Column('comicvine_id', sa.Integer(), nullable=True))
    op.add_column('comic', sa.Column('comicvine_link', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('comic', 'comicvine_link')
    op.drop_column('comic', 'comicvine_id')
