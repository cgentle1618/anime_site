"""add system_option_usage

Revision ID: su1s2a3g4e5
Revises: nv1u2n3i4t5s
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "su1s2a3g4e5"
down_revision = "nv1u2n3i4t5s"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "system_option_usage",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("option_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("usage", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(
            ["option_id"], ["system_option.system_id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("option_id", "usage", name="uq_system_option_usage"),
    )
    op.create_index(
        "ix_system_option_usage_option_id",
        "system_option_usage",
        ["option_id"],
    )


def downgrade():
    op.drop_index("ix_system_option_usage_option_id", "system_option_usage")
    op.drop_table("system_option_usage")
