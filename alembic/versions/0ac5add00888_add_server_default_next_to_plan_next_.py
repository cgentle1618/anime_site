"""add server default next to plan_next kind

Revision ID: 0ac5add00888
Revises: 9b0bcb763e8c
Create Date: 2026-08-29 15:48:47.927423

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '0ac5add00888'
down_revision: Union[str, Sequence[str], None] = '9b0bcb763e8c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # A Pull of a Plan Next tab backed up before `kind` existed carries no such
    # header column, so the ORM builds the row with `kind` unset. SQLAlchemy
    # emits an unset non-nullable column as an explicit NULL unless the model
    # declares a default -- which fails NOT NULL. Declaring server_default on
    # the model makes SQLAlchemy omit the column entirely and lets the database
    # supply it; this migration puts the matching default on the column so the
    # database and the model agree. Every such row predates rewatch, so "next"
    # is the correct value.
    op.alter_column("plan_next", "kind", server_default="next")


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("plan_next", "kind", server_default=None)
