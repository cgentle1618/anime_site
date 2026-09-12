"""/api/auth/me after the axis split.

The `permissions` list keeps publishing field_group.* strings even though they
are no longer role permissions. The SPA has hundreds of has() calls against
them, and the whole reason Phase B's frontend cost is ~zero is that this
contract holds - the server changed where the answer comes from, not what the
answer looks like.
"""

from app.services.rbac.seed_modes import (
    MODE_BORDERLINE,
    MODE_NORMAL,
    MODE_SAFE,
)


def test_field_groups_still_appear_in_permissions(mode_client):
    body = mode_client(MODE_NORMAL).get("/api/auth/me").json()
    assert "field_group.sources_restricted" in body["permissions"]
    assert "field_group.sources_other" in body["permissions"]


def test_a_narrow_mode_withholds_them(mode_client):
    """`safe` is seeded from the guest role's own field groups, so on a fresh
    database it carries everything except sources_restricted."""
    body = mode_client(MODE_SAFE).get("/api/auth/me").json()
    assert "field_group.sources_restricted" not in body["permissions"]
    assert "field_group.sources_other" in body["permissions"]


def test_neither_credits_nor_system_info_is_a_field_group_any_more(mode_client):
    """Both left, for different reasons, and neither became a permission.

    `credits` is ungated - studio and director are what an entry IS.
    `system_info` was two timestamps nothing displays plus a decorative id,
    so the whole group went rather than moving axis; the id that survives on
    a detail page spine is drawn on `is_superuser`, which /me already carries
    as its own field.
    """
    for key in (MODE_NORMAL, MODE_SAFE):
        held = mode_client(key).get("/api/auth/me").json()["permissions"]
        for gone in ("field_group.credits", "field_group.system_info"):
            assert gone not in held, gone
        # The mirror: the three surviving groups still arrive, so the green
        # above is these two being gone and not the merge being dropped.
        assert "field_group.sources_other" in held


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
    assert "field_group.sources_other" in body["permissions"]
    assert "field_group.sources_restricted" not in body["permissions"]



# ---------------------------------------------------------------------------
# The modes this account HOLDS (Phase D task 1)
# ---------------------------------------------------------------------------
# The switcher needs two things /me did not carry: which modes are available,
# and what switching to each would COST. The cost is computed server-side so
# the SPA never has to model the subset rule - two implementations of one rule
# is how they drift.


def test_me_lists_the_modes_this_account_holds(admin_user, mode_client, grant_mode):
    c = mode_client(MODE_NORMAL)
    grant_mode(admin_user, MODE_SAFE)

    body = c.get("/api/auth/me").json()

    assert {m["key"] for m in body["modes"]} == {MODE_NORMAL, MODE_SAFE}
    active = [m for m in body["modes"] if m["is_active"]]
    assert len(active) == 1
    assert active[0]["key"] == MODE_NORMAL


def test_narrowing_is_free_and_widening_needs_the_password(
    admin_user, mode_client, grant_mode, nsfw_label
):
    """The subset test from spec decision 3, computed here rather than in the
    browser. `safe` carries fewer field groups than `normal`, so it is a
    narrowing; `borderline` adds a content label, so it is a widening."""
    c = mode_client(MODE_NORMAL)
    grant_mode(admin_user, MODE_SAFE)
    grant_mode(admin_user, MODE_BORDERLINE)

    by_key = {m["key"]: m for m in c.get("/api/auth/me").json()["modes"]}

    assert by_key[MODE_SAFE]["requires_password"] is False
    assert by_key[MODE_NORMAL]["requires_password"] is False
    assert by_key[MODE_BORDERLINE]["requires_password"] is True


def test_the_active_mode_never_requires_a_password(mode_client):
    """Switching to where you already are is a no-op, not a widening."""
    body = mode_client(MODE_SAFE).get("/api/auth/me").json()
    active = next(m for m in body["modes"] if m["is_active"])
    assert active["requires_password"] is False


def test_a_denial_makes_a_mode_narrower_for_this_account(
    admin_user, mode_client, grant_mode, nsfw_label
):
    """The cost is computed against the EFFECTIVE set, not the mode's own. An
    account holding `borderline` minus nsfw reaches no more than `normal`, so
    switching to it must not ask for a password."""
    c = mode_client(MODE_NORMAL)
    grant_mode(admin_user, MODE_BORDERLINE, denials=(nsfw_label.key,))

    by_key = {m["key"]: m for m in c.get("/api/auth/me").json()["modes"]}

    assert by_key[MODE_BORDERLINE]["requires_password"] is False


def test_a_guest_holds_no_modes(client, access_modes):
    assert client.get("/api/auth/me").json()["modes"] == []


def test_with_no_labels_borderline_and_normal_are_genuinely_equivalent(
    admin_user, mode_client, grant_mode
):
    """Why the refusal tests above carry `nsfw_label`, asserted rather than
    assumed.

    `borderline` and `normal` differ ONLY in which content labels they carry.
    On a database with zero labels that difference has no content, so they are
    the same mode in every way that matters and switching between them is free.

    The general shape, and it is the sharp edge in every set-computed gate:
    asserting that a gate ALLOWS is safe on an empty set; asserting that a gate
    REFUSES is not. A refusal test whose set is empty passes because there was
    nothing to refuse - green on day one, green through the change that breaks
    it, and green forever after. So a refusal test must make its set non-empty
    and say so. Delete `nsfw_label` from the tests above and they keep passing
    while asserting nothing; this test is what explains that green.
    """
    c = mode_client(MODE_NORMAL)
    grant_mode(admin_user, MODE_BORDERLINE)

    by_key = {m["key"]: m for m in c.get("/api/auth/me").json()["modes"]}

    assert by_key[MODE_BORDERLINE]["requires_password"] is False
