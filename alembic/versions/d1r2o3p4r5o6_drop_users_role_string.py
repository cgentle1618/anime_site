"""Make users.role_id required and drop the legacy users.role string.

Revision ID: d1r2o3p4r5o6

WHY NOW AND NOT IN MIGRATION A
------------------------------
Migration A added role_id and backfilled it, but tests/api/conftest.py and
tests/api/test_auth.py construct User(role="admin"), and resolve_viewer falls
back to the string when role_id is NULL. Keeping both readable for two
revisions is what let every phase in between ship without touching those
fixtures. Now that nothing writes the string, the dual source of truth goes.

WHY User.role STILL EXISTS IN PYTHON
------------------------------------
app/routers/auth.py returns it on login and mints it as a JWT claim, and
test_auth asserts on it. Rather than change that contract, `User.role` becomes
a read-only column_property over role.name - exactly the idiom the bottom of
app/models/__init__.py already uses to map `remark` back onto ten models after
its storage moved into `note`. Reads keep working; writes go through role_id.

A row whose role_id is somehow NULL is pinned to guest before the NOT NULL,
which is the safe direction: least access, not most.

Revises: c1o2n3t4e5n6
Create Date: 2026-08-29
"""

import sqlalchemy as sa
from alembic import op

revision = "d1r2o3p4r5o6"
down_revision = "c1o2n3t4e5n6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Anything the migration-A backfill could not match falls to guest.
    op.execute(
        """
        UPDATE users
        SET role_id = (SELECT system_id FROM role WHERE role.name = 'guest')
        WHERE role_id IS NULL
        """
    )
    op.alter_column("users", "role_id", existing_type=sa.dialects.postgresql.UUID(), nullable=False)
    op.drop_column("users", "role")


def downgrade() -> None:
    op.add_column("users", sa.Column("role", sa.String(), nullable=True))
    # Rebuild the string from the role it now points at, so a downgraded
    # database still resolves through the legacy path.
    op.execute(
        """
        UPDATE users
        SET role = (SELECT name FROM role WHERE role.system_id = users.role_id)
        """
    )
    op.alter_column("users", "role_id", existing_type=sa.dialects.postgresql.UUID(), nullable=True)
