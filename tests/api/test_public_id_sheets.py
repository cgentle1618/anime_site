"""public_id must ride in the sheet.

An id regenerated on Pull would silently change every URL when work moves
between the company and home machines, so the column is backed up like any
other and restored unchanged.
"""

from app.services.pipelines.tabs import SHEET_TABS, TAB_PARSERS

# The eight entities that still hold public_id on their own table, so it is
# their own tab that must carry it.
OWN_ID_TABS = {
    "Collection", "Franchise", "Series",
    "Person", "Studio", "Publisher", "Character", "Watch Order List",
}

# The nine media types keep a public_id, but it lives on `media` now, so it
# rides on the Media tab instead of on each entry tab. The guarantee is
# unchanged - the id still travels, and is still restored unchanged - only its
# seat in the sheet moved.
MEDIA_TABS = {
    "Anime", "Anime Movie", "Movies", "TV Shows", "Cartoons", "Manga",
    "Novel", "Comic", "Game",
}

PUBLIC_ID_TABS = OWN_ID_TABS | {"Media"}


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


def test_the_media_tab_carries_the_nine_entry_tabs_ids():
    """
    The entry tabs no longer carry public_id - it moved to `media`. That is
    only safe because the Media tab does carry it, and restores before them.
    """
    by_name = {tab.name: tab for tab in SHEET_TABS}
    names = [tab.name for tab in SHEET_TABS]
    for name in MEDIA_TABS:
        columns = {c.name for c in by_name[name].model.__table__.columns}
        assert "public_id" not in columns, name
        assert names.index("Media") < names.index(name), name


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


def test_parsers_omit_public_id_when_the_cell_is_blank():
    """A row a human adds to the sheet by hand has the column but an empty
    cell. Emitting public_id=None there would abort the whole Pull on the
    NOT NULL constraint; omitting the key instead renumbers just that row."""
    for name in PUBLIC_ID_TABS:
        parser = TAB_PARSERS[name]
        parsed = parser({"public_id": ""})
        assert "public_id" not in parsed, name
