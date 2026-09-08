"""Add the publisher entity and media_credit's third entity target.

Revision ID: p1u2b3l4i5s6

Publishers and distributors used to be a single "Publisher / Distributor TW"
vocabulary in system_option, on the ruling that they need no profile of their
own. Games reversed that: a publisher is a first-class fact about a game, not
a distribution footnote, so it becomes a table shaped after `studio` - four
optional names, a data-driven display choice, a logo and a profile.

Separate from `studio` rather than a role on it. The overlap is real (Bandai
Namco and Kadokawa both develop and publish, and will exist as two unlinked
rows), but most publisher/distributor values are distributors that never
developed anything, and listing them on /library/studio would blur what that
page means.

No mal_id/mal_link, unlike studio: MAL has no record of a games publisher or a
Taiwanese distributor, so there is nothing to autofill from.

Reaching it needs a THIRD nullable entity FK on media_credit, which is why
both of that table's guards are rebuilt here rather than merely extended:
`ck_media_credit_one_target` becomes num_nonnulls over three columns, and
`uq_media_credit_row` gains publisher_id. The unique constraint keeps
NULLS NOT DISTINCT - two of the three FKs are NULL on every row, and without
it the constraint would be inert.

The four existing media types are NOT migrated here: `publisher_tw` stays a
media_tag field on anime, manga, novel and comic until a later revision
converts those rows into publisher entities.

Revises: dc1o2l3s4d5
Create Date: 2026-09-06
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "p1u2b3l4i5s6"
down_revision = "dc1o2l3s4d5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "publisher",
        sa.Column("system_id", UUID(as_uuid=True), primary_key=True),
        sa.Column("name_en", sa.String(), nullable=True),
        sa.Column("name_cn", sa.String(), nullable=True),
        sa.Column("name_jp", sa.String(), nullable=True),
        sa.Column("name_alt", sa.String(), nullable=True),
        sa.Column("display_name_field", sa.String(), nullable=True),
        sa.Column("my_rating", sa.String(), nullable=True),
        sa.Column("logo_file", sa.String(), nullable=True),
        sa.Column("remark", sa.Text(), nullable=True),
        sa.Column("founded_date", sa.String(), nullable=True),
        sa.Column("defunct_date", sa.String(), nullable=True),
        sa.Column("country", sa.String(), nullable=True),
        sa.Column("website_url", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint(
            "name_en",
            "name_cn",
            "name_jp",
            "name_alt",
            name="uq_publisher_name",
            postgresql_nulls_not_distinct=True,
        ),
        sa.CheckConstraint(
            "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
            name="ck_publisher_has_a_name",
        ),
        sa.CheckConstraint(
            r"founded_date IS NULL OR founded_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_publisher_founded_date",
        ),
        sa.CheckConstraint(
            r"defunct_date IS NULL OR defunct_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_publisher_defunct_date",
        ),
    )
    op.create_index("ix_publisher_system_id", "publisher", ["system_id"])
    op.create_index("ix_publisher_name_en", "publisher", ["name_en"])

    op.add_column(
        "media_credit",
        sa.Column("publisher_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_media_credit_publisher_id",
        "media_credit",
        "publisher",
        ["publisher_id"],
        ["system_id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_media_credit_publisher_id", "media_credit", ["publisher_id"]
    )

    # Both guards are DROPPED and recreated: Postgres has no "widen a CHECK"
    # or "add a column to a unique constraint" in place.
    op.drop_constraint(
        "ck_media_credit_one_target", "media_credit", type_="check"
    )
    op.create_check_constraint(
        "ck_media_credit_one_target",
        "media_credit",
        "num_nonnulls(person_id, studio_id, publisher_id) = 1",
    )
    op.drop_constraint("uq_media_credit_row", "media_credit", type_="unique")
    op.create_unique_constraint(
        "uq_media_credit_row",
        "media_credit",
        ["media_type", "entry_id", "role", "person_id", "studio_id", "publisher_id"],
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_constraint("uq_media_credit_row", "media_credit", type_="unique")
    op.create_unique_constraint(
        "uq_media_credit_row",
        "media_credit",
        ["media_type", "entry_id", "role", "person_id", "studio_id"],
        postgresql_nulls_not_distinct=True,
    )
    op.drop_constraint(
        "ck_media_credit_one_target", "media_credit", type_="check"
    )
    op.create_check_constraint(
        "ck_media_credit_one_target",
        "media_credit",
        "num_nonnulls(person_id, studio_id) = 1",
    )

    op.drop_index("ix_media_credit_publisher_id", table_name="media_credit")
    op.drop_constraint(
        "fk_media_credit_publisher_id", "media_credit", type_="foreignkey"
    )
    op.drop_column("media_credit", "publisher_id")

    op.drop_index("ix_publisher_name_en", table_name="publisher")
    op.drop_index("ix_publisher_system_id", table_name="publisher")
    op.drop_table("publisher")
