"""give every note an author

Revision ID: m5a1notescope
Revises: m3b1seasonal
Create Date: 2026-09-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m5a1notescope"
down_revision: Union[str, Sequence[str], None] = "m3b1seasonal"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Raw SQL by design. docs/PROGRESS.md records that data migrations importing
    live ORM models break whenever a later migration adds a column, because the
    model SELECTs every column it currently declares.

    Every existing note is the admin's: there has only ever been one user, so
    catalogue-scope rows are already correct and personal-scope rows become the
    admin's, which they already were.
    """
    op.add_column(
        "note",
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    bind = op.get_bind()
    admin_id = bind.execute(
        sa.text("SELECT id FROM users WHERE username = :u"), {"u": "admin"}
    ).scalar()
    if admin_id is None:
        raise RuntimeError(
            "no user named 'admin' to attribute existing notes to; "
            "create one before running this migration"
        )

    op.execute(
        sa.text("UPDATE note SET author_id = :uid WHERE author_id IS NULL").bindparams(
            uid=admin_id
        )
    )

    remaining = bind.execute(
        sa.text("SELECT COUNT(*) FROM note WHERE author_id IS NULL")
    ).scalar_one()
    if remaining:
        raise RuntimeError(f"{remaining} notes still have no author after backfill")

    op.alter_column("note", "author_id", nullable=False)
    op.create_index("ix_note_author_id", "note", ["author_id"])
    op.create_foreign_key(
        "fk_note_author", "note", "users", ["author_id"], ["id"], ondelete="CASCADE"
    )


def downgrade() -> None:
    op.drop_constraint("fk_note_author", "note", type_="foreignkey")
    op.drop_index("ix_note_author_id", table_name="note")
    op.drop_column("note", "author_id")
