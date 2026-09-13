"""Unit tests for the Note ORM model."""

from app import models


def test_column_order_is_the_sheet_order():
    # format_model_for_sheet walks __table__.columns in declaration order, so
    # this order is also the Google Sheets column order. Changing it silently
    # reorders the sheet.
    assert [c.name for c in models.Note.__table__.columns] == [
        "system_id",
        "media_id",
        "collection_id",
        "franchise_id",
        "series_id",
        "author_id",
        "section",
        "locator",
        "kind",
        "status",
        "title",
        "content",
        "links",
        "entries",
        "sort_index",
        "created_at",
        "updated_at",
    ]


def test_every_owner_column_is_a_real_foreign_key():
    # No single foreign key can span the twelve owner tables, so there are
    # four, and a CHECK requires exactly one of them per row.
    for name in ("media_id", "collection_id", "franchise_id", "series_id"):
        assert models.Note.__table__.c[name].foreign_keys
    checks = {
        c.name
        for c in models.Note.__table__.constraints
        if c.__class__.__name__ == "CheckConstraint"
    }
    assert "ck_note_one_owner" in checks


def test_lookup_index_exists():
    names = {ix.name for ix in models.Note.__table__.indexes}
    assert "ix_note_owner_section" in names
