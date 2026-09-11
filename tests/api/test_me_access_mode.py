"""/api/auth/me after the axis split.

The `permissions` list keeps publishing field_group.* strings even though they
are no longer role permissions. The SPA has hundreds of has() calls against
them, and the whole reason Phase B's frontend cost is ~zero is that this
contract holds - the server changed where the answer comes from, not what the
answer looks like.
"""

from app.services.rbac.seed_modes import MODE_NORMAL, MODE_SAFE


def test_field_groups_still_appear_in_permissions(mode_client):
    body = mode_client(MODE_NORMAL).get("/api/auth/me").json()
    assert "field_group.sources_restricted" in body["permissions"]
    assert "field_group.credits" in body["permissions"]


def test_a_narrow_mode_withholds_them(mode_client):
    """`safe` is seeded from the guest role's own field groups, so on a fresh
    database it carries everything except sources_restricted."""
    body = mode_client(MODE_SAFE).get("/api/auth/me").json()
    assert "field_group.sources_restricted" not in body["permissions"]
    assert "field_group.credits" in body["permissions"]


def test_narrowing_the_mode_does_not_take_away_what_the_account_may_do(
    mode_client,
):
    """Two axes. Sitting in `safe` must not drop the catalogue grant.

    Asserted through is_admin rather than through the permissions list: the
    `admin` role is is_superuser, so it holds every capability IMPLICITLY -
    has() short-circuits - and its explicit grant set has always been empty.
    The list therefore shows only the field_group.* half for this account,
    which is correct and easy to misread as a regression.
    """
    body = mode_client(MODE_SAFE).get("/api/auth/me").json()
    assert body["is_admin"] is True
    assert body["is_superuser"] is True


def test_a_non_superuser_keeps_its_capability_grants_in_a_narrow_mode(
    db_session, super_user, mode_client
):
    """The same property on an account whose grants are explicit, so the
    permissions list itself can be asserted."""
    body = mode_client(MODE_SAFE, user=super_user).get("/api/auth/me").json()
    assert "manage.catalog" in body["permissions"]
    assert "manage.pipelines" in body["permissions"]
    assert "admin.authz" not in body["permissions"]


def test_the_active_mode_is_published(mode_client):
    body = mode_client(MODE_SAFE).get("/api/auth/me").json()
    assert body["mode"]["key"] == MODE_SAFE
    assert body["mode"]["id"]


def test_labels_stay_out_of_the_payload(mode_client, nsfw_label):
    """They scope whole entries server-side; the browser never needs them, and
    listing them would tell a narrowed session what it is missing."""
    body = mode_client(MODE_NORMAL).get("/api/auth/me").json()
    assert not [p for p in body["permissions"] if p.startswith("label.")]


def test_a_guest_gets_the_guest_default_modes_groups(client, access_modes):
    body = client.get("/api/auth/me").json()
    assert body["mode"]["key"] == MODE_SAFE
    assert "field_group.credits" in body["permissions"]
    assert "field_group.sources_restricted" not in body["permissions"]
