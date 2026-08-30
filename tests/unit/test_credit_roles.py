"""Unit tests for the credit role / tag field vocabulary."""

import pytest

from app.utils.media_resolver import MEDIA_TYPE_KEYS
from app.utils import credit_roles as cr


def test_every_credit_role_targets_person_or_studio():
    for role in cr.CREDIT_ROLES.values():
        assert role.target in ("person", "studio"), role.key


def test_studio_role_implies_no_person_role():
    assert cr.CREDIT_ROLES["studio"].person_role is None


def test_person_roles_all_come_from_credit_roles():
    implied = {r.person_role for r in cr.CREDIT_ROLES.values() if r.person_role}
    assert implied == set(cr.PERSON_ROLES)


def test_two_manga_author_credits_share_one_person_role():
    assert cr.CREDIT_ROLES["manga_author_plot"].person_role == "manga_author"
    assert cr.CREDIT_ROLES["manga_author_draw"].person_role == "manga_author"


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


@pytest.mark.parametrize(
    "media_type,expected",
    [
        ("anime", "anime"),
        ("anime-movie", "anime"),
        ("movie", "non_anime"),
        ("tv-show", "non_anime"),
    ],
)
def test_director_scope_follows_media_type(media_type, expected):
    assert cr.director_scope_for(media_type) == expected


def test_credit_roles_for_anime():
    keys = {r.key for r in cr.credit_roles_for("anime")}
    assert keys == {"studio", "director", "producer", "composer"}


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


def test_official_source_is_one_category_across_three_media_types():
    field = cr.TAG_FIELDS["source_official"]
    assert field.category == "Official Source"
    assert set(field.media_types) == {"tv-show", "cartoon", "movie"}


def test_label_is_an_anime_only_tag_field():
    field = cr.TAG_FIELDS["label"]
    assert field.category == "Label"
    assert field.media_types == ("anime",)
    assert "label" in {f.key for f in cr.tag_fields_for("anime")}


def test_label_has_no_legacy_sheet_header():
    """It never had a string column, so the sheet header is the key itself."""
    assert ("anime", "label") not in cr.LEGACY_SHEET_COLUMN
    assert cr.sheet_column_for("anime", "label") == "label"


def test_label_is_an_offered_option_category():
    assert "Label" in cr.OPTION_CATEGORIES
