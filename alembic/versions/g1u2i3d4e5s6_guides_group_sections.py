"""move the two flat game note sections onto the 攻略 group's keys

Revision ID: g1u2i3d4e5s6
Revises: b1n2amealign
Create Date: 2026-09-12

`guides` and `builds_and_mods` were a game's whole guide vocabulary. The 攻略
group replaces them with fifteen sections, so their rows need new section keys.
Data only - `note.section` is a plain String column and nothing here alters a
table.

Three arms, and the kind clauses are the part worth reading:

  * `builds_and_styles` declares NO kinds, so a row arriving with kind='Build'
    would fail validate_note_payload check 5 ("takes no kind") the next time
    anyone edited it - accepted by the migration, rejected by the app. The
    Build arm therefore clears the column.
  * `mods_and_tools` keeps kinds ('Mod', 'Tool'), so those rows keep theirs.
  * A `builds_and_mods` row with a NULL kind goes to `builds_and_styles`, not
    to `mods_and_tools`: that section was mostly used for builds, so an
    unlabelled row is likelier to be one.

BACK UP TO GOOGLE SHEETS AFTER RUNNING THIS. A sheet written before it still
holds `guides` and `builds_and_mods` in its section column, and Pull writes
note rows WITHOUT running validate_note_payload (it is called only in
app/routers/note.py) - so pulling an old sheet reintroduces rows whose section
key no longer exists in the registry, which the notes page silently drops.

The statements are module-level tuples because
tests/api/test_guides_section_migration.py executes these exact strings: the
suite has no Alembic harness, and a test that restated the SQL would pass while
the shipped SQL was wrong.
"""

from alembic import op

revision = "g1u2i3d4e5s6"
down_revision = "b1n2amealign"
branch_labels = None
depends_on = None

UPGRADE_STATEMENTS = (
    "UPDATE note SET section = 'guide_resources' WHERE section = 'guides'",
    # Before the Mod/Tool arm only for readability; the two are disjoint by
    # kind, so either order gives the same result.
    """
    UPDATE note SET section = 'builds_and_styles', kind = NULL
     WHERE section = 'builds_and_mods'
       AND (kind = 'Build' OR kind IS NULL)
    """,
    """
    UPDATE note SET section = 'mods_and_tools'
     WHERE section = 'builds_and_mods'
       AND kind IN ('Mod', 'Tool')
    """,
)

# Lossy in one direction only, and correctly so: a build row created AFTER the
# upgrade also gets kind='Build' here, which is the value the old section would
# have held for it.
DOWNGRADE_STATEMENTS = (
    "UPDATE note SET section = 'guides' WHERE section = 'guide_resources'",
    """
    UPDATE note SET section = 'builds_and_mods', kind = 'Build'
     WHERE section = 'builds_and_styles'
    """,
    "UPDATE note SET section = 'builds_and_mods' WHERE section = 'mods_and_tools'",
)


def upgrade() -> None:
    for statement in UPGRADE_STATEMENTS:
        op.execute(statement)


def downgrade() -> None:
    for statement in DOWNGRADE_STATEMENTS:
        op.execute(statement)
