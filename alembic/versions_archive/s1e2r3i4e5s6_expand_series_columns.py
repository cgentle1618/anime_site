"""expand series with franchise-style columns

Revision ID: s1e2r3i4e5s6
Revises: note_drop_jsonb
Create Date: 2026-08-23 12:00:00.000000

Brings Series up to Franchise's shape: two more name fields, rating,
expectation, a cover pointer, a rewatch flag, and timestamps. Deliberately
omits franchise_type, collection_id, type_covers, type_slots and
watch_next_group - see the design doc for why each is excluded.

Server defaults are set on to_rewatch and the timestamps so existing rows
backfill rather than staying NULL. Physical column order does not match the
model's declaration order after this runs; that is fine, since the Sheets
column order is derived from the model, not from the database.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 's1e2r3i4e5s6'
down_revision: Union[str, Sequence[str], None] = 'note_drop_jsonb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('series', sa.Column('series_name_roman', sa.String(), nullable=True))
    op.add_column('series', sa.Column('series_name_jp', sa.String(), nullable=True))
    op.add_column('series', sa.Column('my_rating', sa.String(), nullable=True))
    op.add_column('series', sa.Column('series_expectation', sa.String(), nullable=True, server_default='Low'))
    op.add_column('series', sa.Column('cover_entry_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('series', sa.Column('to_rewatch', sa.Boolean(), nullable=True, server_default=sa.false()))
    op.add_column('series', sa.Column('created_at', sa.DateTime(), nullable=True, server_default=sa.func.now()))
    op.add_column('series', sa.Column('updated_at', sa.DateTime(), nullable=True, server_default=sa.func.now()))


def downgrade() -> None:
    op.drop_column('series', 'updated_at')
    op.drop_column('series', 'created_at')
    op.drop_column('series', 'to_rewatch')
    op.drop_column('series', 'cover_entry_id')
    op.drop_column('series', 'series_expectation')
    op.drop_column('series', 'my_rating')
    op.drop_column('series', 'series_name_jp')
    op.drop_column('series', 'series_name_roman')
