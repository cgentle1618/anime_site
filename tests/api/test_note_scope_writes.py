"""
Who may write what, per the section's scope.

catalog: admin only. personal: any authenticated user holding
self.personal_notes, on their own rows only.

The plan drafted a new `note.write_own` permission; Step 2 had already shipped
`self.personal_notes`, whose catalogue description is this exact rule ("Write
your own personal-scope notes on an entry. Catalogue notes stay admin-only.").
Minting a second name for one idea is what `permissions.py` exists to forbid,
so this step enforces the grant that is already there.
"""

import uuid

import pytest

from app import models
from app.services.rbac.permissions import PERM_SELF_PERSONAL_NOTES


@pytest.fixture
def db(db_session):
    return db_session


def _payload(owner_id, section, content):
    return {
        "owner_type": "anime",
        "owner_id": str(owner_id),
        "section": section,
        "content": content,
    }


def test_a_plain_user_may_write_their_own_personal_note(
    db, user_client, sample_anime, plain_user
):
    r = user_client.post(
        "/api/notes", json=_payload(sample_anime.system_id, "advantages", "我的優點")
    )
    assert r.status_code == 201
    note = db.query(models.Note).filter_by(system_id=r.json()["system_id"]).one()
    assert note.author_id == plain_user.id


def test_a_plain_user_may_not_write_a_catalogue_note(user_client, sample_anime):
    r = user_client.post(
        "/api/notes",
        json=_payload(sample_anime.system_id, "public_reviews", "大眾評價"),
    )
    # 401: lacking manage.catalog is a capability failure, not a statement
    # about this entry. Decision 13.
    assert r.status_code == 401


def test_a_logged_out_visitor_may_not_write_anything(client, sample_anime):
    r = client.post(
        "/api/notes", json=_payload(sample_anime.system_id, "advantages", "訪客")
    )
    assert r.status_code in (401, 403)


def test_a_user_may_not_edit_someone_elses_personal_note(
    db, user_client, sample_anime, admin_user
):
    note = models.Note(
        system_id=uuid.uuid4(),
        media_id=sample_anime.system_id,
        section="advantages",
        content="admin 的",
        author_id=admin_user.id,
    )
    db.add(note)
    db.commit()

    # 404, not 403. Somebody else's note is an object this caller may not
    # reach, and a 403 confirms it exists exactly as surely as a 200 does.
    r = user_client.patch(f"/api/notes/{note.system_id}", json={"content": "被改了"})
    assert r.status_code == 404

    r = user_client.delete(f"/api/notes/{note.system_id}")
    assert r.status_code == 404


def test_an_admin_still_writes_catalogue_notes(db, admin_client, sample_anime):
    r = admin_client.post(
        "/api/notes",
        json=_payload(sample_anime.system_id, "public_reviews", "大眾評價"),
    )
    assert r.status_code == 201


def test_the_write_own_permission_is_in_the_catalogue(db):
    from app.services.rbac.permissions import catalog

    assert PERM_SELF_PERSONAL_NOTES in catalog(db)


def test_a_public_list_owners_personal_notes_reach_a_permitted_viewer(
    db, admin_client, sample_anime
):
    role_id = db.query(models.Role.system_id).first()[0]
    carol = models.User(
        id=uuid.uuid4(),
        username="carol",
        hashed_password="x",
        role_id=role_id,
        list_is_public=True,
    )
    db.add(carol)
    db.commit()
    db.add(
        models.Note(
            system_id=uuid.uuid4(),
            media_id=sample_anime.system_id,
            section="advantages",
            content="carol 的優點",
            author_id=carol.id,
        )
    )
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "author": "carol",
        },
    )
    assert r.status_code == 200
    assert [n["content"] for n in r.json() if n["section"] == "advantages"] == [
        "carol 的優點"
    ]


def test_a_private_list_owners_personal_notes_stay_private(
    db, admin_client, sample_anime
):
    role_id = db.query(models.Role.system_id).first()[0]
    dave = models.User(
        id=uuid.uuid4(),
        username="dave",
        hashed_password="x",
        role_id=role_id,
        list_is_public=False,
    )
    db.add(dave)
    db.commit()

    r = admin_client.get(
        "/api/notes",
        params={
            "owner_type": "anime",
            "owner_id": str(sample_anime.system_id),
            "author": "dave",
        },
    )
    # 404, and deliberately the same answer a username that does not exist
    # gets: a reader must not be able to tell a private account from one that
    # was never created.
    assert r.status_code == 404
