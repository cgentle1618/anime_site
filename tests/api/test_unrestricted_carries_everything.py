"""`unrestricted` reaches every object, including labels minted after it.

The mode's whole meaning is "Every entry and every field. The widest mode."
Its label set used to be materialised rows like any other mode's, so a label
created after the seed reached it no more than it reached `safe` - and since
`hidden_label_ids` hides every label the ACTIVE MODE lacks, the first entry
tagged with that label vanished from every session in the installation, the
owner's included. It looked like a deletion: the entry was intact in the
database and in the sheet, and every read of it 404'd, because a hidden entry
is deliberately indistinguishable from a missing one.

So `unrestricted` is DERIVED, not stored. The tests below hold the three ways
the old shape could drift back: resolution (what a session actually reaches),
the admin surface (what the page reports and refuses), and label creation
(the rows stay consistent with the derivation).

Every test here needs a label that exists but is carried by NOBODY, which is
why `orphan_label` inserts the row directly instead of using the `nsfw_label`
fixture - that one calls carry_label_in_wide_modes() and grants itself to the
wide modes, which is precisely the condition under test.
"""

import uuid

import pytest

from app import models
from app.services.rbac import cache
from app.services.rbac.enforcement import entry_visible, hidden_label_ids
from app.services.rbac.field_groups import FIELD_GROUP_KEYS
from app.services.rbac.resolver import Viewer
from app.services.rbac.seed_modes import MODE_NORMAL, MODE_UNRESTRICTED

MODES = "/api/access-modes/"
LABELS = "/api/content-labels/"


@pytest.fixture
def orphan_label(db_session, access_modes):
    """A label minted after the seed, granted to no mode at all.

    Load-bearing, not decoration: with no label in the table every one of
    these assertions is vacuously true - `hidden_label_ids` computes over the
    set of labels that EXIST, and an empty set hides nothing. This fixture is
    what makes the negative half of each test able to fail.
    """
    label = models.ContentLabel(
        system_id=uuid.uuid4(), key="erotica", label="Erotica", sort_order=0
    )
    db_session.add(label)
    db_session.flush()
    cache.bump()
    return label


@pytest.fixture
def labelled_entry(db_session, sample_franchise, orphan_label):
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Immoral Guild",
        airing_type="TV",
        airing_status="Finished Airing",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_id=entry.system_id,
            label_id=orphan_label.system_id,
        )
    )
    db_session.flush()
    return entry


def _viewer_in(db_session, mode_row):
    """A viewer holding every permission, sitting in `mode_row`.

    The role axis is deliberately wide so that anything these tests observe is
    the OBJECT axis doing it - labels, not capabilities.
    """
    sets = cache.mode_sets(db_session, mode_row.system_id)
    return Viewer(
        username="someone",
        role_id=None,
        role_name="admin",
        is_root=True,
        permissions=frozenset(),
        mode_id=mode_row.system_id,
        mode_key=mode_row.key,
        visible_label_ids=sets.label_ids,
        field_groups=sets.field_groups,
    )


# ---------------------------------------------------------------------------
# Resolution: what a session sitting in the mode actually reaches
# ---------------------------------------------------------------------------


def test_unrestricted_hides_nothing_from_a_label_minted_after_the_seed(
    db_session, mode, orphan_label
):
    viewer = _viewer_in(db_session, mode(MODE_UNRESTRICTED))
    assert hidden_label_ids(db_session, viewer) == []


def test_normal_still_hides_that_label(db_session, mode, orphan_label):
    """The mirror, with the same fixture. Without it the test above could pass
    because nothing was hidden from anyone - a green that proves the gate was
    asked, not that it answered."""
    hidden = hidden_label_ids(db_session, _viewer_in(db_session, mode(MODE_NORMAL)))
    assert hidden == [orphan_label.system_id]


def test_an_entry_carrying_that_label_stays_visible_in_unrestricted(
    db_session, mode, labelled_entry
):
    """The reported symptom: tag an entry with a brand-new label and it 404s
    for everybody, which reads as a deletion."""
    viewer = _viewer_in(db_session, mode(MODE_UNRESTRICTED))
    assert entry_visible(db_session, viewer, "anime", labelled_entry.system_id) is True


def test_that_entry_is_still_hidden_in_normal(db_session, mode, labelled_entry):
    viewer = _viewer_in(db_session, mode(MODE_NORMAL))
    assert entry_visible(db_session, viewer, "anime", labelled_entry.system_id) is False


def test_unrestricted_carries_every_field_group(db_session, mode, orphan_label):
    sets = cache.mode_sets(db_session, mode(MODE_UNRESTRICTED).system_id)
    assert set(sets.field_groups) == set(FIELD_GROUP_KEYS)


# ---------------------------------------------------------------------------
# The admin surface
# ---------------------------------------------------------------------------


def test_the_api_reports_unrestricted_as_carrying_every_label(
    admin_client, mode, orphan_label
):
    """What the page draws. Reporting the stored rows while resolution derives
    the full set would show an admin an unticked box that does nothing."""
    rows = {r["key"]: r for r in admin_client.get(MODES).json()}
    assert orphan_label.key in rows[MODE_UNRESTRICTED]["label_keys"]
    assert set(rows[MODE_UNRESTRICTED]["field_group_keys"]) == set(FIELD_GROUP_KEYS)
    assert orphan_label.key not in rows[MODE_NORMAL]["label_keys"]


def test_the_grants_of_unrestricted_cannot_be_replaced(
    admin_client, mode, orphan_label
):
    """The lock is enforced here, not only in the SPA. A 409 rather than a
    silent no-op: an admin who sends a narrower set must be told it was not
    applied."""
    response = admin_client.put(
        f"{MODES}{mode(MODE_UNRESTRICTED).system_id}/grants",
        json={"label_keys": [], "field_group_keys": []},
    )
    assert response.status_code == 409


def test_another_mode_can_still_have_its_grants_replaced(
    admin_client, mode, orphan_label
):
    response = admin_client.put(
        f"{MODES}{mode(MODE_NORMAL).system_id}/grants",
        json={"label_keys": [orphan_label.key], "field_group_keys": []},
    )
    assert response.status_code == 200
    assert response.json()["label_keys"] == [orphan_label.key]


# ---------------------------------------------------------------------------
# Label creation keeps the stored rows consistent with the derivation
# ---------------------------------------------------------------------------


def test_creating_a_label_grants_it_to_unrestricted(admin_client, db_session, mode):
    created = admin_client.post(
        LABELS, json={"key": "erotica", "label": "Erotica", "sort_order": 0}
    )
    assert created.status_code == 201

    unrestricted = mode(MODE_UNRESTRICTED)
    row = (
        db_session.query(models.AccessModeLabel)
        .filter(
            models.AccessModeLabel.mode_id == unrestricted.system_id,
            models.AccessModeLabel.label_id
            == uuid.UUID(created.json()["system_id"]),
        )
        .first()
    )
    assert row is not None


def test_creating_a_label_grants_it_to_no_other_mode(admin_client, db_session, mode):
    created = admin_client.post(
        LABELS, json={"key": "erotica", "label": "Erotica", "sort_order": 0}
    )
    label_id = uuid.UUID(created.json()["system_id"])

    row = (
        db_session.query(models.AccessModeLabel)
        .filter(
            models.AccessModeLabel.mode_id == mode(MODE_NORMAL).system_id,
            models.AccessModeLabel.label_id == label_id,
        )
        .first()
    )
    assert row is None
