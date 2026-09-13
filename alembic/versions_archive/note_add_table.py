"""add note table

Revision ID: note_add_table
Revises: wo_series_owner
Create Date: 2026-08-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'note_add_table'
down_revision: Union[str, Sequence[str], None] = 'wo_series_owner'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create the note table.

    Schema only - this revision moves no data. The backfill out of the seven
    `notes` JSONB columns is a separate revision, so the table can be created
    and exercised before any existing content depends on it.

    owner_id has no foreign key on purpose: it points at whichever of the ten
    owner tables owner_type names, and no single FK can span them.

    Column order is deliberate - format_model_for_sheet walks
    __table__.columns in declaration order, so it is also the Sheets order.
    """
    op.create_table(
        "note",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("owner_type", sa.String(), nullable=True),
        sa.Column("owner_id", sa.UUID(), nullable=True),
        sa.Column("section", sa.String(), nullable=True),
        sa.Column("episode", sa.String(), nullable=True),
        sa.Column("kind", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("links", postgresql.JSONB(), nullable=True),
        sa.Column("sort_index", sa.Float(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(op.f("ix_note_system_id"), "note", ["system_id"])
    op.create_index(op.f("ix_note_owner_type"), "note", ["owner_type"])
    op.create_index(op.f("ix_note_owner_id"), "note", ["owner_id"])
    op.create_index(op.f("ix_note_section"), "note", ["section"])
    op.create_index(
        "ix_note_owner_section", "note", ["owner_type", "owner_id", "section"]
    )


def downgrade() -> None:
    """Drop the note table."""
    op.drop_index("ix_note_owner_section", table_name="note")
    op.drop_index(op.f("ix_note_section"), table_name="note")
    op.drop_index(op.f("ix_note_owner_id"), table_name="note")
    op.drop_index(op.f("ix_note_owner_type"), table_name="note")
    op.drop_index(op.f("ix_note_system_id"), table_name="note")
    op.drop_table("note")
