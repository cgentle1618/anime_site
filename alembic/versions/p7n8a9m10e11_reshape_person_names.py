"""Reshape person names to match studio: four nullable names.

Revision ID: p7n8a9m10e11
Revises: r0l1c2o3l4p5
Create Date: 2026-09-04

name_en and name_cn are NULL on all 554 rows today, so nothing is overwritten.
Unlike studios - where name_native -> name_en was correct for all 77 - people
are mixed: 336 CJK, 218 Latin (measured 2026-09-04). name_slot_for owns the
distribution rule; it is called here with novel_type from a join, which is the
only place that column is knowable.

Expected distribution: 218 en / 167 cn / 169 jp.

Revises r0l1c2o3l4p5, not the p1e2r3s4o5n6 the plan named: that id was already
taken by the migration which CREATED the person tables, and Alembic reports the
collision as "Cycle is detected in revisions", not as a duplicate id.
"""

import sqlalchemy as sa

from alembic import op
from app.utils.name_normalize import name_slot_for

revision = "p7n8a9m10e11"
down_revision = "r0l1c2o3l4p5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()

    op.add_column("person", sa.Column("name_jp", sa.String(), nullable=True))
    op.add_column("person", sa.Column("name_alt", sa.String(), nullable=True))
    op.add_column(
        "person", sa.Column("display_name_field", sa.String(), nullable=True)
    )

    # One row per person with the role/scope/novel_type context the rule needs.
    # A person may hold several roles; the first by role name is used, which is
    # deterministic and - verified on 2026-09-04 - never ambiguous: no person in
    # the cn bucket also holds a jp-bucket credit. The 3 people who author both
    # a plain and a light novel resolve to cn, which is the intended tiebreak.
    rows = conn.execute(
        sa.text(
            "SELECT p.system_id, p.name_native, pr.role, pr.scope, n.type "
            "FROM person p "
            "LEFT JOIN person_role pr ON pr.person_id = p.system_id "
            "LEFT JOIN media_credit mc ON mc.person_id = p.system_id "
            "  AND mc.role = pr.role AND mc.media_type = pr.scope "
            "LEFT JOIN novel n ON n.system_id = mc.entry_id AND mc.media_type = 'novel' "
            "ORDER BY p.system_id, "
            "  CASE WHEN n.type IS NOT NULL AND n.type NOT IN ('Light Novel','Web') "
            "       THEN 0 ELSE 1 END, pr.role"
        )
    ).fetchall()

    seen = set()
    for system_id, name_native, role, scope, novel_type in rows:
        if system_id in seen:
            continue
        seen.add(system_id)
        slot = name_slot_for(
            name_native or "", role=role or "", scope=scope or "", novel_type=novel_type
        )
        conn.execute(
            sa.text(f"UPDATE person SET name_{slot} = :n WHERE system_id = :i"),
            {"n": name_native, "i": system_id},
        )

    op.drop_constraint("uq_person_name", "person", type_="unique")
    op.drop_column("person", "name_native")
    op.create_unique_constraint(
        "uq_person_name",
        "person",
        ["name_en", "name_cn", "name_jp", "name_alt"],
        postgresql_nulls_not_distinct=True,
    )
    op.create_check_constraint(
        "ck_person_has_a_name",
        "person",
        "num_nonnulls(name_en, name_cn, name_jp, name_alt) >= 1",
    )


def downgrade() -> None:
    conn = op.get_bind()
    op.drop_constraint("ck_person_has_a_name", "person", type_="check")
    op.drop_constraint("uq_person_name", "person", type_="unique")
    op.add_column("person", sa.Column("name_native", sa.String(), nullable=True))
    conn.execute(
        sa.text(
            "UPDATE person SET name_native = "
            "COALESCE(name_cn, name_jp, name_en, name_alt)"
        )
    )
    op.alter_column("person", "name_native", nullable=False)
    op.drop_column("person", "display_name_field")
    op.drop_column("person", "name_alt")
    op.drop_column("person", "name_jp")
    op.create_unique_constraint(
        "uq_person_name",
        "person",
        ["name_native", "name_en"],
        postgresql_nulls_not_distinct=True,
    )
