"""give every meme an author

Revision ID: m5a3memeauthor
Revises: m5a2quoteauthor
Create Date: 2026-09-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m5a3memeauthor"
down_revision: Union[str, Sequence[str], None] = "m5a2quoteauthor"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Raw SQL by design - no ORM imports in migrations."""
    op.add_column(
        "meme",
        sa.Column("author_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    bind = op.get_bind()
    admin_id = bind.execute(
        sa.text("SELECT id FROM users WHERE username = :u"), {"u": "admin"}
    ).scalar()
    if admin_id is None:
        raise RuntimeError("no user named 'admin' to attribute existing memes to")

    op.execute(
        sa.text("UPDATE meme SET author_id = :uid WHERE author_id IS NULL").bindparams(
            uid=admin_id
        )
    )

    remaining = bind.execute(
        sa.text("SELECT COUNT(*) FROM meme WHERE author_id IS NULL")
    ).scalar_one()
    if remaining:
        raise RuntimeError(f"{remaining} memes still have no author after backfill")

    op.alter_column("meme", "author_id", nullable=False)
    op.create_index("ix_meme_author_id", "meme", ["author_id"])
    op.create_foreign_key(
        "fk_meme_author", "meme", "users", ["author_id"], ["id"], ondelete="CASCADE"
    )


def downgrade() -> None:
    op.drop_constraint("fk_meme_author", "meme", type_="foreignkey")
    op.drop_index("ix_meme_author_id", table_name="meme")
    op.drop_column("meme", "author_id")
