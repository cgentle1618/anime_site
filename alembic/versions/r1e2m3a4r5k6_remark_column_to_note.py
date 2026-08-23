"""fold the remark column into the remark note section

Revision ID: r1e2m3a4r5k6
Revises: media_relation_drop_legacy
Create Date: 2026-08-23 00:00:00.000000

`remark` lived in two places at once: a Text column on each of the ten owner
tables, and the singleton `remark` row in `note`. Text written on the notes
page and text written in the Modify form landed in different places and no view
showed both. This merges them into the note row and drops the columns.

Where an owner has both, the column's text is appended under an
`original remark:` label so it can be reconciled by hand afterwards. Where only
the column has text, it becomes the note content unlabelled.

Downgrade restores the columns and copies the note content back, then deletes
every remark note row. It is deliberately asymmetric: a merged remark returns
as one blob, label included. A pre-migration Google Sheets backup will NOT
restore this data either - the ten media tabs lose their remark column here, so
this revision is the authority for the move.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "r1e2m3a4r5k6"
down_revision: Union[str, Sequence[str], None] = "media_relation_drop_legacy"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (physical table, owner_type). owner_type is the hyphenated OWNER_TABLES key
# from app/utils/media_resolver.py, spelled out rather than imported: a
# migration must not move when app code does.
OWNERS = (
    ("anime", "anime"),
    ("anime_movies", "anime-movie"),
    ("movies", "movie"),
    ("tv_shows", "tv-show"),
    ("cartoons", "cartoon"),
    ("manga", "manga"),
    ("novel", "novel"),
    ("series", "series"),
    ("franchise", "franchise"),
    ("collection", "collection"),
)


def upgrade() -> None:
    # 0. Fold away any pre-existing duplicate remark notes, oldest row wins.
    #    The notes API rejects a second singleton, but the Pull pipeline inserts
    #    Note rows straight from the sheet with no such guard, so duplicates are
    #    possible in live data. They must go before the unique index below, and
    #    before the per-table merge, which would otherwise append the column's
    #    text to every duplicate.
    op.execute(
        """
        WITH ordered AS (
            SELECT system_id, owner_type, owner_id, content,
                   row_number() OVER (PARTITION BY owner_type, owner_id
                                      ORDER BY created_at, system_id) AS rn
              FROM note
             WHERE section = 'remark'
        ),
        survivors AS (SELECT * FROM ordered WHERE rn = 1),
        extras AS (
            SELECT owner_type, owner_id,
                   string_agg(content, E'\\n\\n' ORDER BY rn) AS extra
              FROM ordered
             WHERE rn > 1
             GROUP BY owner_type, owner_id
        )
        UPDATE note n
           SET content = COALESCE(n.content, '') || E'\\n\\n' || e.extra,
               updated_at = now()
          FROM survivors s, extras e
         WHERE n.system_id = s.system_id
           AND s.owner_type = e.owner_type
           AND s.owner_id = e.owner_id
        """
    )
    op.execute(
        """
        DELETE FROM note
         WHERE system_id IN (
            SELECT system_id FROM (
                SELECT system_id,
                       row_number() OVER (PARTITION BY owner_type, owner_id
                                          ORDER BY created_at, system_id) AS rn
                  FROM note
                 WHERE section = 'remark'
            ) ranked
            WHERE rn > 1
         )
        """
    )

    for table, owner_type in OWNERS:
        # 1. Owners that already have a remark note: append the column's text
        #    under a label. Runs first; step 2's NOT EXISTS then skips these.
        op.execute(
            f"""
            UPDATE note n
               SET content = COALESCE(n.content, '')
                             || E'\\n\\noriginal remark:\\n'
                             || t.remark,
                   updated_at = now()
              FROM {table} t
             WHERE n.owner_type = '{owner_type}'
               AND n.owner_id = t.system_id
               AND n.section = 'remark'
               AND t.remark IS NOT NULL
               AND btrim(t.remark) <> ''
            """
        )

        # 2. Owners with no remark note yet: the column's text becomes one,
        #    unlabelled - there is nothing to distinguish it from.
        op.execute(
            f"""
            INSERT INTO note (system_id, owner_type, owner_id, section,
                              content, sort_index, created_at, updated_at)
            SELECT gen_random_uuid(), '{owner_type}', t.system_id, 'remark',
                   t.remark, 0, now(), now()
              FROM {table} t
             WHERE t.remark IS NOT NULL
               AND btrim(t.remark) <> ''
               AND NOT EXISTS (
                   SELECT 1 FROM note n
                    WHERE n.owner_type = '{owner_type}'
                      AND n.owner_id = t.system_id
                      AND n.section = 'remark'
               )
            """
        )

        op.execute(f"ALTER TABLE {table} DROP COLUMN remark")

    # A second remark row for one owner would make the read-side scalar
    # subquery in app/models/__init__.py raise "more than one row returned by a
    # subquery used as an expression" on EVERY read of that entity - the detail
    # page, the list page and check/remarks all break rather than degrade. The
    # singleton rule was only advisory before; now it is load-bearing, so the
    # database enforces it.
    op.execute(
        "CREATE UNIQUE INDEX ix_note_one_remark_per_owner "
        "ON note (owner_type, owner_id) WHERE section = 'remark'"
    )


def downgrade() -> None:
    """Restore the columns from the note rows, then drop those rows."""
    op.execute("DROP INDEX IF EXISTS ix_note_one_remark_per_owner")
    for table, owner_type in OWNERS:
        op.execute(f"ALTER TABLE {table} ADD COLUMN remark TEXT")
        op.execute(
            f"""
            UPDATE {table} t
               SET remark = n.content
              FROM note n
             WHERE n.owner_type = '{owner_type}'
               AND n.owner_id = t.system_id
               AND n.section = 'remark'
            """
        )
        op.execute(
            f"DELETE FROM note WHERE owner_type = '{owner_type}' "
            "AND section = 'remark'"
        )
