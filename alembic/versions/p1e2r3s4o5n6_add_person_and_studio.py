"""Add the person, person_role and studio tables.

Revision ID: p1e2r3s4o5n6
Revises: so1p2t3i4o5n
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "p1e2r3s4o5n6"
down_revision = "so1p2t3i4o5n"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "person",
        sa.Column(
            "system_id",
            UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column("name_native", sa.String(), nullable=False),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("photo_file", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("name_native", "name_en", name="uq_person_name"),
    )
    op.create_index("ix_person_system_id", "person", ["system_id"])
    op.create_index("ix_person_name_native", "person", ["name_native"])

    op.create_table(
        "person_role",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "person_id",
            UUID(as_uuid=True),
            sa.ForeignKey("person.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=True),
        sa.UniqueConstraint("person_id", "role", "scope", name="uq_person_role"),
    )
    op.create_index("ix_person_role_person_id", "person_role", ["person_id"])
    op.create_index("ix_person_role_role", "person_role", ["role"])

    op.create_table(
        "studio",
        sa.Column(
            "system_id",
            UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column("name_native", sa.String(), nullable=False),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("logo_file", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("name_native", "name_en", name="uq_studio_name"),
    )
    op.create_index("ix_studio_system_id", "studio", ["system_id"])
    op.create_index("ix_studio_name_native", "studio", ["name_native"])


def downgrade() -> None:
    op.drop_table("studio")
    op.drop_table("person_role")
    op.drop_table("person")
