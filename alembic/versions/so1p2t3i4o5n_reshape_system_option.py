"""Reshape system_options into system_option + system_option_scope.

Revision ID: so1p2t3i4o5n
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "so1p2t3i4o5n"
down_revision = "0ac5add00888"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("system_options", "system_option")
    op.alter_column("system_option", "option_value", new_column_name="value")

    op.add_column(
        "system_option",
        sa.Column("system_id", UUID(as_uuid=True), nullable=True),
    )
    op.execute("UPDATE system_option SET system_id = gen_random_uuid()")
    op.alter_column("system_option", "system_id", nullable=False)

    op.add_column(
        "system_option",
        sa.Column(
            "sort_order", sa.Integer(), nullable=False, server_default="0"
        ),
    )
    op.add_column("system_option", sa.Column("remark", sa.Text(), nullable=True))
    op.add_column(
        "system_option", sa.Column("created_at", sa.DateTime(), nullable=True)
    )
    op.add_column(
        "system_option", sa.Column("updated_at", sa.DateTime(), nullable=True)
    )

    # Collapse duplicates the old table allowed before the constraint can exist.
    op.execute(
        """
        DELETE FROM system_option a
        USING system_option b
        WHERE a.id > b.id
          AND a.category = b.category
          AND a.value = b.value
        """
    )

    op.drop_constraint("system_options_pkey", "system_option", type_="primary")
    # The legacy id column was SERIAL; its nextval default may survive the PK
    # drop. It is dropped entirely in a later task, but make it nullable now
    # so nothing downstream depends on that default still working.
    op.alter_column("system_option", "id", nullable=True)
    op.create_primary_key("system_option_pkey", "system_option", ["system_id"])
    op.create_index("ix_system_option_system_id", "system_option", ["system_id"])
    op.create_unique_constraint(
        "uq_system_option_value", "system_option", ["category", "value"]
    )

    op.create_table(
        "system_option_scope",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "option_id",
            UUID(as_uuid=True),
            sa.ForeignKey("system_option.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("scope", sa.String(), nullable=False),
        sa.UniqueConstraint("option_id", "scope", name="uq_system_option_scope"),
    )
    op.create_index(
        "ix_system_option_scope_option_id", "system_option_scope", ["option_id"]
    )

    # The old integer id stays for now: Task 10's data migration maps entry
    # strings onto these rows and drops it at the end of Task 12.


def downgrade() -> None:
    op.drop_table("system_option_scope")
    op.drop_constraint("uq_system_option_value", "system_option", type_="unique")
    op.drop_index("ix_system_option_system_id", "system_option")
    op.drop_constraint("system_option_pkey", "system_option", type_="primary")
    op.alter_column("system_option", "id", nullable=False)
    op.create_primary_key("system_options_pkey", "system_option", ["id"])
    op.drop_column("system_option", "updated_at")
    op.drop_column("system_option", "created_at")
    op.drop_column("system_option", "remark")
    op.drop_column("system_option", "sort_order")
    op.drop_column("system_option", "system_id")
    op.alter_column("system_option", "value", new_column_name="option_value")
    op.rename_table("system_option", "system_options")
