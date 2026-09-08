"""add collection table and franchise.collection_id

Revision ID: s2t3u4v5w6x7
Revises: r1s2t3u4v5w6
Create Date: 2026-08-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 's2t3u4v5w6x7'
down_revision: Union[str, Sequence[str], None] = 'r1s2t3u4v5w6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    collection and franchise reference each other (franchise.collection_id and
    collection.cover_franchise_id), so both tables must exist before either
    foreign key is added.
    """
    op.create_table(
        "collection",
        sa.Column("system_id", sa.UUID(), nullable=False),
        sa.Column("collection_name_en", sa.String(), nullable=True),
        sa.Column("collection_name_cn", sa.String(), nullable=True),
        sa.Column("collection_name_roman", sa.String(), nullable=True),
        sa.Column("collection_name_jp", sa.String(), nullable=True),
        sa.Column("collection_name_alt", sa.String(), nullable=True),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("collection_expectation", sa.String(), nullable=True),
        sa.Column("cover_franchise_id", sa.UUID(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("system_id"),
    )
    op.create_index(
        op.f("ix_collection_system_id"), "collection", ["system_id"], unique=False
    )

    op.add_column("franchise", sa.Column("collection_id", sa.UUID(), nullable=True))
    op.create_index(
        op.f("ix_franchise_collection_id"), "franchise", ["collection_id"], unique=False
    )

    # Both tables now exist - wire up the cycle.
    op.create_foreign_key(
        "fk_franchise_collection_id",
        "franchise",
        "collection",
        ["collection_id"],
        ["system_id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_collection_cover_franchise_id",
        "collection",
        "franchise",
        ["cover_franchise_id"],
        ["system_id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    """Downgrade schema. Drop both foreign keys before either table."""
    op.drop_constraint(
        "fk_collection_cover_franchise_id", "collection", type_="foreignkey"
    )
    op.drop_constraint("fk_franchise_collection_id", "franchise", type_="foreignkey")

    op.drop_index(op.f("ix_franchise_collection_id"), table_name="franchise")
    op.drop_column("franchise", "collection_id")

    op.drop_index(op.f("ix_collection_system_id"), table_name="collection")
    op.drop_table("collection")
