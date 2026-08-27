"""fold the `insert` music section into `insert_songs`

Revision ID: i1n2s3e4r5t6
Revises: m1u2s3i4c5t6
Create Date: 2026-08-27 00:00:00.000000

The notes page carried two insert-song sections. `insert` was music_track-shaped
- a list of songs with a type and a Need/Pending/Done status, like OP and ED -
and `insert_songs` was episode_name_links-shaped, pinning one song to the
episode it plays in. Two lists for one thing, and the episode is the useful half:
an insert song is identified by where it plays, not by which cut it is.

So `insert_songs` absorbs the section. It gains the same status dropdown the
other music sections offer, keeps its required episode, and takes no type - an
insert song is whatever cut plays in that episode, so "which version" has no
answer separate from the episode itself. `insert` leaves the registry, and this
revision deletes its rows: with no registry entry they would never render and
never validate.

Nothing unique is lost. m1u2s3i4c5t6 seeded `insert` from `anime.insert_ost` and
seeded `ost` from the same column, so every seeded status still has a row.

Downgrade re-seeds `insert` the way that revision did, from each anime's `ost`
row. It cannot restore a row written by hand on the notes page - a title, a
remark or a link deleted here is stored nowhere else.
"""
from typing import Sequence, Union

from alembic import op


revision: str = "i1n2s3e4r5t6"
down_revision: Union[str, Sequence[str], None] = "m1u2s3i4c5t6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Spelled out rather than imported from app/utils/note_sections.py: a migration
# must not move when app code does.
DEFAULT_KIND = "normal"


def upgrade() -> None:
    op.execute("DELETE FROM note WHERE section = 'insert'")


def downgrade() -> None:
    op.execute(
        f"""
        INSERT INTO note (system_id, owner_type, owner_id, section,
                          kind, status, sort_index, created_at, updated_at)
        SELECT gen_random_uuid(), 'anime', n.owner_id, 'insert',
               '{DEFAULT_KIND}', n.status, 0,
               (now() AT TIME ZONE 'Asia/Taipei'),
               (now() AT TIME ZONE 'Asia/Taipei')
          FROM (
            SELECT DISTINCT ON (owner_id) owner_id, status
              FROM note
             WHERE owner_type = 'anime'
               AND section = 'ost'
               AND status IS NOT NULL
             ORDER BY owner_id, sort_index, created_at
          ) n
         WHERE NOT EXISTS (
             SELECT 1 FROM note x
              WHERE x.owner_type = 'anime'
                AND x.owner_id = n.owner_id
                AND x.section = 'insert'
         )
        """
    )
