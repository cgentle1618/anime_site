"""The user_media_list table's shape. Pure metadata - no database."""

from app import models


def test_user_media_list_has_exactly_the_contracted_columns():
    cols = {c.name for c in models.UserMediaList.__table__.columns}
    assert cols == {
        "system_id", "user_id", "media_id", "status",
        "my_rating", "completed_at", "my_watch_day",
        "ep_fin", "vol_fin", "vol_fin_page", "ch_fin",
        "arc_fin", "ch_fin_in_arc", "progress_display", "issue_fin",
        "created_at", "updated_at",
    }


def test_the_three_identity_columns_are_not_nullable():
    t = models.UserMediaList.__table__
    assert t.c.user_id.nullable is False
    assert t.c.media_id.nullable is False
    assert t.c.status.nullable is False


def test_every_progress_column_is_nullable():
    """A game row leaves almost all of them null; that is the accepted shape."""
    t = models.UserMediaList.__table__
    for name in (
        "my_rating", "completed_at", "my_watch_day", "ep_fin", "vol_fin",
        "vol_fin_page", "ch_fin", "arc_fin", "ch_fin_in_arc",
        "progress_display", "issue_fin",
    ):
        assert t.c[name].nullable is True, name


def test_the_unique_constraint_and_both_indexes_are_named():
    t = models.UserMediaList.__table__
    assert "uq_user_media" in {c.name for c in t.constraints if c.name}
    index_names = {i.name for i in t.indexes}
    assert "ix_user_media_list_user_status" in index_names
    assert "ix_user_media_list_media" in index_names


def test_both_foreign_keys_cascade():
    t = models.UserMediaList.__table__
    targets = {
        list(fk.columns)[0].name: (fk.elements[0].target_fullname, fk.ondelete)
        for fk in t.foreign_key_constraints
    }
    assert targets["user_id"] == ("users.id", "CASCADE")
    assert targets["media_id"] == ("media.system_id", "CASCADE")
