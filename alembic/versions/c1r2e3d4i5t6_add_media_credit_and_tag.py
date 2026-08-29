"""Add the media_credit and media_tag link tables.

Revision ID: c1r2e3d4i5t6
Revises: p1e2r3s4o5n6
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "c1r2e3d4i5t6"
down_revision = "p1e2r3s4o5n6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "media_credit",
        sa.Column(
            "system_id",
            UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("entry_id", UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column(
            "person_id",
            UUID(as_uuid=True),
            sa.ForeignKey("person.system_id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "studio_id",
            UUID(as_uuid=True),
            sa.ForeignKey("studio.system_id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(person_id, studio_id) = 1",
            name="ck_media_credit_one_target",
        ),
        sa.UniqueConstraint(
            "media_type",
            "entry_id",
            "role",
            "person_id",
            "studio_id",
            name="uq_media_credit_row",
            postgresql_nulls_not_distinct=True,
        ),
    )
    op.create_index("ix_media_credit_system_id", "media_credit", ["system_id"])
    op.create_index("ix_media_credit_role", "media_credit", ["role"])
    op.create_index("ix_media_credit_person_id", "media_credit", ["person_id"])
    op.create_index("ix_media_credit_studio_id", "media_credit", ["studio_id"])
    op.create_index(
        "ix_media_credit_entry", "media_credit", ["media_type", "entry_id"]
    )

    op.create_table(
        "media_tag",
        sa.Column(
            "system_id",
            UUID(as_uuid=True),
            primary_key=True,
        ),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("entry_id", UUID(as_uuid=True), nullable=False),
        sa.Column("field", sa.String(), nullable=False),
        sa.Column(
            "option_id",
            UUID(as_uuid=True),
            sa.ForeignKey("system_option.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "media_type", "entry_id", "field", "option_id", name="uq_media_tag_row"
        ),
    )
    op.create_index("ix_media_tag_system_id", "media_tag", ["system_id"])
    op.create_index("ix_media_tag_field", "media_tag", ["field"])
    op.create_index("ix_media_tag_option_id", "media_tag", ["option_id"])
    op.create_index("ix_media_tag_entry", "media_tag", ["media_type", "entry_id"])


def downgrade() -> None:
    op.drop_table("media_tag")
    op.drop_table("media_credit")
