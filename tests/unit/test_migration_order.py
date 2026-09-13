"""
The revision chain has one head, and one hazard worth remembering.

**A data migration that queries live ORM models is position-sensitive.**
SQLAlchemy selects every column the model declares, so such a revision can only
run once every one of those columns exists in the database. `pb2m3i4g5r8`
called `backfill_publishers` and `pid1a2b3c4d5` added `public_id` to
`publisher`; while the backfill sorted first, a database stopped between the
two could never reach head - the backfill's `SELECT publisher.public_id`
failed with UndefinedColumn. Both live databases were already past that
window, so it only appeared on a machine restoring an older one.

A test used to pin that specific pair. It is gone because the pair is: the
chain was squashed onto `4832c83905a3` and those revisions now live in
`alembic/versions_archive/`, out of the chain and unable to run. Keeping an
assertion about revisions Alembic can no longer resolve would have failed for
the wrong reason and taught nobody anything.

The hazard is not gone, though - it belongs to the NEXT data migration that
imports from `app.models` instead of freezing the columns it needs. The
defence is to freeze them, the way `4832c83905a3` freezes its sequence names
and trigger SQL rather than importing them.

What the chain as a whole must still satisfy is checked by
`tests/api/test_migrations_build_the_schema.py`, which upgrades an empty
database and compares the result to the models.
"""

from alembic.config import Config
from alembic.script import ScriptDirectory


def test_the_chain_still_has_a_single_head():
    script = ScriptDirectory.from_config(Config("alembic.ini"))
    heads = script.get_heads()
    assert len(heads) == 1, f"expected one head, found {heads}"


def test_the_archived_revisions_are_out_of_the_chain():
    """The squash is only real if Alembic cannot see the old chain.

    A stray revision left in `alembic/versions/` would give the chain a second
    root or a second head, and `upgrade head` would start replaying the very
    revisions that could not build a database.
    """
    script = ScriptDirectory.from_config(Config("alembic.ini"))
    revisions = list(script.walk_revisions())

    bases = [rev.revision for rev in revisions if rev.down_revision is None]
    assert bases == ["4832c83905a3"], f"expected one base, found {bases}"
    assert len(revisions) < 10, (
        f"{len(revisions)} revisions in the chain - the archive is meant to "
        "hold the pre-squash history, so something has been moved back"
    )
