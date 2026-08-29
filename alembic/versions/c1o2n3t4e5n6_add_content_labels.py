"""Content labels and the entries that carry them.

Revision ID: c1o2n3t4e5n6

WHY A TABLE OF ITS OWN AND NOT media_tag
----------------------------------------
media_tag is keyed to system_option and is written by the Fill pipeline and by
the backfill migrations. Storing access control there would mean a pipeline run
could silently change who can see an entry, and a tag cleanup could open one up.
Access control gets its own table, its own vocabulary and its own write path.

WHY THE (media_type, entry_id) PAIR IS FK-LESS
----------------------------------------------
The same reason media_credit, media_tag, media_relation and watch_order_item
carry it: no single foreign key can span the eight media tables, and each table
has its own system_id space, so a bare UUID is ambiguous. The pair is resolved
at read time through MEDIA_TABLES in app/utils/media_resolver.py. Keys are the
HYPHENATED spelling ("tv-show"), matching every other table that stores a
media_type discriminator.

WHY THIS REVISION CHANGES NOTHING
---------------------------------
It creates two empty tables. No entry carries a label, so the anti-join in
enforcement.py finds nothing to hide and short-circuits before it runs. Pure
DDL with no backfill, so the downgrade is a clean drop.

Revises: r1b2a3c4c5o6
Create Date: 2026-08-29
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "c1o2n3t4e5n6"
down_revision = "r1b2a3c4c5o6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "content_label",
        sa.Column(
            "system_id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("key", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_content_label_system_id", "content_label", ["system_id"])
    op.create_index("ix_content_label_key", "content_label", ["key"], unique=True)

    op.create_table(
        "media_content_label",
        sa.Column(
            "system_id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("media_type", sa.String(), nullable=False),
        sa.Column("entry_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "label_id",
            UUID(as_uuid=True),
            sa.ForeignKey("content_label.system_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "media_type", "entry_id", "label_id", name="uq_media_content_label_row"
        ),
    )
    op.create_index(
        "ix_media_content_label_system_id", "media_content_label", ["system_id"]
    )
    op.create_index(
        "ix_media_content_label_label_id", "media_content_label", ["label_id"]
    )
    # Drives the NOT EXISTS anti-join that every gated list query runs.
    op.create_index(
        "ix_media_content_label_entry",
        "media_content_label",
        ["media_type", "entry_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_media_content_label_entry", table_name="media_content_label")
    op.drop_index("ix_media_content_label_label_id", table_name="media_content_label")
    op.drop_index("ix_media_content_label_system_id", table_name="media_content_label")
    op.drop_table("media_content_label")

    op.drop_index("ix_content_label_key", table_name="content_label")
    op.drop_index("ix_content_label_system_id", table_name="content_label")
    op.drop_table("content_label")
