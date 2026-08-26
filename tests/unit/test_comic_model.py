"""
Unit tests for the Comic model.

Comic is the only entry type whose display name leads with EN rather than CN,
because Western comics are known by their English titles.
"""

from app.models.comic import Comic


class TestComicDisplayName:
    """Fallback order is EN -> CN -> Alt."""

    def test_prefers_en(self):
        c = Comic(comic_name_en="Amazing Spider-Man", comic_name_cn="蜘蛛人")
        assert c.display_name == "Amazing Spider-Man"

    def test_falls_back_to_cn(self):
        c = Comic(comic_name_cn="蜘蛛人", comic_name_alt="ASM")
        assert c.display_name == "蜘蛛人"

    def test_falls_back_to_alt(self):
        c = Comic(comic_name_alt="ASM")
        assert c.display_name == "ASM"

    def test_empty_when_no_names(self):
        c = Comic()
        assert c.display_name == ""

    def test_ignores_whitespace_only_names(self):
        c = Comic(comic_name_en="   ", comic_name_cn="蜘蛛人")
        assert c.display_name == "蜘蛛人"


class TestComicColumns:
    def test_tablename(self):
        assert Comic.__tablename__ == "comic"

    def test_name_fields_registered_for_fallback_mixin(self):
        assert Comic._name_fields == [
            "comic_name_en",
            "comic_name_cn",
            "comic_name_alt",
        ]

    def test_has_no_external_rating_columns(self):
        # Comics are manual-entry: nothing would ever populate these.
        cols = {c.name for c in Comic.__table__.columns}
        assert not {c for c in cols if c.startswith("mal_") or c.startswith("anilist_")}

    def test_has_no_progress_display_column(self):
        cols = {c.name for c in Comic.__table__.columns}
        assert "progress_display" not in cols

    def test_issue_columns_exist(self):
        cols = {c.name for c in Comic.__table__.columns}
        assert {"issue_total", "issue_fin"} <= cols
