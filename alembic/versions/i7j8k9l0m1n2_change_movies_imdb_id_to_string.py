"""change movies imdb_id from integer to string

Revision ID: i7j8k9l0m1n2
Revises: 676cfee02ccc
Create Date: 2026-04-28 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "i7j8k9l0m1n2"
down_revision: Union[str, Sequence[str], None] = "676cfee02ccc"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Convert existing integer IDs (e.g. 1234567) to canonical IMDb format (e.g. 'tt1234567')
    op.execute(
        "ALTER TABLE movies ALTER COLUMN imdb_id TYPE VARCHAR "
        "USING CASE WHEN imdb_id IS NOT NULL THEN 'tt' || LPAD(imdb_id::text, 7, '0') END"
    )


def downgrade() -> None:
    # Strip 'tt' prefix and leading zeros, cast back to integer
    op.execute(
        "ALTER TABLE movies ALTER COLUMN imdb_id TYPE INTEGER "
        "USING CASE WHEN imdb_id IS NOT NULL THEN NULLIF(regexp_replace(imdb_id, '^tt0*', ''), '')::INTEGER END"
    )
