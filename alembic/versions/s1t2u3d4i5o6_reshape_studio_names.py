"""Reshape studio names into four optional fields with a display choice.

name_native held a single required name. Verified against the production
data on 2026-09-04: of 77 rows, 72 are pure Latin/romanised names and 5
carry an embedded CJK name in parentheses, so every value is an English
name and name_native -> name_en is lossless. The five composite names stay
intact; splitting them is admin data cleanup, not migration logic.

Revision ID: s1t2u3d4i5o6
Revises: o1r2p3h4a5n6
"""

import sqlalchemy as sa
from alembic import op

revision = "s1t2u3d4i5o6"
down_revision = "o1r2p3h4a5n6"
branch_labels = None
depends_on = None

ISO = r"^\d{4}(-\d{2}(-\d{2})?)?$"


def upgrade() -> None:
    for name, column in [
        # name_cn already exists from the original studio table (see
        # p1e2r3s4o5n6_add_person_and_studio.py) - not added here.
        ("name_jp", sa.Column("name_jp", sa.String(), nullable=True)),
        ("name_alt", sa.Column("name_alt", sa.String(), nullable=True)),
        ("display_name_field", sa.Column("display_name_field", sa.String(), nullable=True)),
        ("founded_date", sa.Column("founded_date", sa.String(), nullable=True)),
        ("defunct_date", sa.Column("defunct_date", sa.String(), nullable=True)),
        ("country", sa.Column("country", sa.String(), nullable=True)),
        ("website_url", sa.Column("website_url", sa.String(), nullable=True)),
        ("mal_id", sa.Column("mal_id", sa.Integer(), nullable=True)),
        ("mal_link", sa.Column("mal_link", sa.String(), nullable=True)),
    ]:
        op.add_column("studio", column)

    # name_en already exists and is NULL on every row, so nothing is lost.
    op.execute("UPDATE studio SET name_en = name_native WHERE name_en IS NULL")

    op.drop_constraint("uq_studio_name", "studio", type_="unique")
    op.drop_column("studio", "name_native")

    op.create_index("ix_studio_name_en", "studio", ["name_en"])
    op.create_unique_constraint(
        "uq_studio_name",
        "studio",
        ["name_en", "name_cn", "name_jp", "name_alt"],
        postgresql_nulls_not_distinct=True,
    )
    op.create_check_constraint(
        "ck_studio_has_a_name",
        "studio",
        "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
    )
    op.create_check_constraint(
        "ck_studio_founded_date", "studio", f"founded_date IS NULL OR founded_date ~ '{ISO}'"
    )
    op.create_check_constraint(
        "ck_studio_defunct_date", "studio", f"defunct_date IS NULL OR defunct_date ~ '{ISO}'"
    )


def downgrade() -> None:
    op.drop_constraint("ck_studio_defunct_date", "studio", type_="check")
    op.drop_constraint("ck_studio_founded_date", "studio", type_="check")
    op.drop_constraint("ck_studio_has_a_name", "studio", type_="check")
    op.drop_constraint("uq_studio_name", "studio", type_="unique")
    op.drop_index("ix_studio_name_en", table_name="studio")

    op.add_column("studio", sa.Column("name_native", sa.String(), nullable=True))
    op.execute(
        "UPDATE studio SET name_native = "
        "COALESCE(name_en, name_cn, name_jp, name_alt)"
    )
    op.alter_column("studio", "name_native", nullable=False)
    op.create_index("ix_studio_name_native", "studio", ["name_native"])

    for column in [
        "mal_link", "mal_id", "website_url", "country",
        "defunct_date", "founded_date", "display_name_field",
        "name_alt", "name_jp",
        # name_cn predates this migration (see upgrade()) - not dropped here.
    ]:
        op.drop_column("studio", column)

    op.create_unique_constraint(
        "uq_studio_name",
        "studio",
        ["name_native", "name_en"],
        postgresql_nulls_not_distinct=True,
    )
