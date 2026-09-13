"""add users.list_is_public, default false

Revision ID: m2a2public
Revises: m2a1users
Create Date: 2026-09-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m2a2public"
down_revision: Union[str, Sequence[str], None] = "m2a1users"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    NOT NULL with a server default, so every existing row - including the
    admin's - becomes private without a backfill statement. Private by default
    is the spec's decision and this is where it is enforced; a nullable column
    would let a NULL mean "unanswered" and every reader would have to decide
    what that meant.
    """
    op.add_column(
        "users",
        sa.Column(
            "list_is_public",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "list_is_public")
