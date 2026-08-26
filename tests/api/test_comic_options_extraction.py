"""Options extraction from Comic entries."""

from app.models.comic import Comic
from app.models.system import SystemOption
from app.services.domain.options_extraction import extract_system_options_from_comic


def _values(db, category):
    return {
        o.option_value
        for o in db.query(SystemOption).filter(SystemOption.category == category).all()
    }


class TestExtractSystemOptionsFromComic:
    def test_extracts_creator_and_publisher_fields(self, db_session):
        db_session.add(
            Comic(
                comic_name_en="Amazing Spider-Man",
                writer="Nick Spencer",
                artist="Ryan Ottley",
                publisher="Marvel",
            )
        )
        db_session.commit()

        extract_system_options_from_comic(db_session)

        assert "Nick Spencer" in _values(db_session, "Comic Writer")
        assert "Ryan Ottley" in _values(db_session, "Comic Artist")
        assert "Marvel" in _values(db_session, "Comic Publisher")

    def test_splits_comma_joined_events(self, db_session):
        db_session.add(
            Comic(comic_name_en="ASM", events="Hunted, Sinister War")
        )
        db_session.commit()

        extract_system_options_from_comic(db_session)

        events = _values(db_session, "Comic Event")
        assert "Hunted" in events
        assert "Sinister War" in events

    def test_does_not_duplicate_existing_options(self, db_session):
        db_session.add(SystemOption(category="Comic Publisher", option_value="Marvel"))
        db_session.add(Comic(comic_name_en="ASM", publisher="Marvel"))
        db_session.commit()

        extract_system_options_from_comic(db_session)

        marvels = [
            o
            for o in db_session.query(SystemOption)
            .filter(SystemOption.category == "Comic Publisher")
            .all()
            if o.option_value == "Marvel"
        ]
        assert len(marvels) == 1
