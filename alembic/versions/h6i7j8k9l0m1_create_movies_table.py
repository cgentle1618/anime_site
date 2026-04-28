"""create movies table

Revision ID: h6i7j8k9l0m1
Revises: g5h6i7j8k9l0
Create Date: 2026-04-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'h6i7j8k9l0m1'
down_revision: Union[str, Sequence[str], None] = 'g5h6i7j8k9l0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Table already exists in the database; this migration just stamps the revision.
    pass


def downgrade() -> None:
    op.drop_index('ix_movies_system_id', table_name='movies')
    op.drop_table('movies')
