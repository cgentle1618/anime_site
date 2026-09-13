"""
Changing who may do what is admin-only.

A super account manages the catalogue and runs pipelines, but must not be able
to grant itself anything, edit a role, create an account, or change a content
label - the labels being what the access-mode axis will scope in Phase B.
"""


import pytest


@pytest.fixture
def db(db_session):
    return db_session


# super_client comes from conftest now - Phase A built this account inline in
# several files and the audit asked for one copy.


@pytest.mark.parametrize(
    "path",
    ["/api/roles/", "/api/users/", "/api/content-labels/"],
)
def test_super_is_refused_the_authorization_routers(super_client, path):
    response = super_client.get(path)
    assert response.status_code == 401
    assert response.headers["WWW-Authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "path",
    ["/api/roles/", "/api/users/", "/api/content-labels/"],
)
def test_the_admin_account_still_reaches_them(admin_client, path):
    assert admin_client.get(path).status_code == 200
