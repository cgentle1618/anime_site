"""add type_slots to franchise

Revision ID: l0m1n2o3p4q5
Revises: 26086324ca82
Create Date: 2026-05-14 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'l0m1n2o3p4q5'
down_revision: Union[str, Sequence[str], None] = '26086324ca82'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('franchise', sa.Column('type_slots', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    # Migrate existing favorite_3x3_slot values into type_slots under the "ACG" key
    op.execute("""
        UPDATE franchise
        SET type_slots = jsonb_build_object('ACG', favorite_3x3_slot)
        WHERE favorite_3x3_slot IS NOT NULL
    """)


def downgrade() -> None:
    op.drop_column('franchise', 'type_slots')
