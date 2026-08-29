"""add plan_next table

Revision ID: b872c435410b
Revises: d1e2f3a4b5c6
Create Date: 2026-08-29 10:34:42.968385

Creates plan_next, adds the size-group maps to franchise and series, backfills
from the eight columns this replaces, then drops them.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'b872c435410b'
down_revision: Union[str, Sequence[str], None] = 'd1e2f3a4b5c6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (physical table name, boolean column name, media_type key)
_ENTRY_SOURCES = [
    ("anime_movies", "watch_next", "anime-movie"),
    ("movies", "watch_next", "movie"),
    ("tv_shows", "watch_next", "tv-show"),
    ("cartoons", "watch_next", "cartoon"),
    ("manga", "read_next", "manga"),
    ("novel", "read_next", "novel"),
    ("comic", "read_next", "comic"),
]


def upgrade() -> None:
    op.create_table(
        "plan_next",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("target_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.UniqueConstraint(
            "scope", "target_id", "media_type", name="uq_plan_next_target"
        ),
    )
    op.create_index("ix_plan_next_system_id", "plan_next", ["system_id"])
    op.create_index("ix_plan_next_type_scope", "plan_next", ["media_type", "scope"])

    for table in ("franchise", "series"):
        op.add_column(
            table,
            sa.Column("size_group_derived", postgresql.JSONB(), nullable=True),
        )
        op.add_column(
            table,
            sa.Column("size_group_manual", postgresql.JSONB(), nullable=True),
        )

    # Backfill entry-scope rows from the seven booleans.
    for table, column, media_type in _ENTRY_SOURCES:
        op.execute(
            f"""
            INSERT INTO plan_next
                (system_id, media_type, scope, target_id, created_at, updated_at)
            SELECT gen_random_uuid(), '{media_type}', 'entry', system_id,
                   NOW(), NOW()
            FROM {table}
            WHERE {column} IS TRUE
            """
        )

    # Backfill franchise-scope anime rows, and carry the old bucket into the
    # manual map - it was always hand-picked, never derived.
    op.execute(
        """
        INSERT INTO plan_next
            (system_id, media_type, scope, target_id, created_at, updated_at)
        SELECT gen_random_uuid(), 'anime', 'franchise', system_id, NOW(), NOW()
        FROM franchise
        WHERE watch_next_group IS NOT NULL AND watch_next_group <> ''
        """
    )
    op.execute(
        """
        UPDATE franchise
        SET size_group_manual = jsonb_build_object('anime', watch_next_group)
        WHERE watch_next_group IS NOT NULL AND watch_next_group <> ''
        """
    )

    for table, column, _ in _ENTRY_SOURCES:
        op.drop_column(table, column)
    op.drop_column("franchise", "watch_next_group")


def downgrade() -> None:
    # Known loss: series-scope rows, non-anime buckets and remarks have nowhere
    # to go in the old shape.
    op.add_column("franchise", sa.Column("watch_next_group", sa.String(), nullable=True))
    for table, column, _ in _ENTRY_SOURCES:
        op.add_column(table, sa.Column(column, sa.Boolean(), nullable=True))

    op.execute(
        """
        UPDATE franchise
        SET watch_next_group = size_group_manual->>'anime'
        WHERE size_group_manual ? 'anime'
        """
    )
    for table, column, media_type in _ENTRY_SOURCES:
        op.execute(
            f"""
            UPDATE {table} SET {column} = TRUE
            WHERE system_id IN (
                SELECT target_id FROM plan_next
                WHERE scope = 'entry' AND media_type = '{media_type}'
            )
            """
        )

    for table in ("franchise", "series"):
        op.drop_column(table, "size_group_manual")
        op.drop_column(table, "size_group_derived")
    op.drop_index("ix_plan_next_type_scope", table_name="plan_next")
    op.drop_index("ix_plan_next_system_id", table_name="plan_next")
    op.drop_table("plan_next")
