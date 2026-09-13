"""The media supertable's shape. Pure metadata - no database."""

from app import models


def test_media_table_exists_with_expected_columns():
    cols = {c.name for c in models.Media.__table__.columns}
    assert cols == {
        "system_id", "media_type", "public_id", "display_name",
        "cover_image_file", "franchise_id", "series_id",
        "created_at", "updated_at",
    }


def test_media_type_and_display_name_are_not_nullable():
    t = models.Media.__table__
    assert t.c.media_type.nullable is False
    assert t.c.display_name.nullable is False
    assert t.c.public_id.nullable is False


def test_media_carries_both_unique_constraints_by_name():
    names = {c.name for c in models.Media.__table__.constraints if c.name}
    assert "uq_media_id_type" in names
    assert "uq_media_type_public_id" in names
