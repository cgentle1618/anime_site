"""seasonal: one row per user per season

The four counters and my_rating are per-user facts that were global only
because the database held one person. Existing rows belong to the `admin`
account, the same backfill target m3a1plannext used.

No app.models import (docs/PROGRESS.md, open item): raw SQL throughout.

Revision ID: m3b1seasonal
Revises: m3a2plandrop
Create Date: 2026-09-10 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "m3b1seasonal"
down_revision: Union[str, Sequence[str], None] = "m3a2plandrop"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _owner_id(conn) -> object:
    owner = conn.execute(
        sa.text("SELECT id FROM users WHERE username = 'admin'")
    ).scalar()
    if owner is None:
        owner = conn.execute(
            sa.text("SELECT id FROM users ORDER BY username LIMIT 1")
        ).scalar()
    return owner


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column(
        "seasonal",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )

    row_count = conn.execute(sa.text("SELECT COUNT(*) FROM seasonal")).scalar()
    owner = _owner_id(conn)
    if owner is None and row_count:
        raise RuntimeError(
            "seasonal holds rows but the users table is empty; cannot decide "
            "whose seasons these are."
        )
    if owner is not None:
        conn.execute(
            sa.text("UPDATE seasonal SET user_id = :owner WHERE user_id IS NULL"),
            {"owner": owner},
        )

    op.alter_column("seasonal", "user_id", nullable=False)

    # The old shape: PRIMARY KEY (seasonal), plus the redundant UNIQUE that
    # Column(..., primary_key=True, unique=True, index=True) produced.
    op.execute("ALTER TABLE seasonal DROP CONSTRAINT IF EXISTS seasonal_seasonal_key")
    op.execute("ALTER TABLE seasonal DROP CONSTRAINT seasonal_pkey")
    op.execute(
        "ALTER TABLE seasonal ADD CONSTRAINT pk_seasonal "
        "PRIMARY KEY (user_id, seasonal)"
    )
    op.create_foreign_key(
        "fk_seasonal_user",
        "seasonal",
        "users",
        ["user_id"],
        ["id"],
        ondelete="CASCADE",
    )
    # ix_seasonal_seasonal survives: the season string is still looked up on
    # its own by the search bucket and by Pull.


def downgrade() -> None:
    conn = op.get_bind()
    owner = _owner_id(conn)
    if owner is not None:
        # Only one user's rows can survive a single-column key.
        conn.execute(
            sa.text("DELETE FROM seasonal WHERE user_id <> :owner"),
            {"owner": owner},
        )
    op.drop_constraint("fk_seasonal_user", "seasonal", type_="foreignkey")
    op.execute("ALTER TABLE seasonal DROP CONSTRAINT pk_seasonal")
    op.execute(
        "ALTER TABLE seasonal ADD CONSTRAINT seasonal_pkey PRIMARY KEY (seasonal)"
    )
    op.execute(
        "ALTER TABLE seasonal ADD CONSTRAINT seasonal_seasonal_key UNIQUE (seasonal)"
    )
    op.drop_column("seasonal", "user_id")
