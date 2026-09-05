"""
The entries a person is credited on, with RBAC applied, and the delete guard.

Mirrors the studio endpoint. A person carries no content label of their own,
so a person whose every credit is hidden returns empty groups, not a 404 -
the same treatment credit_count already gets in _to_response.
"""

import uuid

import pytest

from app import models
from app.services.domain import credits as credits_service
from app.services.rbac.permissions import label_perm
from app.services.rbac.seed import default_guest_permissions
from tests.api.test_visibility import make_viewer, nsfw_label  # noqa: F401


@pytest.fixture
def person_with_credits(db_session, manga_with_credits):
    """The author of manga_with_credits, holding (author, manga)."""
    return credits_service.resolve_person(
        db_session, "諫山創", role="author", scope="manga"
    )


@pytest.fixture
def person_with_labelled_credit(db_session, sample_franchise, nsfw_label):
    """Someone whose only credit is on a content-labelled entry."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Zvornik Labelled Anime",
        airing_type="TV",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_type="anime",
            entry_id=entry.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    credits_service.replace_credits(
        db_session, "anime", entry.system_id, "director", ["Zvornik Director"]
    )
    db_session.flush()
    return credits_service.resolve_person(
        db_session, "Zvornik Director", role="director", scope="anime"
    )


@pytest.fixture
def seiyuu_with_hidden_casting(db_session, sample_franchise, nsfw_label, character):
    """A seiyuu whose only casting is on a content-labelled entry."""
    entry = models.Anime(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        anime_name_en="Zvornik Hidden Anime",
        airing_type="TV",
    )
    db_session.add(entry)
    db_session.flush()
    db_session.add(
        models.MediaContentLabel(
            system_id=uuid.uuid4(),
            media_type="anime",
            entry_id=entry.system_id,
            label_id=nsfw_label.system_id,
        )
    )
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Seiyuu")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.PersonRole(person_id=person.system_id, role="seiyuu", scope="anime")
    )
    db_session.add(
        models.CharacterCasting(
            character_id=character.system_id,
            media_type="anime",
            entry_id=entry.system_id,
            person_id=person.system_id,
        )
    )
    db_session.commit()
    return person


@pytest.fixture
def restricted_client(db_session, client, nsfw_label):
    """A viewer holding the default guest permissions but not the nsfw label."""
    return make_viewer(
        db_session,
        client,
        "norestricted",
        default_guest_permissions() - {label_perm(nsfw_label.key)},
    )


# ---------------------------------------------------------------------------
# GET /api/person/{id}/entries
# ---------------------------------------------------------------------------


def test_entries_are_grouped_by_media_type_and_role(client, person_with_credits):
    body = client.get(f"/api/person/{person_with_credits.system_id}/entries").json()
    manga = next(g for g in body["groups"] if g["media_type"] == "manga")
    assert manga["role"] == "author"
    # The label is the credit's name on THAT media type, not the role key.
    assert manga["label"] == "原作"
    assert manga["entries"][0]["display_name"]
    assert "cover_image_file" in manga["entries"][0]


def test_an_unknown_person_is_404(client):
    r = client.get(f"/api/person/{uuid.uuid4()}/entries")
    assert r.status_code == 404


def test_a_labelled_entry_is_hidden_from_a_restricted_viewer(
    restricted_client, person_with_labelled_credit
):
    body = restricted_client.get(
        f"/api/person/{person_with_labelled_credit.system_id}/entries"
    ).json()
    assert all(not g["entries"] for g in body["groups"])
    assert "Zvornik Labelled Anime" not in restricted_client.get(
        f"/api/person/{person_with_labelled_credit.system_id}/entries"
    ).text


def test_a_superuser_sees_the_labelled_entry(
    admin_client, person_with_labelled_credit
):
    body = admin_client.get(
        f"/api/person/{person_with_labelled_credit.system_id}/entries"
    ).json()
    assert any(g["entries"] for g in body["groups"])


def test_all_credits_hidden_is_empty_not_404(
    restricted_client, person_with_labelled_credit
):
    """
    The person is not the secret, their credits are - so a person every one of
    whose entries is withheld still answers 200 with empty groups.
    """
    r = restricted_client.get(
        f"/api/person/{person_with_labelled_credit.system_id}/entries"
    )
    assert r.status_code == 200


def test_a_seiyuus_entries_come_from_castings(client, seiyuu_with_one_casting, anime):
    """A pure seiyuu's page would otherwise be empty: /entries walked only
    media_credit, where a seiyuu has nothing."""
    groups = client.get(
        f"/api/person/{seiyuu_with_one_casting.system_id}/entries"
    ).json()["groups"]
    seiyuu_groups = [g for g in groups if g["role"] == "seiyuu"]
    assert len(seiyuu_groups) == 1
    group = seiyuu_groups[0]
    assert group["media_type"] == "anime"
    assert group["label"] == "Seiyuu 聲優"
    assert [e["system_id"] for e in group["entries"]] == [str(anime.system_id)]
    # The character voiced is the point of a seiyuu credit; without it the
    # group says only "was in this anime", which is what Decision A rejected.
    assert group["entries"][0]["character_name"]


def test_a_hidden_entry_is_filtered_from_a_seiyuus_groups(
    client, seiyuu_with_hidden_casting
):
    groups = client.get(
        f"/api/person/{seiyuu_with_hidden_casting.system_id}/entries"
    ).json()["groups"]
    for group in groups:
        assert group["entries"] == []


# ---------------------------------------------------------------------------
# DELETE /api/person/{id}?credits=N
# ---------------------------------------------------------------------------


def test_delete_rejects_a_stale_credit_count(admin_client, person_with_credits):
    r = admin_client.delete(f"/api/person/{person_with_credits.system_id}?credits=99")
    assert r.status_code == 409
    assert "credits" in r.json()["detail"].lower()


def test_delete_accepts_the_current_credit_count(
    admin_client, person_with_credits, db_session
):
    n = (
        db_session.query(models.MediaCredit)
        .filter_by(person_id=person_with_credits.system_id)
        .count()
    )
    r = admin_client.delete(
        f"/api/person/{person_with_credits.system_id}?credits={n}"
    )
    assert r.status_code == 200
    assert db_session.get(models.Person, person_with_credits.system_id) is None


def test_delete_without_the_count_is_rejected(admin_client, person_with_credits):
    """
    The count is required, not optional: a caller that forgets it would delete
    credit history the admin never saw a number for.
    """
    r = admin_client.delete(f"/api/person/{person_with_credits.system_id}")
    assert r.status_code == 422
