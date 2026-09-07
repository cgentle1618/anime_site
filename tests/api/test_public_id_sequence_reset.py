"""After a Pull, the next insert must not collide with a restored public_id."""

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app import models
from app.services.pipelines.pull import resync_public_id_sequence


def test_insert_after_a_higher_restored_id_does_not_collide(db_session):
    """Simulates the shape of a Pull: rows arrive carrying their own ids,
    above whatever the local sequence had reached."""
    restored = models.Anime(anime_name_en="PID Restored", public_id=9000)
    db_session.add(restored)
    db_session.flush()

    resync_public_id_sequence(db_session, models.Anime)

    fresh = models.Anime(anime_name_en="PID Fresh")
    db_session.add(fresh)
    db_session.flush()
    assert fresh.public_id > 9000


def test_resync_is_safe_on_an_empty_table(db_session):
    """setval on max(NULL) would error; an empty table must be a no-op."""
    db_session.query(models.WatchOrderList).delete()
    db_session.flush()
    resync_public_id_sequence(db_session, models.WatchOrderList)

    # ck_watch_order_list_single_owner wants exactly one owner set.
    owner = models.Franchise(franchise_name_en="PID Owner")
    db_session.add(owner)
    db_session.flush()

    row = models.WatchOrderList(list_name="PID First", franchise_id=owner.system_id)
    db_session.add(row)
    db_session.flush()
    assert row.public_id > 0


def test_resync_ignores_a_model_without_public_id(db_session):
    """Pull walks every tab; the ones with no public_id must not error."""
    resync_public_id_sequence(db_session, models.MediaRelation)


def test_two_rows_may_swap_public_ids_inside_one_transaction(db_session):
    """
    The collision a Pull actually hits.

    Pull upserts by system_id and restores a whole tab in one transaction, so
    a sheet row can carry a public_id that a *different* local row still holds
    at that moment. The end state is unique; only the intermediate one is not.
    An immediately-checked constraint aborts the restore partway through; a
    deferred one checks at commit and lets the permutation through.

    The two writes are flushed separately on purpose: that pins the duplicate
    into a real intermediate state rather than leaving it to SQLAlchemy's
    choice of statement order.
    """
    left = models.Anime(anime_name_en="PID Swap Left")
    right = models.Anime(anime_name_en="PID Swap Right")
    db_session.add_all([left, right])
    db_session.flush()
    a, b = left.public_id, right.public_id

    left.public_id = b  # duplicates right, which still holds b
    db_session.flush()
    right.public_id = a
    db_session.flush()

    # The fixture commits into a SAVEPOINT, which does not check a DEFERRED
    # constraint. This is what a real COMMIT would do.
    db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
    assert (left.public_id, right.public_id) == (b, a)


def test_a_genuinely_duplicated_public_id_is_still_rejected(db_session):
    """Deferring moves the check to commit; it does not abandon it."""
    one = models.Anime(anime_name_en="PID Dup One")
    two = models.Anime(anime_name_en="PID Dup Two")
    db_session.add_all([one, two])
    db_session.flush()

    two.public_id = one.public_id
    db_session.flush()

    with pytest.raises(IntegrityError):
        db_session.execute(text("SET CONSTRAINTS ALL IMMEDIATE"))
