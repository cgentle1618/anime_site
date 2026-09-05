"""Unit tests for the credit role / tag field vocabulary.

Four tests from the previous version are deleted rather than adapted, because
they assert the two-vocabulary design this change removes:
  test_studio_role_implies_no_person_role      (person_role field is gone)
  test_person_roles_all_come_from_credit_roles (PERSON_ROLES derives from target)
  test_two_manga_author_credits_share_one_person_role  (the keys are gone)
  test_director_scope_follows_media_type       (director_scope_for is gone)
"""

import pytest

from app.utils import credit_roles as cr
from app.utils.media_resolver import MEDIA_TYPE_KEYS

# Every (media_type, role) pair that has ever had a legacy sheet header, and
# the header it must keep producing. Written out rather than derived from
# LEGACY_SHEET_COLUMN so that a wrong edit to that dict cannot make this test
# agree with it.
EXPECTED_HEADERS = {
    ("anime", "studio"): "studio",
    ("anime", "director"): "director",
    ("anime", "producer"): "producer",
    ("anime", "composer"): "music",
    ("anime", "publisher_tw"): "distributor_tw",
    ("anime", "genre_main"): "genre_main",
    ("anime", "genre_sub"): "genre_sub",
    ("anime-movie", "studio"): "studio",
    ("anime-movie", "director"): "director",
    ("movie", "director"): "director",
    ("tv-show", "source_official"): "source_official",
    ("cartoon", "source_official"): "source_official",
    ("manga", "author"): "author_plot",
    ("manga", "illustrator"): "author_draw",
    ("manga", "publisher_tw"): "publisher_tw",
    ("novel", "author"): "author",
    ("novel", "illustrator"): "illustrator",
    ("novel", "publisher_tw"): "publisher_tw",
    ("comic", "author"): "writer",
    ("comic", "illustrator"): "artist",
    ("comic", "comic_publisher"): "publisher",
    ("comic", "comic_imprint"): "imprint",
    ("comic", "comic_continuity"): "continuity",
    ("comic", "comic_era"): "era",
    ("comic", "comic_event"): "events",
    ("comic", "publisher_tw"): "publisher_tw",
}


# ---------------------------------------------------------------------------
# The collapsed vocabulary
# ---------------------------------------------------------------------------


def test_the_vocabulary_is_seven_entries():
    """
    Was six before the seiyuu role was added (Task 1 of the seiyuu/character
    work). Renamed from test_the_vocabulary_is_six_entries.
    """
    assert set(cr.CREDIT_ROLES) == {
        "studio",
        "director",
        "producer",
        "composer",
        "author",
        "illustrator",
        "seiyuu",
    }


def test_person_roles_are_every_role_targeting_a_person():
    assert set(cr.PERSON_ROLES) == {
        "director",
        "producer",
        "composer",
        "author",
        "illustrator",
        "seiyuu",
    }
    assert "studio" not in cr.PERSON_ROLES


def test_every_credit_role_targets_person_or_studio():
    for role in cr.CREDIT_ROLES.values():
        assert role.target in ("person", "studio"), role.key


def test_no_retired_key_survives():
    """The six collapsed keys must be gone, not merely unused."""
    for retired in (
        "manga_author_plot",
        "manga_author_draw",
        "novel_author",
        "novel_illustrator",
        "comic_writer",
        "comic_artist",
    ):
        assert retired not in cr.CREDIT_ROLES


def test_the_derived_scope_helpers_are_gone():
    """
    director_scope_for and its companions encoded the anime/non_anime split.
    The scope IS the media type now, so a surviving helper would be a second
    source of truth.
    """
    for gone in (
        "director_scope_for",
        "SCOPED_PERSON_ROLES",
        "DIRECTOR_ANIME_MEDIA_TYPES",
    ):
        assert not hasattr(cr, gone), gone


def test_credit_role_has_no_person_role_field():
    assert not hasattr(cr.CREDIT_ROLES["studio"], "person_role")


# ---------------------------------------------------------------------------
# Labels derived from (role, media_type)
# ---------------------------------------------------------------------------


def test_derived_labels():
    assert cr.credit_label("author", "manga") == "原作"
    assert cr.credit_label("illustrator", "manga") == "作畫"
    assert cr.credit_label("author", "novel") == "Author"
    assert cr.credit_label("illustrator", "novel") == "Illustrator"
    assert cr.credit_label("author", "comic") == "Writer"
    assert cr.credit_label("illustrator", "comic") == "Artist"


def test_unoverridden_labels_fall_back_to_the_role_label():
    assert cr.credit_label("director", "movie") == "Director"
    assert cr.credit_label("director", "anime") == "Director"
    assert cr.credit_label("composer", "anime") == "Music / Composer"
    assert cr.credit_label("studio", "anime") == "Studio"


def test_every_role_has_a_label_on_every_media_type_it_serves():
    for role in cr.CREDIT_ROLES.values():
        for media_type in role.media_types:
            assert cr.credit_label(role.key, media_type)


def test_manga_illustrator_uses_the_traditional_form():
    """
    作畫, not the Japanese 作画 the pre-collapse label carried. Matches the
    site's other CJK labels (標籤 Label, Quality 品質).
    """
    assert cr.credit_label("illustrator", "manga") == "作畫"
    assert "作画" not in cr.credit_label("illustrator", "manga")


# ---------------------------------------------------------------------------
# Scopes
# ---------------------------------------------------------------------------


def test_legal_scopes_match_media_types():
    assert cr.legal_scopes("director") == ("anime", "anime-movie", "movie")
    assert cr.legal_scopes("producer") == ("anime",)
    assert cr.legal_scopes("composer") == ("anime",)
    assert cr.legal_scopes("author") == ("manga", "novel", "comic")
    assert cr.legal_scopes("illustrator") == ("manga", "novel", "comic")


def test_every_media_type_named_by_a_role_is_a_known_key():
    for role in cr.CREDIT_ROLES.values():
        for mt in role.media_types:
            assert mt in MEDIA_TYPE_KEYS, f"{role.key}: {mt}"
    for field in cr.TAG_FIELDS.values():
        for mt in field.media_types:
            assert mt in MEDIA_TYPE_KEYS, f"{field.key}: {mt}"


def test_director_credit_covers_three_media_types():
    assert set(cr.CREDIT_ROLES["director"].media_types) == {
        "anime",
        "anime-movie",
        "movie",
    }


def test_no_media_type_uses_a_collapsed_role_twice():
    """
    The collapse is only safe because manga's 原作/作畫 land on DIFFERENT
    roles. If a media type ever used one role for two credits,
    uq_media_credit_row would start rejecting legitimate rows - a manga
    written and drawn by one person, for instance.
    """
    for media_type in MEDIA_TYPE_KEYS:
        keys = [r.key for r in cr.credit_roles_for(media_type)]
        assert len(keys) == len(set(keys)), media_type


# ---------------------------------------------------------------------------
# The sheet headers - the quiet regression this collapse most easily causes
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("pair,header", sorted(EXPECTED_HEADERS.items()))
def test_sheet_headers_survive_the_role_collapse(pair, header):
    media_type, key = pair
    assert cr.sheet_column_for(media_type, key) == header


def test_no_legacy_header_entry_names_a_dead_role():
    """
    A LEGACY_SHEET_COLUMN key that no live role or tag field claims is a
    header that will never be produced - the silent half of a bad rename.
    """
    live = set(cr.CREDIT_ROLE_KEYS) | set(cr.TAG_FIELD_KEYS)
    for _media_type, key in cr.LEGACY_SHEET_COLUMN:
        assert key in live, key


def test_a_pair_with_no_legacy_header_falls_back_to_its_own_key():
    assert cr.sheet_column_for("movie", "source_official") == "source_official"


# ---------------------------------------------------------------------------
# Tag fields - unchanged by this work, kept as the standing guard
# ---------------------------------------------------------------------------


def test_credit_roles_for_anime():
    keys = {r.key for r in cr.credit_roles_for("anime")}
    assert keys == {"studio", "director", "producer", "composer"}


def test_credit_roles_for_manga_are_the_two_person_roles():
    keys = {r.key for r in cr.credit_roles_for("manga")}
    assert keys == {"author", "illustrator"}


def test_tag_fields_for_comic():
    keys = {f.key for f in cr.tag_fields_for("comic")}
    assert keys == {
        "publisher_tw",
        "comic_publisher",
        "comic_imprint",
        "comic_continuity",
        "comic_era",
        "comic_event",
    }


def test_publisher_tw_is_one_category_across_four_media_types():
    field = cr.TAG_FIELDS["publisher_tw"]
    assert field.category == "Publisher / Distributor TW"
    assert set(field.media_types) == {"anime", "manga", "novel", "comic"}


# ---------------------------------------------------------------------------
# seiyuu and the credited_via axis
# ---------------------------------------------------------------------------


def test_seiyuu_is_a_person_role_scoped_to_the_two_anime_types():
    assert "seiyuu" in cr.PERSON_ROLES
    assert cr.CREDIT_ROLES["seiyuu"].target == "person"
    assert cr.legal_scopes("seiyuu") == ("anime", "anime-movie")


def test_seiyuu_credits_are_not_stored_in_media_credit():
    """
    Decision A: the cast list has exactly one home, character_casting. If
    credit_roles_for() started returning seiyuu, /api/credits would ask for
    media_credit rows that never exist and the entry forms would grow a
    phantom Seiyuu dropdown.
    """
    assert cr.CREDIT_ROLES["seiyuu"].credited_via == "character_casting"
    for media_type in ("anime", "anime-movie"):
        assert "seiyuu" not in {r.key for r in cr.credit_roles_for(media_type)}


def test_every_other_role_still_stores_credits_in_media_credit():
    for key, role in cr.CREDIT_ROLES.items():
        if key != "seiyuu":
            assert role.credited_via == "media_credit"


def test_director_is_still_returned_for_anime():
    """Guards the credit_roles_for() filter against over-filtering."""
    assert "director" in {r.key for r in cr.credit_roles_for("anime")}
    assert "studio" in {r.key for r in cr.credit_roles_for("anime")}


def test_every_person_role_has_an_admin_sub_tab():
    """
    PERSON_SUB_TABS in frontend/src/components/forms/PersonSubTabBar.jsx is a
    hand-maintained list, and it drives four surfaces at once: the Person
    Add / Modify / Delete sub-tabs and the /library/person type filter.

    Nothing failed when it fell out of step, so `seiyuu` shipped without a
    sub-tab and could not be picked in the admin forms at all - the role
    existed, but there was no way to reach it. This test is the missing alarm:
    add a person role in Python and the frontend list has to follow.
    """
    from pathlib import Path

    from app.utils.credit_roles import PERSON_ROLES

    source = Path("frontend/src/components/forms/PersonSubTabBar.jsx").read_text(
        encoding="utf-8"
    )
    missing = [role for role in PERSON_ROLES if f'key: "{role}"' not in source]
    assert not missing, (
        "These person roles have no sub-tab in PersonSubTabBar.jsx, so they "
        f"cannot be chosen in the admin forms: {', '.join(missing)}"
    )
