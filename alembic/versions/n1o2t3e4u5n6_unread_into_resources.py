"""fold the unread note section into resources

Revision ID: n1o2t3e4u5n6
Revises: r1e2m3a4r5k6
Create Date: 2026-08-25 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'n1o2t3e4u5n6'
down_revision: Union[str, Sequence[str], None] = 'r1e2m3a4r5k6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema.

    `unread` and `resources` were the same section twice: both `name_links`,
    both on every owner, and nothing in a row said which list it belonged to.
    The registry entry is gone, so its rows move to `resources` rather than
    becoming invisible - a section key no page renders is data loss in
    everything but name.

    Both shapes read the same three columns (`title`, `links`, `content`), so
    the move is a relabel; no column is touched.
    """
    # Land the moved rows after each owner's existing resources instead of
    # interleaving on a sort_index that was only ever ordered within `unread`.
    # A NULL sort_index sorts as 0 so an unordered row still lands past the
    # block it is joining.
    op.execute(
        """
        UPDATE note AS n
        SET section = 'resources',
            sort_index = COALESCE(n.sort_index, 0) + COALESCE(m.top, 0) + 1
        FROM (
            SELECT owner_type, owner_id, MAX(COALESCE(sort_index, 0)) AS top
            FROM note
            WHERE section = 'resources'
            GROUP BY owner_type, owner_id
        ) AS m
        WHERE n.section = 'unread'
          AND n.owner_type IS NOT DISTINCT FROM m.owner_type
          AND n.owner_id IS NOT DISTINCT FROM m.owner_id
        """
    )
    # Owners that had unread rows but no resources at all get no match above,
    # so relabel what is left with its ordering untouched.
    op.execute("UPDATE note SET section = 'resources' WHERE section = 'unread'")


def downgrade() -> None:
    """Downgrade schema.

    Deliberately a no-op. Once the two lists are merged, no column records
    which resources used to be unread, so a downgrade could only guess. The
    rows survive under `resources`; re-splitting them is a manual job.
    """
    pass
