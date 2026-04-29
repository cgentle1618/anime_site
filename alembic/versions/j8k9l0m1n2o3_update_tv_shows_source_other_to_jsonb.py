"""update tv_shows source_other to jsonb and drop source_other_link

Revision ID: j8k9l0m1n2o3
Revises: 6909a0163ef5
Create Date: 2026-04-29 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "j8k9l0m1n2o3"
down_revision: Union[str, Sequence[str], None] = "c78fa567ff9a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "tv_shows",
        "source_other",
        existing_type=sa.VARCHAR(),
        type_=postgresql.JSONB(astext_type=sa.Text()),
        nullable=True,
        postgresql_using="CASE WHEN source_other IS NULL THEN NULL ELSE to_jsonb(source_other) END",
    )
    op.drop_column("tv_shows", "source_other_link")


def downgrade() -> None:
    op.add_column(
        "tv_shows",
        sa.Column(
            "source_other_link", sa.VARCHAR(), autoincrement=False, nullable=True
        ),
    )
    op.alter_column(
        "tv_shows",
        "source_other",
        existing_type=postgresql.JSONB(astext_type=sa.Text()),
        type_=sa.VARCHAR(),
        nullable=True,
        postgresql_using="source_other::text",
    )
