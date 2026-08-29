"""
Unit tests for the expanded Series model.

Pure model tests - no database session needed, since display_name,
names_dict and _name_fields are all computed from instance attributes.
"""

from app.models.franchise import Series


class TestSeriesDisplayName:
    """Fallback order mirrors Franchise: CN -> EN -> Alt -> roman -> JP."""

    def test_prefers_cn(self):
        s = Series(series_name_cn="中文", series_name_en="English")
        assert s.display_name == "中文"

    def test_falls_back_to_en(self):
        s = Series(series_name_en="English", series_name_alt="Alt")
        assert s.display_name == "English"

    def test_falls_back_to_alt(self):
        s = Series(series_name_alt="Alt", series_name_roman="Roman")
        assert s.display_name == "Alt"

    def test_falls_back_to_roman(self):
        s = Series(series_name_roman="Roman", series_name_jp="日本語")
        assert s.display_name == "Roman"

    def test_falls_back_to_jp(self):
        s = Series(series_name_jp="日本語")
        assert s.display_name == "日本語"

    def test_all_empty_returns_empty_string(self):
        assert Series().display_name == ""


class TestSeriesNamesDict:
    def test_carries_all_five_names(self):
        s = Series(
            series_name_en="EN",
            series_name_cn="CN",
            series_name_roman="Roman",
            series_name_jp="JP",
            series_name_alt="Alt",
        )
        assert s.names_dict == {
            "en": "EN",
            "cn": "CN",
            "roman": "Roman",
            "jp": "JP",
            "alt": "Alt",
        }


class TestSeriesNameFields:
    def test_covers_all_five_name_columns(self):
        assert Series._name_fields == [
            "series_name_en",
            "series_name_cn",
            "series_name_roman",
            "series_name_jp",
            "series_name_alt",
        ]

    def test_get_all_names_includes_roman_and_jp(self):
        s = Series(series_name_roman="Roman", series_name_jp="JP")
        assert s.get_all_names() == {"roman", "jp"}


class TestSeriesNewColumns:
    def test_expected_columns_exist(self):
        cols = set(Series.__table__.columns.keys())
        for name in (
            "series_name_roman",
            "series_name_jp",
            "my_rating",
            "series_expectation",
            "cover_entry_id",
            "created_at",
            "updated_at",
        ):
            assert name in cols

    def test_excluded_franchise_columns_are_absent(self):
        cols = set(Series.__table__.columns.keys())
        for name in (
            "franchise_type",
            "collection_id",
            "type_covers",
            "type_slots",
            "watch_next_group",
        ):
            assert name not in cols

    def test_sheet_column_order(self):
        """Declaration order IS the Google Sheets column order for the Series tab."""
        assert [c.name for c in Series.__table__.columns] == [
            "system_id",
            "franchise_id",
            "series_name_en",
            "series_name_cn",
            "series_name_roman",
            "series_name_jp",
            "series_name_alt",
            "my_rating",
            "series_expectation",
            "cover_entry_id",
            "size_group_derived",
            "size_group_manual",
            "created_at",
            "updated_at",
        ]
