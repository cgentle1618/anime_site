"""seed the user role and its grants

Revision ID: m2a1users
Revises: m1c2unitrating
Create Date: 2026-09-10 00:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m2a1users"
down_revision: Union[str, Sequence[str], None] = "m1c2unitrating"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """
    Raw SQL, and deliberately NOT a call to ensure_rbac_seed.

    docs/PROGRESS.md records that migrations importing live ORM models break
    whenever a later migration adds a column, because the model SELECTs every
    column it currently declares. Migration A got away with calling the seed;
    this one does not repeat that.

    The grants are copied from whatever the guest role currently holds rather
    than recomputed, so an admin who narrowed guest gets a user role narrowed
    the same way. That is the intent: "the guest read permissions" means this
    installation's guest, not a fresh one's.

    Idempotent: the lifespan's ensure_rbac_seed runs against databases that may
    already have been through this, and must not duplicate anything.
    """
    op.execute("""
        INSERT INTO role (system_id, name, label, description,
                          is_system, is_superuser, sort_order)
        SELECT gen_random_uuid(), 'user', 'User',
               'A signed-in member. Reads what a guest reads, and writes '
               'their own list and their own personal notes.',
               true, false, 50
        WHERE NOT EXISTS (SELECT 1 FROM role WHERE name = 'user')
    """)

    # Guest's reads.
    op.execute("""
        INSERT INTO role_permission (role_id, permission)
        SELECT u.system_id, gp.permission
        FROM role u
        JOIN role g ON g.name = 'guest'
        JOIN role_permission gp ON gp.role_id = g.system_id
        WHERE u.name = 'user'
          AND NOT EXISTS (
              SELECT 1 FROM role_permission x
              WHERE x.role_id = u.system_id AND x.permission = gp.permission
          )
    """)

    # The two writes that make it a user rather than a guest with a password.
    op.execute("""
        INSERT INTO role_permission (role_id, permission)
        SELECT u.system_id, p.permission
        FROM role u
        CROSS JOIN (VALUES ('self.list'), ('self.personal_notes'))
                   AS p(permission)
        WHERE u.name = 'user'
          AND NOT EXISTS (
              SELECT 1 FROM role_permission x
              WHERE x.role_id = u.system_id AND x.permission = p.permission
          )
    """)

    granted = op.get_bind().execute(
        sa.text(
            "SELECT COUNT(*) FROM role_permission rp "
            "JOIN role r ON r.system_id = rp.role_id WHERE r.name = 'user'"
        )
    ).scalar_one()
    if granted < 2:
        raise RuntimeError(
            f"user role seeded with only {granted} grants; expected the guest "
            "set plus self.list and self.personal_notes"
        )


def downgrade() -> None:
    """
    Deletes the role. role_permission cascades on role_id; users.role_id is
    ON DELETE RESTRICT, so this fails loudly if any account still holds the
    role rather than silently orphaning it - which is the correct outcome.
    """
    op.execute("DELETE FROM role WHERE name = 'user'")
