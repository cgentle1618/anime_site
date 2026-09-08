"""
Ordering guard for the data migration that runs on live ORM models.

`pb2m3i4g5r8` is data-only: it calls `backfill_publishers`, which queries
`app.models` rather than a frozen snapshot of the schema. That makes it
sensitive to its position in the chain -- SQLAlchemy selects every column the
model declares, so the revision can only run once every column on those models
exists in the database.

`pid1a2b3c4d5` adds `public_id` to `publisher` (and sixteen other tables). When
it ran *after* the backfill, a database stopped between the two revisions could
never reach head: the backfill's `SELECT publisher.public_id ...` failed with
UndefinedColumn. Both live databases were already past that window, so it only
appeared on a machine restoring an older one.

This test pins the ordering that keeps the window closed.
"""

from alembic.config import Config
from alembic.script import ScriptDirectory

# The data migration that queries live ORM models, and the schema migration
# that adds a column to a table those models map.
ORM_BACKFILL = "pb2m3i4g5r8"
ADDS_PUBLIC_ID = "pid1a2b3c4d5"


def _script():
    return ScriptDirectory.from_config(Config("alembic.ini"))


def _ancestors(script, revision):
    """Every revision that must have run before `revision`."""
    return {rev.revision for rev in script.iterate_revisions(revision, "base")}


def test_public_id_exists_before_the_publisher_backfill_reads_it():
    script = _script()
    assert ADDS_PUBLIC_ID in _ancestors(script, ORM_BACKFILL), (
        f"{ORM_BACKFILL} calls backfill_publishers, which SELECTs every column "
        f"app.models.Publisher declares -- including public_id, added by "
        f"{ADDS_PUBLIC_ID}. It must run first or the upgrade dies with "
        "UndefinedColumn on any database stopped between the two."
    )


def test_the_chain_still_has_a_single_head():
    assert len(_script().get_heads()) == 1
