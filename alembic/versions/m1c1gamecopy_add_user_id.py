"""game_copy belongs to a user.

Revision ID: m1c1gamecopy
Revises: m1b9game

A copy row is a purchase record - which storefront, what price, what date -
not a fact about the game, so it gains an owner and uq_game_copy_row widens to
admit two people owning the same edition.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m1c1gamecopy"
down_revision: Union[str, Sequence[str], None] = "m1b9game"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    admin_id = conn.execute(
        sa.text(
            "SELECT u.id FROM users u "
            "JOIN role r ON r.system_id = u.role_id "
            "WHERE r.name = 'admin' ORDER BY u.username LIMIT 1"
        )
    ).scalar()
    if admin_id is None:
        raise RuntimeError(
            "No admin user found; game_copy cannot be assigned an owner."
        )

    op.add_column(
        "game_copy",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    conn.execute(
        sa.text("UPDATE game_copy SET user_id = :uid").bindparams(uid=admin_id)
    )
    op.alter_column("game_copy", "user_id", nullable=False)
    op.create_index("ix_game_copy_user", "game_copy", ["user_id"])
    op.create_foreign_key(
        "fk_game_copy_user", "game_copy", "users",
        ["user_id"], ["id"], ondelete="CASCADE",
    )

    # Widen the natural key. Dropped as a constraint and rebuilt the same way:
    # this one was created by a UniqueConstraint on the model, not by a raw
    # CREATE UNIQUE INDEX (see m0c1source for the shape that is not).
    op.drop_constraint("uq_game_copy_row", "game_copy", type_="unique")
    op.create_unique_constraint(
        "uq_game_copy_row",
        "game_copy",
        ["user_id", "game_id", "storefront", "copy_format"],
    )


def downgrade() -> None:
    # Narrowing the key can collide if two users own the same edition, so the
    # rows that are not the lowest-username admin's go first - they are the
    # ones that could not have existed before this revision.
    op.execute(
        """
        DELETE FROM game_copy c
        WHERE c.user_id <> (
            SELECT u.id FROM users u
            JOIN role r ON r.system_id = u.role_id
            WHERE r.name = 'admin' ORDER BY u.username LIMIT 1
        )
        """
    )
    op.drop_constraint("uq_game_copy_row", "game_copy", type_="unique")
    op.create_unique_constraint(
        "uq_game_copy_row", "game_copy", ["game_id", "storefront", "copy_format"]
    )
    op.drop_constraint("fk_game_copy_user", "game_copy", type_="foreignkey")
    op.drop_index("ix_game_copy_user", table_name="game_copy")
    op.drop_column("game_copy", "user_id")
