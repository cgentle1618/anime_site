"""Decision 14: a pipeline runs only from an unscoped session.

A pipeline's object set is EVERY entry, declared and not negotiable. The sheet
holds one version of the data and Backup overwrites every tab, so a per-viewer
filter would write a PARTIAL sheet over the complete one and a Pull All would
restore a partial database - silent data loss rather than the information leak
it was meant to close. The permission is therefore unscoped, and this gate is
what stops that being merely a trust assertion.

The mode still only decides which objects an operation reaches; it is the
OPERATION that refuses to run against a subset, because a partial Backup is
not a smaller version of the job.
"""

import pytest

from app import models
from app.services.rbac import cache
from app.services.rbac.seed_modes import (
    MODE_NORMAL,
    MODE_SAFE,
    MODE_UNRESTRICTED,
)

# Routes declared literally on the two pipeline routers. The per-type Fill and
# Replace routes are registered in a loop over PIPELINES, which is exactly why
# the gate is on the ROUTER and not on individual handlers.
PIPELINE_ROUTES = [
    ("post", "/api/data-control/backup"),
    ("post", "/api/data-control/pull"),
    ("post", "/api/data-control/replace/all"),
]


@pytest.fixture(autouse=True)
def _no_real_pipelines(monkeypatch):
    """Stub the two pipelines that would otherwise reach Google Sheets.

    Every assertion here is about the GATE, which runs as a dependency before
    any handler body. The stubs exist so that the "reaches the handler" cases
    can prove they got past the gate without a network round trip - and so a
    regression that opens the gate fails loudly instead of hanging.
    """
    import app.routers.data_control as dc

    monkeypatch.setattr(dc, "execute_backup", lambda *a, **k: {"status": "stubbed"})
    monkeypatch.setattr(
        dc, "execute_pull_all", lambda *a, **k: {"status": "stubbed"}
    )


@pytest.mark.parametrize("method,path", PIPELINE_ROUTES)
def test_a_narrowed_session_may_not_run_a_pipeline(
    mode_client, nsfw_label, method, path
):
    """`normal` carries every field group but not the nsfw label, so it is
    scoped - and scoped is scoped, however narrowly."""
    response = getattr(mode_client(MODE_NORMAL), method)(path)
    assert response.status_code == 401


@pytest.mark.parametrize("method,path", PIPELINE_ROUTES)
def test_safe_may_not_either(mode_client, nsfw_label, method, path):
    assert getattr(mode_client(MODE_SAFE), method)(path).status_code == 401


def test_the_refusal_is_401_and_names_the_mode(mode_client, nsfw_label):
    """401, not 404: the route's existence is not a secret and the caller is
    being told to widen, which is a thing they can act on. 404 is the object
    axis, where hiding the existence of the thing is the point."""
    response = mode_client(MODE_NORMAL).post("/api/data-control/backup")
    assert response.status_code == 401
    assert "mode" in response.json()["detail"].lower()


def test_an_unscoped_session_reaches_the_handler(mode_client, nsfw_label):
    """`unrestricted` carries every label and every field group, so the gate
    passes and the request reaches the pipeline itself. Asserting "not 401" -
    what the pipeline then does is not this test's business."""
    response = mode_client(MODE_UNRESTRICTED).post("/api/data-control/backup")
    assert response.status_code != 401


@pytest.fixture
def everything_mode(db_session, nsfw_label):
    """A CUSTOM mode carrying every label and field group - a row set.

    The vehicle for the three tests below, and it has to be a custom mode
    rather than `unrestricted`: that one's sets are derived rather than read
    (app/services/rbac/cache.py::mode_sets), so nothing can narrow it and it
    cannot show the narrowing these tests are about.
    """
    from app.services.rbac.field_groups import FIELD_GROUP_KEYS

    custom = models.AccessMode(key="everything", label="Everything")
    db_session.add(custom)
    db_session.flush()
    db_session.add(
        models.AccessModeLabel(
            mode_id=custom.system_id, label_id=nsfw_label.system_id
        )
    )
    for key in FIELD_GROUP_KEYS:
        db_session.add(
            models.AccessModeFieldGroup(
                mode_id=custom.system_id, field_group_key=key
            )
        )
    db_session.flush()
    cache.bump()
    return custom


def test_a_custom_mode_holding_everything_also_qualifies(
    db_session, admin_user, everything_mode, mode_client
):
    """Computed, never a comparison against the key `unrestricted`. An admin's
    own equivalent mode must work, or the rule is really "be unrestricted"."""
    assert (
        mode_client("everything").post("/api/data-control/backup").status_code
        != 401
    )


def test_adding_a_label_narrows_a_previously_qualifying_mode(
    db_session, everything_mode, mode_client
):
    """The edge the computed test exists for.

    A row-set mode that carried every label yesterday does not carry the one
    minted today, and stops qualifying until somebody grants it - the
    fail-closed direction.
    """
    c = mode_client("everything")
    assert c.post("/api/data-control/backup").status_code != 401

    db_session.add(models.ContentLabel(key="gore", label="Gore"))
    db_session.flush()
    cache.bump()

    assert c.post("/api/data-control/backup").status_code == 401


def test_a_missing_field_group_also_narrows(db_session, everything_mode, mode_client):
    """Both halves of the test bite, not just the label half."""
    c = mode_client("everything")
    assert c.post("/api/data-control/backup").status_code != 401

    db_session.query(models.AccessModeFieldGroup).filter(
        models.AccessModeFieldGroup.mode_id == everything_mode.system_id,
        models.AccessModeFieldGroup.field_group_key == "credits",
    ).delete(synchronize_session=False)
    db_session.flush()
    cache.bump()

    assert c.post("/api/data-control/backup").status_code == 401


def test_a_label_minted_today_does_not_narrow_unrestricted(
    db_session, nsfw_label, mode_client
):
    """The mirror of the two above, and the reason they needed a custom mode.

    `unrestricted` is DERIVED, so a new label widens it in the same instant it
    exists. Before that, minting a label silently locked every pipeline in the
    installation out of Backup and Pull All with a 401 - on top of hiding the
    entries it was put on from every session, including the owner's.
    """
    c = mode_client(MODE_UNRESTRICTED)
    assert c.post("/api/data-control/backup").status_code != 401

    db_session.add(models.ContentLabel(key="gore", label="Gore"))
    db_session.flush()
    cache.bump()

    assert c.post("/api/data-control/backup").status_code != 401


def test_replace_one_on_a_hidden_entry_is_unreachable(
    mode_client, nsfw_label, hidden_anime
):
    """The oracle decision 14 closes for free.

    POST /api/data-control/replace/anime/{id} answered 404 for a missing entry
    and 200 "Successfully updated <display_name>." for a hidden one - a write,
    an existence oracle and a title leak in one answer. A caller who can reach
    the route has no hidden entries, so the oracle has no domain.
    """
    response = mode_client(MODE_NORMAL).post(
        f"/api/data-control/replace/anime/{hidden_anime.system_id}"
    )
    assert response.status_code == 401


def test_a_user_without_the_permission_is_still_refused_first(user_client):
    """The mode gate does not replace the capability gate. An ordinary account
    in `unrestricted` still may not run a pipeline."""
    assert user_client.post("/api/data-control/backup").status_code == 401
