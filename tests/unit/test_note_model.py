"""Unit tests for the Note ORM model."""

from app import models


def test_column_order_is_the_sheet_order():
    # format_model_for_sheet walks __table__.columns in declaration order, so
    # this order is also the Google Sheets column order. Changing it silently
    # reorders the sheet.
    assert [c.name for c in models.Note.__table__.columns] == [
        "system_id",
        "owner_type",
        "owner_id",
        "section",
        "episode",
        "kind",
        "title",
        "content",
        "links",
        "sort_index",
        "created_at",
        "updated_at",
    ]


def test_owner_is_fk_less():
    # No single foreign key can span the ten owner tables.
    assert not models.Note.__table__.c.owner_id.foreign_keys


def test_lookup_index_exists():
    names = {ix.name for ix in models.Note.__table__.indexes}
    assert "ix_note_owner_section" in names
