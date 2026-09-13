"""Rename role.is_superuser to role.is_root.

The column is the everything-short-circuit in Viewer.has(), and it is held by
`admin`. "Superuser" is used in this project to mean the `super` ROLE, which is
a different role that holds its permissions by explicit grant and does not have
this flag - so the old name named the wrong role. `is_root` says what the flag
does without borrowing a role name.

ALTER ... RENAME COLUMN, never drop-and-add: the flag decides who may
administer the installation, and a recreated column would default every role to
false and lock the admin out of its own instance until someone noticed.

The `role` table has no Google Sheets tab (roles are rebuilt per database by
ensure_rbac_seed and the Users tab carries only the role NAME), so no sheet
header changes and Backup/Pull are unaffected.

Revision ID: s1r2rootflag
Revises: g1u2i3d4e5s6
"""

from alembic import op

revision = "s1r2rootflag"
down_revision = "g1u2i3d4e5s6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("role", "is_superuser", new_column_name="is_root")


def downgrade() -> None:
    op.alter_column("role", "is_root", new_column_name="is_superuser")
