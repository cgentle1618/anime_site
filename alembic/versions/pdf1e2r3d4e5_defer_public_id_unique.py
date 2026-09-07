"""Make the public_id unique constraints DEFERRABLE INITIALLY DEFERRED.

Pull restores a whole sheet tab in one transaction and upserts by system_id,
so it can hand row A a public_id that row B still holds until the restore
reaches B. The two machines number their rows independently - a permutation
across the tab is the normal case, not a fault - and an immediately-checked
unique constraint aborts the restore partway through.

Deferring moves the check to COMMIT, where only the end state is inspected.
The constraint is not weakened: a genuinely duplicated public_id still fails,
just at commit rather than at the statement.

Postgres has no ALTER ... ALTER CONSTRAINT for unique constraints, so each one
is dropped and recreated. The backing index goes with it and comes back.
"""

from alembic import op

revision = "pdf1e2r3d4e5"
down_revision = "pb2m3i4g5r8"
branch_labels = None
depends_on = None

# THE SEVENTEEN, as table -> constraint name.
TABLES = (
    "anime",
    "anime_movies",
    "movies",
    "tv_shows",
    "cartoons",
    "manga",
    "novel",
    "comic",
    "games",
    "collection",
    "franchise",
    "series",
    "person",
    "studio",
    "publisher",
    "character",
    "watch_order_list",
)


def upgrade() -> None:
    for table in TABLES:
        name = f"uq_{table}_public_id"
        op.execute(f'ALTER TABLE "{table}" DROP CONSTRAINT "{name}"')
        op.execute(
            f'ALTER TABLE "{table}" ADD CONSTRAINT "{name}" '
            f"UNIQUE (public_id) DEFERRABLE INITIALLY DEFERRED"
        )


def downgrade() -> None:
    for table in TABLES:
        name = f"uq_{table}_public_id"
        op.execute(f'ALTER TABLE "{table}" DROP CONSTRAINT "{name}"')
        op.execute(
            f'ALTER TABLE "{table}" ADD CONSTRAINT "{name}" UNIQUE (public_id)'
        )
