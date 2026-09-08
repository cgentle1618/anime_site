"""Make uq_person_name, uq_studio_name and uq_person_role actually fire.

Revision ID: n1u2l3l4s5n6d

WHY NULLS NOT DISTINCT
----------------------
Postgres treats two NULLs as distinct inside a UNIQUE constraint by default.
uq_person_name is (name_native, name_en) with a NULLABLE name_en, and every
one of the 554 backfilled people has name_en IS NULL - so the constraint was
inert and two identical Person(name_native='Dup') rows committed cleanly.
uq_studio_name had the same hole, and so did uq_person_role via its nullable
`scope` (only "director" is scoped; every other role stores NULL).

That is not theoretical. ensureSourceValues.js POSTs a new person whenever a
typed name is absent from the ROLE-FILTERED suggestion list, so typing an
existing producer's name into anime's Director field created a SECOND person
row with the same name, and resolve_person then credited whichever the scan
happened to hit first.

media_credit already carries postgresql_nulls_not_distinct=True for exactly
this reason (see the comment on uq_media_credit_row); this revision carries
the same lesson across to its sibling tables. If you add a UNIQUE constraint
over a nullable column, ask whether two NULLs should collide - here they must,
because "no English name" is one fact, not infinitely many distinct ones.

Duplicates must be collapsed BEFORE the constraint can be created, the same
way so1p2t3i4o5n did for system_option. Unlike that one, a plain DELETE would
LOSE DATA here: media_credit.person_id / studio_id cascade on delete, so the
loser's credits are repointed onto the survivor first - the merge endpoints'
behaviour, expressed in SQL.

Requires PostgreSQL 15+ (NULLS NOT DISTINCT), which media_credit already did.
"""

from alembic import op

revision = "n1u2l3l4s5n6d"
down_revision = "d1r2o3p4c5o6l"
branch_labels = None
depends_on = None


# The survivor of a duplicate group is the oldest row, falling back to the
# smallest id so the choice is deterministic when created_at is NULL or tied.
_PERSON_MERGE = """
CREATE TEMP TABLE person_merge ON COMMIT DROP AS
WITH ranked AS (
    SELECT
        system_id,
        FIRST_VALUE(system_id) OVER (
            PARTITION BY name_native, COALESCE(name_en, '')
            ORDER BY created_at NULLS LAST, system_id
        ) AS keeper
    FROM person
)
SELECT system_id AS loser, keeper FROM ranked WHERE system_id <> keeper
"""

_STUDIO_MERGE = """
CREATE TEMP TABLE studio_merge ON COMMIT DROP AS
WITH ranked AS (
    SELECT
        system_id,
        FIRST_VALUE(system_id) OVER (
            PARTITION BY name_native, COALESCE(name_en, '')
            ORDER BY created_at NULLS LAST, system_id
        ) AS keeper
    FROM studio
)
SELECT system_id AS loser, keeper FROM ranked WHERE system_id <> keeper
"""

# Repointing can land two credits for the same (entry, role, person) - that is
# what a duplicate person meant in practice - so collapse those too, keeping
# the earliest position.
_DEDUPE_CREDITS = """
DELETE FROM media_credit a
USING media_credit b
WHERE a.ctid > b.ctid
  AND a.media_type = b.media_type
  AND a.entry_id = b.entry_id
  AND a.role = b.role
  AND a.person_id IS NOT DISTINCT FROM b.person_id
  AND a.studio_id IS NOT DISTINCT FROM b.studio_id
"""

_DEDUPE_PERSON_ROLE = """
DELETE FROM person_role a
USING person_role b
WHERE a.id > b.id
  AND a.person_id = b.person_id
  AND a.role = b.role
  AND a.scope IS NOT DISTINCT FROM b.scope
"""


# The full collapse, as a list of statements, so a test can run exactly what
# the migration runs against seeded duplicates (the constraint that lands at
# the end makes duplicates un-insertable afterwards, so this is the only
# honest way to exercise it).
COLLAPSE_DUPLICATES: tuple[str, ...] = (
    _PERSON_MERGE,
    "UPDATE media_credit c SET person_id = m.keeper "
    "FROM person_merge m WHERE c.person_id = m.loser",
    "UPDATE person_role r SET person_id = m.keeper "
    "FROM person_merge m WHERE r.person_id = m.loser",
    "DELETE FROM person p USING person_merge m WHERE p.system_id = m.loser",
    _STUDIO_MERGE,
    "UPDATE media_credit c SET studio_id = m.keeper "
    "FROM studio_merge m WHERE c.studio_id = m.loser",
    "DELETE FROM studio s USING studio_merge m WHERE s.system_id = m.loser",
    _DEDUPE_CREDITS,
    _DEDUPE_PERSON_ROLE,
)

# Raw SQL rather than op.create_unique_constraint: NULLS NOT DISTINCT sits
# between UNIQUE and the column list, which the helper cannot express.
ADD_CONSTRAINTS: tuple[str, ...] = (
    "ALTER TABLE person DROP CONSTRAINT IF EXISTS uq_person_name",
    "ALTER TABLE person ADD CONSTRAINT uq_person_name "
    "UNIQUE NULLS NOT DISTINCT (name_native, name_en)",
    "ALTER TABLE studio DROP CONSTRAINT IF EXISTS uq_studio_name",
    "ALTER TABLE studio ADD CONSTRAINT uq_studio_name "
    "UNIQUE NULLS NOT DISTINCT (name_native, name_en)",
    "ALTER TABLE person_role DROP CONSTRAINT IF EXISTS uq_person_role",
    "ALTER TABLE person_role ADD CONSTRAINT uq_person_role "
    "UNIQUE NULLS NOT DISTINCT (person_id, role, scope)",
)


def upgrade() -> None:
    for statement in COLLAPSE_DUPLICATES + ADD_CONSTRAINTS:
        op.execute(statement)


def downgrade() -> None:
    """Restores the inert constraints. The merges are not reversible."""
    op.execute("ALTER TABLE person DROP CONSTRAINT IF EXISTS uq_person_name")
    op.execute(
        "ALTER TABLE person ADD CONSTRAINT uq_person_name "
        "UNIQUE (name_native, name_en)"
    )
    op.execute("ALTER TABLE studio DROP CONSTRAINT IF EXISTS uq_studio_name")
    op.execute(
        "ALTER TABLE studio ADD CONSTRAINT uq_studio_name "
        "UNIQUE (name_native, name_en)"
    )
    op.execute("ALTER TABLE person_role DROP CONSTRAINT IF EXISTS uq_person_role")
    op.execute(
        "ALTER TABLE person_role ADD CONSTRAINT uq_person_role "
        "UNIQUE (person_id, role, scope)"
    )
