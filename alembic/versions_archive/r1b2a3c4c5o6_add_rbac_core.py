"""Roles, role grants, and users.role_id.

Revision ID: r1b2a3c4c5o6

WHY A ROLE TABLE AND NOT A PERMISSION TABLE
-------------------------------------------
Only the GRANTS are data. The permissions themselves stay Python constants in
app/services/rbac, for the reason app/models/system.py::SystemOption already
gives: a permission names a column, a MEDIA_TABLES key or a field group, so a
stored permission row with no code behind it would be inert, and a code change
could rename one out from under its grants. role_permission.permission is a
plain string validated against the computed catalog on write, exactly as
media_tag.field is validated against TAG_FIELD_KEYS.

WHY THE SEED LIVES IN A FUNCTION AND NOT IN THIS FILE
-----------------------------------------------------
tests/api/conftest.py rebuilds the schema with Base.metadata.create_all and
never runs Alembic. A seed written inline here would exist in production and
be absent from every API test. ensure_rbac_seed() is therefore called from
three places - this migration, the app lifespan, and the test engine fixture -
and is idempotent so that is safe.

WHY GUEST IS GRANTED EVERYTHING
-------------------------------
So that this revision changes no behavior. Before it, every read route was
public and every field was served; after it, the guest role holds every
media_type.* and field_group.* permission, which is the same thing. There are
no content labels yet, so nothing is hidden. An admin narrows access by
REMOVING grants, never by adding them.

WHY users.role IS NOT DROPPED HERE
----------------------------------
tests/api/conftest.py and tests/api/test_auth.py construct User(role="admin")
and assert on the login response's role field. The string column stays until
migration C, and resolve_viewer falls back to it when role_id is NULL, so a
row written before this backfill still resolves.

Revises: n1u2l3l4s5n6d
Create Date: 2026-08-29
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import sessionmaker

revision = "r1b2a3c4c5o6"
down_revision = "n1u2l3l4s5n6d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "role",
        sa.Column(
            "system_id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column(
            "is_system", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column(
            "is_superuser",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_role_system_id", "role", ["system_id"])
    op.create_index("ix_role_name", "role", ["name"], unique=True)

    op.create_table(
        "role_permission",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "role_id",
            UUID(as_uuid=True),
            sa.ForeignKey("role.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("permission", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("role_id", "permission", name="uq_role_permission"),
    )
    op.create_index("ix_role_permission_id", "role_permission", ["id"])
    op.create_index("ix_role_permission_role_id", "role_permission", ["role_id"])

    # Seed before the backfill: it needs the rows it matches against.
    from app.services.rbac.seed import ensure_rbac_seed

    bind = op.get_bind()
    session = sessionmaker(bind=bind)()
    ensure_rbac_seed(session)
    session.flush()

    op.add_column(
        "users", sa.Column("role_id", UUID(as_uuid=True), nullable=True)
    )
    op.create_index("ix_users_role_id", "users", ["role_id"])
    op.create_foreign_key(
        "fk_users_role_id", "users", "role", ["role_id"], ["system_id"],
        ondelete="RESTRICT",
    )

    # Match by name, so the existing seeded admin keeps its identity rather
    # than being recreated. A row naming a role that does not exist falls to
    # guest, which is the safe direction.
    op.execute(
        """
        UPDATE users
        SET role_id = COALESCE(
            (SELECT system_id FROM role WHERE role.name = users.role),
            (SELECT system_id FROM role WHERE role.name = 'guest')
        )
        WHERE role_id IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_role_id", "users", type_="foreignkey")
    op.drop_index("ix_users_role_id", table_name="users")
    op.drop_column("users", "role_id")

    op.drop_index("ix_role_permission_role_id", table_name="role_permission")
    op.drop_index("ix_role_permission_id", table_name="role_permission")
    op.drop_table("role_permission")

    op.drop_index("ix_role_name", table_name="role")
    op.drop_index("ix_role_system_id", table_name="role")
    op.drop_table("role")
