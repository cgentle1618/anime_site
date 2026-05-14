"""rename manga distributor_tw to publisher_tw

Revision ID: 26086324ca82
Revises: k9l0m1n2o3p4
Create Date: 2026-05-14 14:52:06.371390

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '26086324ca82'
down_revision: Union[str, Sequence[str], None] = 'k9l0m1n2o3p4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('manga', 'distributor_tw', new_column_name='publisher_tw')


def downgrade() -> None:
    op.alter_column('manga', 'publisher_tw', new_column_name='distributor_tw')
