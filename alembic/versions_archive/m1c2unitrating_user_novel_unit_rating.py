"""novel_unit.my_rating becomes user_novel_unit_rating.

Revision ID: m1c2unitrating
Revises: m1c1gamecopy

A per-unit rating is one reader's opinion of one volume or arc. It cannot go on
user_media_list, which is keyed by media_id, because a unit is a part of an
entry rather than an entry - so it gets its own two-column join table.

"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "m1c2unitrating"
down_revision: Union[str, Sequence[str], None] = "m1c1gamecopy"
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
        raise RuntimeError("No admin user found; unit ratings cannot be assigned.")

    op.create_table(
        "user_novel_unit_rating",
        sa.Column("system_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("unit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"],
            name="fk_user_novel_unit_rating_user", ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["unit_id"], ["novel_unit.system_id"],
            name="fk_user_novel_unit_rating_unit", ondelete="CASCADE",
        ),
        sa.UniqueConstraint("user_id", "unit_id", name="uq_user_novel_unit"),
    )
    op.create_index(
        "ix_user_novel_unit_rating_system_id", "user_novel_unit_rating", ["system_id"]
    )
    op.create_index(
        "ix_user_novel_unit_rating_user", "user_novel_unit_rating", ["user_id"]
    )
    op.create_index(
        "ix_user_novel_unit_rating_unit", "user_novel_unit_rating", ["unit_id"]
    )

    # Only units that actually carry a rating; a null one is nothing to move.
    conn.execute(
        sa.text(
            "INSERT INTO user_novel_unit_rating "
            "(system_id, user_id, unit_id, my_rating, created_at, updated_at) "
            "SELECT gen_random_uuid(), :uid, system_id, my_rating, NOW(), NOW() "
            "FROM novel_unit WHERE my_rating IS NOT NULL AND my_rating <> ''"
        ).bindparams(uid=admin_id)
    )

    op.drop_column("novel_unit", "my_rating")


def downgrade() -> None:
    op.add_column("novel_unit", sa.Column("my_rating", sa.String(), nullable=True))
    op.execute(
        """
        UPDATE novel_unit u SET my_rating = r.my_rating
        FROM user_novel_unit_rating r
        JOIN users us ON us.id = r.user_id
        JOIN role ro ON ro.system_id = us.role_id
        WHERE r.unit_id = u.system_id AND ro.name = 'admin'
        """
    )
    op.drop_index("ix_user_novel_unit_rating_unit", table_name="user_novel_unit_rating")
    op.drop_index("ix_user_novel_unit_rating_user", table_name="user_novel_unit_rating")
    op.drop_index(
        "ix_user_novel_unit_rating_system_id", table_name="user_novel_unit_rating"
    )
    op.drop_table("user_novel_unit_rating")
