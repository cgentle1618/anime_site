"""ix_seasonal_seasonal must not be unique

`seasonal` is keyed on (user_id, seasonal): two users hold "WIN 2026"
independently. The revision that made it per-user dropped the old primary key
and the `seasonal_seasonal_key` UNIQUE constraint, but `ix_seasonal_seasonal`
is a unique INDEX rather than a constraint, so on every database built before
the squash it is still UNIQUE on the season string alone. A database created
since is already correct - the baseline declares it `unique=False` - so this
revision is a no-op there and a repair on an installed one.

Until it runs, a second user makes `create_missing_seasonal` unable to insert
its cross product, which fails every pipeline that calculates anime.

Revision ID: s1e2asonalix
Revises: c1image0002
Create Date: 2026-09-13 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op

revision: str = "s1e2asonalix"
down_revision: Union[str, Sequence[str], None] = "c1image0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Recreated rather than altered: PostgreSQL has no ALTER INDEX ... DROP
    # UNIQUE, and the index itself still earns its place - the season string is
    # looked up on its own by the search bucket and by Pull.
    op.execute("DROP INDEX IF EXISTS ix_seasonal_seasonal")
    op.execute("CREATE INDEX ix_seasonal_seasonal ON seasonal (seasonal)")


def downgrade() -> None:
    # Deliberately not reversed. Putting the UNIQUE back would fail outright on
    # any database that has since given a second user their seasons, and the
    # constraint was wrong in the first place; the index this leaves behind is
    # the one the models declare.
    pass
