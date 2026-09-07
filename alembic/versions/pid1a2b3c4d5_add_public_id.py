"""Add public_id to every entity with a detail page.

The SPA used to address detail pages by raw UUID. public_id is the short,
per-table sequential id that replaces it in the URL; the UUID stays the join
key. Backfilled in creation order so the numbering matches the order entries
were added. downgrade() drops the column outright, so a later re-upgrade
starts the backfill over from whatever rows exist then - it reproduces the
same numbering only if the row set has not changed since.
"""

from alembic import op
import sqlalchemy as sa

revision = "pid1a2b3c4d5"
down_revision = "pb2m3i4g5r8"
branch_labels = None
depends_on = None

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


def upgrade():
    for table in TABLES:
        seq = f"{table}_public_id_seq"
        # 1. Nullable first: the table already has rows with no value.
        op.add_column(table, sa.Column("public_id", sa.Integer(), nullable=True))
        # 2. Backfill in creation order. created_at is nullable on the entity
        #    tables, so NULLS LAST keeps stamp-less rows at the end instead of
        #    at the front, and system_id breaks ties so the result is stable.
        op.execute(
            f"""
            WITH numbered AS (
                SELECT system_id,
                       ROW_NUMBER() OVER (
                           ORDER BY created_at ASC NULLS LAST, system_id ASC
                       ) AS rn
                  FROM "{table}"
            )
            UPDATE "{table}" AS t
               SET public_id = numbered.rn
              FROM numbered
             WHERE t.system_id = numbered.system_id
            """
        )
        # 3. Sequence, positioned past the backfill. COALESCE covers an empty
        #    table, where max() is NULL and setval would fail.
        op.execute(f'CREATE SEQUENCE "{seq}"')
        op.execute(
            f'SELECT setval(\'"{seq}"\', COALESCE((SELECT MAX(public_id) FROM "{table}"), 0) + 1, false)'
        )
        op.execute(f'ALTER TABLE "{table}" ALTER COLUMN public_id SET DEFAULT nextval(\'"{seq}"\')')
        # 4. Lock it down.
        op.alter_column(table, "public_id", nullable=False)
        op.create_unique_constraint(f"uq_{table}_public_id", table, ["public_id"])


def downgrade():
    for table in TABLES:
        op.drop_constraint(f"uq_{table}_public_id", table, type_="unique")
        op.drop_column(table, "public_id")
        op.execute(f'DROP SEQUENCE IF EXISTS "{table}_public_id_seq"')
