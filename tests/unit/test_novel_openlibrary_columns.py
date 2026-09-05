"""
The two Open Library columns on novel, and their Sheets round-trip.

openlibrary_id is a String, not an Integer like comicvine_id: the trailing
letter is what distinguishes a work (OL...W) from an edition (OL...M) or an
author (OL...A), so the digits alone would lose the only signal that the id
names the right kind of thing.
"""

import uuid

from app import models
from app.schemas.novel import NovelCreate
from app.utils.formatter import parse_novel_from_sheet


class TestNovelOpenLibraryColumns:
    def test_model_accepts_both_columns(self, db_session):
        novel = models.Novel(
            system_id=uuid.uuid4(),
            novel_name_en="The Final Empire",
            openlibrary_link="https://openlibrary.org/works/OL5738148W/The_Final_Empire",
            openlibrary_id="OL5738148W",
        )
        db_session.add(novel)
        db_session.flush()
        assert novel.openlibrary_id == "OL5738148W"

    def test_columns_default_to_none(self, db_session):
        novel = models.Novel(system_id=uuid.uuid4(), novel_name_en="Untitled")
        db_session.add(novel)
        db_session.flush()
        assert novel.openlibrary_link is None
        assert novel.openlibrary_id is None

    def test_schema_accepts_both_columns(self):
        payload = NovelCreate(
            novel_name_en="The Final Empire",
            openlibrary_link="https://openlibrary.org/works/OL5738148W",
            openlibrary_id="OL5738148W",
        )
        assert payload.openlibrary_id == "OL5738148W"

    def test_schema_defaults_both_to_none(self):
        payload = NovelCreate(novel_name_en="Untitled")
        assert payload.openlibrary_link is None
        assert payload.openlibrary_id is None


class TestParseNovelFromSheet:
    def test_reads_both_columns_from_a_sheet_row(self):
        parsed = parse_novel_from_sheet(
            {
                "novel_name_en": "The Final Empire",
                "openlibrary_link": "https://openlibrary.org/works/OL5738148W",
                "openlibrary_id": "OL5738148W",
            }
        )
        assert parsed["openlibrary_link"] == "https://openlibrary.org/works/OL5738148W"
        assert parsed["openlibrary_id"] == "OL5738148W"

    def test_blank_cells_become_none(self):
        parsed = parse_novel_from_sheet(
            {"novel_name_en": "Untitled", "openlibrary_link": "", "openlibrary_id": ""}
        )
        assert parsed["openlibrary_link"] is None
        assert parsed["openlibrary_id"] is None
