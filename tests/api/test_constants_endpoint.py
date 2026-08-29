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
