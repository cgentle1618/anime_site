"""public_id must ride in the sheet.

An id regenerated on Pull would silently change every URL when work moves
between the company and home machines, so the column is backed up like any
other and restored unchanged.
"""

from app.services.pipelines.tabs import SHEET_TABS, TAB_PARSERS

PUBLIC_ID_TABS = {
    "Anime", "Anime Movie", "Movies", "TV Shows", "Cartoons", "Manga",
    "Novel", "Comic", "Game", "Collection", "Franchise", "Series",
    "Person", "Studio", "Publisher", "Character", "Watch Order List",
}


def test_public_id_is_never_dropped_from_a_tab():
    """drop_columns is how a column is kept out of the sheet; public_id must
    not be in any of them."""
    for tab in SHEET_TABS:
        assert "public_id" not in (tab.drop_columns or ()), tab.name


def test_every_public_id_tab_has_the_column_in_its_backup_header():
    """Backup derives headers from __table__.columns, so this is really a
    check that the column landed on the model."""
    by_name = {tab.name: tab for tab in SHEET_TABS}
    for name in PUBLIC_ID_TABS:
        tab = by_name[name]
        columns = {c.name for c in tab.model.__table__.columns}
        assert "public_id" in columns, name


def test_parsers_carry_public_id_through():
    for name in PUBLIC_ID_TABS:
        parser = TAB_PARSERS[name]
        parsed = parser({"public_id": "47"})
        assert parsed.get("public_id") == 47, name


def test_parsers_omit_public_id_when_the_sheet_predates_the_column():
    """A sheet written before this change has no public_id column. Restoring
    it must fall through to the sequence default, not write a NULL."""
    for name in PUBLIC_ID_TABS:
        parser = TAB_PARSERS[name]
        parsed = parser({})
        assert "public_id" not in parsed, name
