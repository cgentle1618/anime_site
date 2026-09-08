"""drop the legacy prequel/sequel/alternative columns

Revision ID: media_relation_drop_legacy
Revises: media_relation_add
Create Date: 2026-08-23 00:00:00.000000

Relations moved to the `media_relation` table. Nothing is backfilled: the
prequel/sequel values were largely produced by the derivation retired alongside
this change, and were never trusted enough to carry forward.

Downgrade restores the columns EMPTY. Run the Backup pipeline before upgrading
if the old values matter.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'media_relation_drop_legacy'
down_revision: Union[str, Sequence[str], None] = 'media_relation_add'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# anime_movies is absent throughout: it never had relation columns, which is
# exactly one of the limitations media_relation removes.
PAIR_TABLES = ("anime", "cartoons", "manga", "movies", "novel", "tv_shows")
# Novel never had derive_related.
DERIVE_TABLES = ("anime", "cartoons", "manga", "movies", "tv_shows")
ALTERNATIVE_TABLES = ("anime", "novel")


def upgrade() -> None:
    for table in PAIR_TABLES:
        op.drop_column(table, "prequel_id")
        op.drop_column(table, "sequel_id")
    for table in DERIVE_TABLES:
        op.drop_column(table, "derive_related")
    for table in ALTERNATIVE_TABLES:
        op.drop_column(table, "alternative")


def downgrade() -> None:
    """Restore the columns, empty. Their content is not folded back."""
    for table in PAIR_TABLES:
        op.add_column(
            table,
            sa.Column("prequel_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.add_column(
            table,
            sa.Column("sequel_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
    for table in DERIVE_TABLES:
        op.add_column(
            table, sa.Column("derive_related", sa.Boolean(), nullable=True)
        )
    for table in ALTERNATIVE_TABLES:
        op.add_column(table, sa.Column("alternative", sa.String(), nullable=True))
