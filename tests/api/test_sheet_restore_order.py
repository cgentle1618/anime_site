"""
SHEET_TABS order is the RESTORE order, and it is a contract now.

Steps 0-2 replaced the FK-less (media_type, entry_id) pairs with real foreign
keys. An out-of-order restore used to leave quiet orphans; it now raises a
ForeignKeyViolation at the tab's commit and rolls back every row on that tab.
For User Media List that is every user's entire list.

Metadata only; no database.
"""

from app.services.pipelines.tabs import TAB_NAMES

MEDIA_TABS = [
    "Anime", "Anime Movie", "Movies", "TV Shows", "Cartoons",
    "Manga", "Novel", "Comic", "Game",
]


def _at(name):
    assert name in TAB_NAMES, f"no {name!r} tab is registered"
    return TAB_NAMES.index(name)


def test_users_is_first():
    # Nothing points at users, and steps 3 and 5 add user_id to plan_next,
    # seasonal, note, meme and quote. First now means nothing moves later.
    assert _at("Users") == 0


def test_media_precedes_every_media_tab():
    # step 0: each detail table's system_id is an FK to media.system_id.
    for tab in MEDIA_TABS:
        assert _at("Media") < _at(tab), f"Media must precede {tab}"


def test_the_tiers_precede_media():
    # media.franchise_id and media.series_id are real FKs.
    assert _at("Collection") < _at("Franchise") < _at("Series") < _at("Media")


def test_user_media_list_follows_both_of_its_parents():
    # user_media_list.user_id -> users.id, .media_id -> media.system_id.
    assert _at("Users") < _at("User Media List")
    assert _at("Media") < _at("User Media List")


def test_user_media_list_follows_every_media_tab():
    """
    Not required by a foreign key - Media alone satisfies those - but a list
    row is meaningless without the entry it annotates, and a human reading the
    sheet during an environment switch expects it beside the catalogue.
    """
    for tab in MEDIA_TABS:
        assert _at(tab) < _at("User Media List")


def test_plan_next_and_seasonal_follow_users():
    """Both carry a NOT NULL user_id since step 3."""
    assert _at("Users") < _at("Plan Next")
    assert _at("Users") < _at("Seasonal")


def test_the_registry_has_no_duplicate_names():
    assert len(set(TAB_NAMES)) == len(TAB_NAMES)
