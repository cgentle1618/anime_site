"""
The hand-maintained FX rate table behind the game-spend block on /statistics.

Two things these tests exist to pin. First, that an unset table is a normal
answer rather than an error - the page has to render before anyone has typed
a rate. Second, and the reason the endpoints are not in system.py at all,
that a plain signed-in member can READ the rates: /statistics only asks for
self.list, so a member who can see the spend block must be able to see the
rates it converts with, while only an admin may change them.
"""

import json

from app import models

RATES = {
    "base": "USD",
    "as_of": "2026-09-13",
    "rates": {"TWD": 32.0, "JPY": 150.0},
}


def _stored(db):
    row = (
        db.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key == "fx_rates")
        .one_or_none()
    )
    return json.loads(row.config_value) if row else None


def test_unset_rates_read_as_empty_rather_than_404(client):
    """The page renders before anyone has entered a rate."""
    response = client.get("/api/fx-rates")
    assert response.status_code == 200, response.text
    assert response.json() == {"base": None, "as_of": None, "rates": {}}


def test_an_admin_sets_the_rates_and_they_read_back(admin_client, db_session):
    response = admin_client.put("/api/fx-rates", json=RATES)
    assert response.status_code == 200, response.text

    body = admin_client.get("/api/fx-rates").json()
    assert body["base"] == "USD"
    assert body["as_of"] == "2026-09-13"
    assert body["rates"]["TWD"] == 32.0
    assert body["rates"]["JPY"] == 150.0
    assert _stored(db_session)["base"] == "USD"


def test_the_base_currency_converts_to_itself(admin_client):
    """
    Without this the base has no rate, so every total expressed in it comes
    out as zero or NaN depending on which way the converter divides - and the
    payload above is the natural thing to send, since USD-per-USD reads like
    a thing you would not bother to type.
    """
    admin_client.put("/api/fx-rates", json=RATES)
    assert admin_client.get("/api/fx-rates").json()["rates"]["USD"] == 1.0


def test_a_member_may_read_the_rates(user_client, admin_client):
    """
    The whole reason these endpoints are not in system.py. /statistics is
    gated on self.list, not on manage.pipelines, so a member who can open the
    page has to be able to read what it converts with.
    """
    admin_client.put("/api/fx-rates", json=RATES)
    response = user_client.get("/api/fx-rates")
    assert response.status_code == 200, response.text
    assert response.json()["rates"]["TWD"] == 32.0


def test_a_member_may_not_change_the_rates(user_client, admin_client, db_session):
    """
    The mirror of the read above, with the table already populated so the
    refusal has something to refuse - a gate that denies an empty table
    proves nothing.

    401 and not 403: require_permission answers an insufficient permission
    with 401 on purpose, so that every refusal reaches the SPA with the one
    message and header shape its error handling expects.
    """
    admin_client.put("/api/fx-rates", json=RATES)

    response = user_client.put(
        "/api/fx-rates",
        json={"base": "USD", "as_of": "2026-01-01", "rates": {"TWD": 1.0}},
    )
    assert response.status_code == 401, response.text
    # And the admin's table is still standing.
    assert _stored(db_session)["rates"]["TWD"] == 32.0


def test_a_rate_of_zero_is_refused(admin_client):
    """Not a data-quality nit: it is a division by zero in the converter."""
    response = admin_client.put(
        "/api/fx-rates",
        json={"base": "USD", "as_of": "2026-09-13", "rates": {"TWD": 0}},
    )
    assert response.status_code == 422, response.text


def test_a_nonsense_currency_code_is_refused(admin_client):
    response = admin_client.put(
        "/api/fx-rates",
        json={"base": "USD", "as_of": "2026-09-13", "rates": {"Taiwan Dollars": 32.0}},
    )
    assert response.status_code == 422, response.text


def test_a_nonsense_as_of_date_is_refused(admin_client):
    """The date is printed beside every converted figure; it has to be one."""
    response = admin_client.put(
        "/api/fx-rates",
        json={"base": "USD", "as_of": "last Tuesday", "rates": {"TWD": 32.0}},
    )
    assert response.status_code == 422, response.text


def test_an_unreadable_stored_row_serves_no_rates(client, db_session):
    """
    A half-read rate table is worse than none: the number it produces looks
    exactly like a real one. Someone editing the Google Sheet by hand is the
    likely way this row stops being JSON.
    """
    db_session.add(
        models.SystemConfigs(config_key="fx_rates", config_value="not json at all")
    )
    db_session.commit()

    response = client.get("/api/fx-rates")
    assert response.status_code == 200, response.text
    assert response.json()["rates"] == {}
