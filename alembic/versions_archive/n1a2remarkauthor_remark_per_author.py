"""a remark belongs to its author

Revision ID: n1a2remarkauthor
Revises: n1a1accessmode
Create Date: 2026-09-11 00:00:00.000000

Widens ix_note_one_remark_per_owner from per-owner to per-owner-per-author, so
two accounts may each hold a remark on the same entry and each reads back
their own.

THIS MIGRATION IS HALF OF A CHANGE AND MUST NOT SHIP ALONE. The other half is
the read path: app.services.domain.remark_field.attach_remark, filtered by
author, replacing the class-level `remark` column_property that could not know
who was asking. Relaxing this index while the read still ignores the author
turns a LOUD database refusal into an accepted-then-invisible write - a
data-loss shape rather than a limitation, and strictly worse than doing
neither. They landed in one commit for that reason; keep them together.

DOWNGRADE CAN FAIL, by design. Recreating the narrower index raises if two
accounts already hold a remark on one owner, because that is exactly the state
the narrow index forbids. There is no correct automatic answer - discarding one
account's writing is not a migration's decision to make - so the downgrade
refuses rather than guesses. Delete the surplus rows by hand first:

    SELECT media_id, collection_id, franchise_id, series_id, count(*)
      FROM note WHERE section = 'remark'
     GROUP BY 1,2,3,4 HAVING count(*) > 1;

NULLS NOT DISTINCT is required on both forms: three of the four owner columns
are always NULL, and author_id is NULL on rows written before accounts
existed, so Postgres would otherwise treat every such row as unique and the
index would enforce nothing.
"""

from typing import Sequence, Union

import sqlalchemy as sa

from alembic import op

revision: str = "n1a2remarkauthor"
down_revision: Union[str, Sequence[str], None] = "n1a1accessmode"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

INDEX_NAME = "ix_note_one_remark_per_owner"
OWNER_COLUMNS = ("media_id", "collection_id", "franchise_id", "series_id")


def upgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="note")
    op.create_index(
        INDEX_NAME,
        "note",
        [*OWNER_COLUMNS, "author_id"],
        unique=True,
        postgresql_nulls_not_distinct=True,
        postgresql_where=sa.text("section = 'remark'"),
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="note")
    # Raises if two accounts hold a remark on one owner. See the module
    # docstring: that is deliberate, not a bug to work around.
    op.create_index(
        INDEX_NAME,
        "note",
        list(OWNER_COLUMNS),
        unique=True,
        postgresql_nulls_not_distinct=True,
        postgresql_where=sa.text("section = 'remark'"),
    )
