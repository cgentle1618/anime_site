"""clean_v2_baseline

Revision ID: 639f52e4acb5
Revises: 2b0220b5a174
Create Date: 2026-03-14 16:13:07.698527

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "639f52e4acb5"
down_revision: Union[str, Sequence[str], None] = "2b0220b5a174"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # We use a CASE statement to explicitly map string values to booleans.
    # 'True', 'true', '1' -> true
    # 'False', 'false', '0', '無', empty, or NULL -> false
    op.alter_column(
        "anime_entries",
        "source_netflix",
        existing_type=sa.VARCHAR(),
        type_=sa.Boolean(),
        existing_nullable=True,
        postgresql_using="""
            CASE 
                WHEN source_netflix IN ('True', 'true', '1', 'YES', 'yes') THEN true 
                ELSE false 
            END
        """,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "anime_entries",
        "source_netflix",
        existing_type=sa.Boolean(),
        type_=sa.VARCHAR(),
        existing_nullable=True,
        postgresql_using="source_netflix::varchar",
    )
