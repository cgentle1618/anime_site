"""auto_v2_schema

Revision ID: e414479e29e4
Revises: bffcb0b70269
Create Date: 2026-03-14 11:22:55.657578

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e414479e29e4'
down_revision: Union[str, Sequence[str], None] = 'bffcb0b70269'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
