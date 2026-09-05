"""Add the character and character_casting tables.

Revision ID: c1h2a3r4a5c6
Revises: ol1b2k3s4
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "c1h2a3r4a5c6"
down_revision = "ol1b2k3s4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "character",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("name_jp", sa.String(), nullable=True),
        sa.Column("name_alt", sa.String(), nullable=True),
        sa.Column("display_name_field", sa.String(), nullable=True),
        sa.Column("gender", sa.String(), nullable=True),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("photo_file", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_character_has_a_name",
        ),
    )
    op.create_index("ix_character_system_id", "character", ["system_id"])
    op.create_index("ix_character_name_en", "character", ["name_en"])

    op.create_table(
        "character_casting",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "character_id",
            UUID(as_uuid=True),
            sa.ForeignKey("character.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("entry_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "person_id",
            UUID(as_uuid=True),
            sa.ForeignKey("person.system_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column(
            "position", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("photo_file", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "character_id", "media_type", "entry_id", name="uq_character_casting"
        ),
        sa.CheckConstraint(
            "person_id IS NULL OR media_type IN ('anime', 'anime-movie')",
            name="ck_casting_voice_scope",
        ),
    )
    op.create_index(
        "ix_character_casting_system_id", "character_casting", ["system_id"]
    )
    op.create_index(
        "ix_character_casting_character_id", "character_casting", ["character_id"]
    )
    op.create_index(
        "ix_character_casting_person_id", "character_casting", ["person_id"]
    )
    op.create_index(
        "ix_character_casting_entry", "character_casting", ["media_type", "entry_id"]
    )


def downgrade() -> None:
    op.drop_table("character_casting")
    op.drop_table("character")
