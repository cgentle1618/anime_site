"""Seed the "Label" system option category with its first three values.

Revision ID: l1a2b3e4l5o6

WHY A MIGRATION AND NOT THE ADD PAGE
------------------------------------
Every later value goes in through the Options Add page, as an open vocabulary
should. These three are the ones the field ships with, and a category with no
values renders an empty dropdown that reads as a bug - so the initial set
travels with the schema instead of being re-typed on every database.

IDEMPOTENT ON PURPOSE
---------------------
uq_system_option_value already forbids a duplicate (category, value), so a
plain INSERT would abort the whole migration on a database where the admin
had already added one of these by hand. The WHERE NOT EXISTS guard makes the
second run a no-op instead, which is also what lets a restore-then-upgrade
sequence work.

Each value gets a scope row for "anime": the field is offered on anime only
(credit_roles.TAG_FIELDS["label"]), and a value with no scope rows would be
offered everywhere.

Revises: d1r2o3p4r5o6
Create Date: 2026-08-30
"""

from alembic import op

revision = "l1a2b3e4l5o6"
down_revision = "d1r2o3p4r5o6"
branch_labels = None
depends_on = None

CATEGORY = "Label"
VALUES = ("會跳OP", "吃飯不宜觀看", "很多福利")


def upgrade() -> None:
    for sort_order, value in enumerate(VALUES):
        op.execute(
            f"""
            INSERT INTO system_option
                (system_id, category, value, sort_order, created_at, updated_at)
            SELECT gen_random_uuid(), '{CATEGORY}', '{value}', {sort_order},
                   NOW(), NOW()
            WHERE NOT EXISTS (
                SELECT 1 FROM system_option
                WHERE category = '{CATEGORY}' AND value = '{value}'
            )
            """
        )
        op.execute(
            f"""
            INSERT INTO system_option_scope (option_id, scope)
            SELECT o.system_id, 'anime'
            FROM system_option o
            WHERE o.category = '{CATEGORY}' AND o.value = '{value}'
              AND NOT EXISTS (
                  SELECT 1 FROM system_option_scope s
                  WHERE s.option_id = o.system_id AND s.scope = 'anime'
              )
            """
        )


def downgrade() -> None:
    # The scope rows go with the option (ON DELETE CASCADE), as do any
    # media_tag rows pointing at them.
    values = ", ".join(f"'{v}'" for v in VALUES)
    op.execute(
        f"DELETE FROM system_option "
        f"WHERE category = '{CATEGORY}' AND value IN ({values})"
    )
