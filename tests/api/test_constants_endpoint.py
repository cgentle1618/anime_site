"""The Tier 1 closed-enum endpoint."""

from app.utils import constants as c


def test_endpoint_is_public(client):
    assert client.get("/api/constants").status_code == 200


def test_serves_watching_statuses_in_declaration_order(client):
    body = client.get("/api/constants").json()
    assert body["watching_status"] == [s.value for s in c.WatchStatus]


def test_serves_my_ratings(client):
    body = client.get("/api/constants").json()
    assert body["my_rating"] == ["S", "A+", "A", "B", "C", "D", "E", "F"]


def test_serves_weekdays_monday_first(client):
    body = client.get("/api/constants").json()
    assert body["day_of_week"][0] == "Monday"
    assert len(body["day_of_week"]) == 7


def test_serves_watch_order_importance(client):
    from app.services.domain.watch_order import ITEM_IMPORTANCE

    body = client.get("/api/constants").json()
    assert body["watch_order_importance"] == list(ITEM_IMPORTANCE)


def test_every_value_is_a_list_of_strings(client):
    body = client.get("/api/constants").json()
    assert body
    for key, values in body.items():
        assert isinstance(values, list), key
        assert all(isinstance(v, str) for v in values), key


def test_dub_preference_is_gone(client):
    body = client.get("/api/constants").json()
    assert "dub_preference" not in body


def test_serves_the_person_role_vocabulary(client):
    """
    OptionsAddTab.jsx hand-duplicated this list with nothing enforcing the
    match against credit_roles.py - the exact two-copies pattern the options
    redesign exists to delete.
    """
    from app.utils.credit_roles import PERSON_ROLES

    body = client.get("/api/constants").json()
    assert body["person_role"] == list(PERSON_ROLES)


def test_serves_the_hyphenated_media_type_keys(client):
    """What the Options form's scope picker offers. NOT person-role scopes."""
    from app.utils.media_resolver import MEDIA_TYPE_KEYS

    body = client.get("/api/constants").json()
    assert body["media_type"] == list(MEDIA_TYPE_KEYS)
    assert "anime-movie" in body["media_type"]
    assert "anime_movie" not in body["media_type"]


def test_serves_the_declared_option_categories(client):
    """
    The Options form used to build its category list purely from the options
    already in the database, so a category declared in TAG_FIELDS but not yet
    populated - Quality on the day it shipped - could not be picked at all,
    and its first value had to be typed blind into a free-text box.
    """
    from app.utils.credit_roles import OPTION_CATEGORIES

    body = client.get("/api/constants").json()
    assert body["option_categories"] == list(OPTION_CATEGORIES)
    assert "Quality" in body["option_categories"]


def test_serves_the_tag_categories_as_a_subset_of_option_categories(client):
    """
    The admin Options UI groups its category picker into Tags and Options.
    A category listed as a tag but absent from OPTION_CATEGORIES would show
    up in the Tags sub-tab and nowhere else, so the two must stay in step.
    """
    from app.utils.credit_roles import OPTION_CATEGORIES, TAG_CATEGORIES

    assert set(TAG_CATEGORIES) <= set(OPTION_CATEGORIES)

    body = client.get("/api/constants").json()
    assert body["tag_categories"] == list(TAG_CATEGORIES)
    assert set(body["tag_categories"]) <= set(body["option_categories"])
    assert "Quality" in body["tag_categories"]
    assert "Comic Era" not in body["tag_categories"]
