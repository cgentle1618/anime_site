"""media_credit and media_tag address their entry by a real media FK

Revision ID: m0c2credit
Revises: m0c1source
Create Date: 2026-09-08 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m0c2credit"
down_revision: Union[str, Sequence[str], None] = "m0c1source"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, unique constraint name, the columns that follow media_id in it)
TABLES = (
    ("media_credit", "uq_media_credit_row",
     "role, person_id, studio_id, publisher_id"),
    ("media_tag", "uq_media_tag_row", "field, option_id"),
)


def upgrade() -> None:
    for table, unique_name, rest in TABLES:
        op.add_column(
            table,
            sa.Column("media_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        # media.system_id equals the old entry_id: the Phase A backfill reused
        # each detail row's existing UUID, so this is a rename with a check.
        op.execute(f"""
            UPDATE {table} t
            SET media_id = m.system_id
            FROM media m
            WHERE m.system_id = t.entry_id AND m.media_type = t.media_type
        """)

        orphans = op.get_bind().execute(
            sa.text(f"SELECT COUNT(*) FROM {table} WHERE media_id IS NULL")
        ).scalar_one()
        if orphans:
            # Rows the old FK-less pair allowed to outlive their entry.
            print(f"m0c2credit: deleting {orphans} orphaned {table} rows")
            op.execute(f"DELETE FROM {table} WHERE media_id IS NULL")

        op.alter_column(table, "media_id", nullable=False)
        op.create_foreign_key(
            f"fk_{table}_media", table, "media",
            ["media_id"], ["system_id"], ondelete="CASCADE",
        )

        op.drop_constraint(unique_name, table, type_="unique")
        op.drop_index(f"ix_{table}_entry", table_name=table)
        op.drop_column(table, "media_type")
        op.drop_column(table, "entry_id")

        nulls = (
            " NULLS NOT DISTINCT" if table == "media_credit" else ""
        )  # media_tag.option_id is NOT NULL, so it needs no such clause
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {unique_name} "
            f"UNIQUE{nulls} (media_id, {rest})"
        )
        op.create_index(f"ix_{table}_entry", table, ["media_id"])


def downgrade() -> None:
    for table, unique_name, rest in TABLES:
        op.add_column(table, sa.Column("media_type", sa.String(), nullable=True))
        op.add_column(
            table,
            sa.Column("entry_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.execute(f"""
            UPDATE {table} t
            SET entry_id = m.system_id, media_type = m.media_type
            FROM media m
            WHERE m.system_id = t.media_id
        """)
        op.alter_column(table, "media_type", nullable=False)
        op.alter_column(table, "entry_id", nullable=False)

        op.drop_index(f"ix_{table}_entry", table_name=table)
        op.drop_constraint(unique_name, table, type_="unique")
        op.drop_constraint(f"fk_{table}_media", table, type_="foreignkey")
        op.drop_column(table, "media_id")

        nulls = " NULLS NOT DISTINCT" if table == "media_credit" else ""
        op.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {unique_name} "
            f"UNIQUE{nulls} (media_type, entry_id, {rest})"
        )
        op.create_index(f"ix_{table}_entry", table, ["media_type", "entry_id"])
