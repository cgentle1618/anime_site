"""
POST /api/data-control/pull/{tab_name} must answer 400, not 500, for a tab it
does not know. Requires PostgreSQL. See tests/api/conftest.py.
"""


def test_an_unknown_tab_is_a_400(admin_client):
    response = admin_client.post("/api/data-control/pull/Bogus")
    assert response.status_code == 400
    assert "Unknown tab" in response.json()["detail"]
