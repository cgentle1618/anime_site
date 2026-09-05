"""
A save must not destroy the source rows the saver was never shown.

Modify prefills its form from the permission-gated entry GET, so an admin who
holds PERM_ADMIN but not `sources_restricted` sends back a payload that simply
does not mention the restricted rows. replace_sources is a whole-set replace,
so without a gate that save deletes them. The gate belongs in the service, not
in the form: the API must be safe whatever the client sends.
"""

import uuid

import pytest

from app import models
from app.services.domain.sources import replace_sources
from app.services.rbac.permissions import PERM_ADMIN, field_group_perm
from app.services.rbac.resolver import Viewer
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import make_viewer


def _viewer(*permissions):
    return Viewer(
        username="gated",
        role_id=uuid.uuid4(),
        role_name="gated",
        is_superuser=False,
        permissions=frozenset(permissions),
    )


@pytest.fixture
def restricted_row(db_session, sample_anime):
    row = models.MediaSource(
        media_type="anime",
        entry_id=sample_anime.system_id,
        kind="access",
        bucket="restricted",
        name="Hidden Site",
        url="https://hidden.test",
    )
    db_session.add(row)
    db_session.flush()
    return row


def test_a_withheld_bucket_survives_a_save(
    db_session, sample_anime, restricted_row
):
    viewer = _viewer(PERM_ADMIN, field_group_perm("sources_other"))

    replace_sources(
        db_session,
        "anime",
        sample_anime.system_id,
        [{"kind": "access", "bucket": "other", "name": "Visible"}],
        viewer=viewer,
    )
    db_session.commit()

    buckets = {
        (r.bucket, r.name)
        for r in db_session.query(models.MediaSource).filter_by(
            media_type="anime", entry_id=sample_anime.system_id
        )
    }
    assert ("restricted", "Hidden Site") in buckets
    assert ("other", "Visible") in buckets


def test_a_holder_can_still_clear_the_bucket(
    db_session, sample_anime, restricted_row
):
    viewer = _viewer(
        PERM_ADMIN,
        field_group_perm("sources_other"),
        field_group_perm("sources_restricted"),
    )

    replace_sources(
        db_session, "anime", sample_anime.system_id, [], viewer=viewer
    )
    db_session.commit()

    assert (
        db_session.query(models.MediaSource)
        .filter_by(media_type="anime", entry_id=sample_anime.system_id)
        .count()
        == 0
    )


def test_no_viewer_still_replaces_everything(
    db_session, sample_anime, restricted_row
):
    """Internal callers pass no viewer and mean the whole set."""
    replace_sources(db_session, "anime", sample_anime.system_id, [])
    db_session.commit()

    assert (
        db_session.query(models.MediaSource)
        .filter_by(media_type="anime", entry_id=sample_anime.system_id)
        .count()
        == 0
    )


def test_the_patch_endpoint_honours_the_gate(
    client, db_session, sample_anime, restricted_row
):
    gated = make_viewer(
        db_session,
        client,
        "gatedadmin",
        (default_guest_permissions() | {PERM_ADMIN})
        - {field_group_perm("sources_restricted")},
    )

    r = gated.patch(
        f"/api/anime/{sample_anime.system_id}",
        json={"sources": [{"kind": "access", "bucket": "other", "name": "Kept"}]},
    )
    assert r.status_code == 200
    assert [s["bucket"] for s in r.json()["sources"]] == ["other"]

    db_session.expire_all()
    survivors = (
        db_session.query(models.MediaSource)
        .filter_by(media_type="anime", entry_id=sample_anime.system_id)
        .all()
    )
    assert {r.bucket for r in survivors} == {"other", "restricted"}
