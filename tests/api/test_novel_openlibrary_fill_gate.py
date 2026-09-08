"""
The Open Library fill gate for novels.

Deliberately narrower than has_missing_values_novel: only the three things
Open Library can actually supply count. Requiring serialization_status or
mal_rating here would mark every such entry permanently incomplete and
re-request it forever.
"""

import uuid

from app import models
from app.services.domain import has_missing_values_novel_openlibrary
from app.services.domain.credits import replace_credits


def make_novel(db_session, **kwargs):
    defaults = dict(
        system_id=uuid.uuid4(),
        novel_name_en="Mistborn",
        openlibrary_id="OL5738148W",
        release_date="2006",
        cover_image_file="cover.jpg",
    )
    defaults.update(kwargs)
    novel = models.Novel(**defaults)
    db_session.add(novel)
    db_session.flush()
    return novel


def complete(db_session, **kwargs):
    """A novel with nothing left for Open Library to fill."""
    novel = make_novel(db_session, **kwargs)
    replace_credits(db_session, "novel", novel.system_id, "author", ["Brandon Sanderson"])
    return novel


class TestHasMissingValuesNovelOpenlibrary:
    def test_false_when_everything_is_present(self, db_session):
        novel = complete(db_session)
        assert has_missing_values_novel_openlibrary(db_session, novel) is False

    def test_true_when_the_release_date_is_missing(self, db_session):
        novel = complete(db_session, release_date=None)
        assert has_missing_values_novel_openlibrary(db_session, novel) is True

    def test_true_when_the_cover_is_missing(self, db_session):
        novel = complete(db_session, cover_image_file=None)
        assert has_missing_values_novel_openlibrary(db_session, novel) is True

    def test_true_when_the_cover_is_blank_whitespace(self, db_session):
        novel = complete(db_session, cover_image_file="   ")
        assert has_missing_values_novel_openlibrary(db_session, novel) is True

    def test_true_when_there_is_no_author_credit(self, db_session):
        novel = make_novel(db_session)
        assert has_missing_values_novel_openlibrary(db_session, novel) is True

    def test_ignores_fields_open_library_never_supplies(self, db_session):
        """serialization_status, end_date, mal_rating and mal_rank all blank,
        yet the entry is complete as far as Open Library is concerned."""
        novel = complete(
            db_session,
            serialization_status=None,
            end_date=None,
            mal_rating=None,
            mal_rank=None,
            vol_total_original=None,
            ch_total=None,
        )
        assert has_missing_values_novel_openlibrary(db_session, novel) is False
