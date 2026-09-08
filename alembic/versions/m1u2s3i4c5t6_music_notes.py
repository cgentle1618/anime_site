"""add note.status and fold anime op/ed/insert_ost into music note rows

Revision ID: m1u2s3i4c5t6
Revises: cv1d2e3f4a5b
Create Date: 2026-08-27 00:00:00.000000

`anime.op`, `anime.ed` and `anime.insert_ost` held one Need/Pending/Done value
per entry - one status for every OP a work ever had. The notes page now carries
four music sections (`op`, `ed`, `insert`, `ost`) whose rows each name one song,
so the status belongs on a row rather than on the entry.

`note.status` is the second dropdown those rows need. `note.kind` was already
spoken for by the song's type (normal / different version / all inclusive
version), and one row needs both.

The data moves column-by-column into one row per value. `insert_ost` was a
single column covering two things that are now separate sections, and nothing in
it says which; it therefore seeds BOTH `insert` and `ost` with the same status,
to be split by hand afterwards.

Downgrade restores the three columns from the rows this revision would have
created, then deletes only those - a row carrying a title, a remark, a link or a
non-default type was written by hand on the notes page and has no column to
return to, so it stays. A Google Sheets backup taken before this runs will not
restore the columns either: the anime tab loses them here, so this revision is
the authority for the move.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "m1u2s3i4c5t6"
down_revision: Union[str, Sequence[str], None] = "cv1d2e3f4a5b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# (anime column, note section). insert_ost appears twice on purpose: the one
# column seeds both of the sections that replaced it.
MOVES = (
    ("op", "op"),
    ("ed", "ed"),
    ("insert_ost", "insert"),
    ("insert_ost", "ost"),
)

# Spelled out rather than imported from app/utils/note_sections.py: a migration
# must not move when app code does.
DEFAULT_KIND = "normal"


def upgrade() -> None:
    op.add_column("note", sa.Column("status", sa.String(), nullable=True))

    for column, section in MOVES:
        op.execute(
            f"""
            INSERT INTO note (system_id, owner_type, owner_id, section,
                              kind, status, sort_index, created_at, updated_at)
            SELECT gen_random_uuid(), 'anime', a.system_id, '{section}',
                   '{DEFAULT_KIND}', a.{column}, 0,
                   (now() AT TIME ZONE 'Asia/Taipei'),
                   (now() AT TIME ZONE 'Asia/Taipei')
              FROM anime a
             WHERE a.{column} IS NOT NULL
               AND btrim(a.{column}) <> ''
               -- Re-running after a partial upgrade must not double the rows.
               AND NOT EXISTS (
                   SELECT 1 FROM note n
                    WHERE n.owner_type = 'anime'
                      AND n.owner_id = a.system_id
                      AND n.section = '{section}'
               )
            """
        )

    for column in ("op", "ed", "insert_ost"):
        op.execute(f"ALTER TABLE anime DROP COLUMN {column}")


def downgrade() -> None:
    for column in ("op", "ed", "insert_ost"):
        op.execute(f"ALTER TABLE anime ADD COLUMN {column} VARCHAR")

    # insert_ost is restored from `insert`, falling back to `ost`: upgrade seeded
    # both from the one column, and after a hand split `insert` is the closer
    # reading of what the column meant.
    for column, sections in (
        ("op", ("op",)),
        ("ed", ("ed",)),
        ("insert_ost", ("insert", "ost")),
    ):
        in_list = ", ".join(f"'{s}'" for s in sections)
        order = ", ".join(
            f"(n.section = '{s}')::int DESC" for s in sections
        )
        op.execute(
            f"""
            UPDATE anime a
               SET {column} = sub.status
              FROM (
                SELECT DISTINCT ON (n.owner_id) n.owner_id, n.status
                  FROM note n
                 WHERE n.owner_type = 'anime'
                   AND n.section IN ({in_list})
                   AND n.status IS NOT NULL
                 ORDER BY n.owner_id, {order}, n.sort_index, n.created_at
              ) sub
             WHERE a.system_id = sub.owner_id
            """
        )

    # Only the rows this revision creates go back. Anything with a name, a
    # remark, a link or a non-default type was written on the notes page and is
    # stored nowhere else, so deleting it would destroy content.
    op.execute(
        f"""
        DELETE FROM note
         WHERE owner_type = 'anime'
           AND section IN ('op', 'ed', 'insert', 'ost')
           AND kind = '{DEFAULT_KIND}'
           AND status IS NOT NULL
           AND title IS NULL
           AND content IS NULL
           AND links IS NULL
        """
    )

    op.drop_column("note", "status")
