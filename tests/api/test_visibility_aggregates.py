"""
Hiding an entry has to hide everything that names it.

The library list is the obvious route and the least interesting one. A quote
carries its own text, a meme its own caption, a plan-next row the entry's
display name, and /api/credits and /api/note are public GETs keyed by
(type, id) that confirm an entry exists even when they return little. Each of
these is a separate way to read a hidden entry, so each gets a test.

Assertions are on response.text: these payloads nest resolved display data
under keys that differ per route (entry_display_name, owner_display_name,
display_name), and a substring check does not care which.
"""

import uuid

import pytest

from app import models
from tests.api.test_visibility import HIDDEN_NAME, hidden_anime, nsfw_label  # noqa: F401

QUOTE_TEXT = "Zvornik quote body that must not leak"
MEME_TEXT = "Zvornik meme caption that must not leak"


@pytest.fixture
def hidden_quote(db_session, hidden_anime):
    q = models.Quote(
        system_id=uuid.uuid4(),
        media_type="anime",
        entry_id=hidden_anime.system_id,
        text=QUOTE_TEXT,
    )
    db_session.add(q)
    db_session.flush()
    return q


@pytest.fixture
def general_quote(db_session):
    """Not tied to any entry - must survive the filter."""
    q = models.Quote(
        system_id=uuid.uuid4(), text="A general quote tied to nothing"
    )
    db_session.add(q)
    db_session.flush()
    return q


@pytest.fixture
def hidden_meme(db_session, hidden_anime):
    m = models.Meme(
        system_id=uuid.uuid4(),
        owner_type="anime",
        owner_id=hidden_anime.system_id,
        text=MEME_TEXT,
    )
    db_session.add(m)
    db_session.flush()
    return m


@pytest.fixture
def hidden_plan(db_session, hidden_anime):
    p = models.PlanNext(
        system_id=uuid.uuid4(),
        kind="next",
        media_type="anime",
        scope="entry",
        target_id=hidden_anime.system_id,
    )
    db_session.add(p)
    db_session.flush()
    return p


# ---------------------------------------------------------------------------
# Quotes - the text is itself the leak
# ---------------------------------------------------------------------------

def test_a_quote_on_a_hidden_entry_is_not_listed(client, hidden_quote):
    response = client.get("/api/quote/")
    assert response.status_code == 200
    assert QUOTE_TEXT not in response.text
    assert HIDDEN_NAME not in response.text


def test_a_quote_on_a_hidden_entry_is_not_grouped(client, hidden_quote):
    response = client.get("/api/quote/grouped")
    assert response.status_code == 200
    assert QUOTE_TEXT not in response.text


def test_a_quote_on_a_hidden_entry_is_not_found_by_id(client, hidden_quote):
    response = client.get(f"/api/quote/{hidden_quote.system_id}")
    assert response.status_code == 404
    assert QUOTE_TEXT not in response.text


def test_a_general_quote_survives(client, general_quote):
    """A quote with no entry behind it is nobody's secret."""
    assert general_quote.text in client.get("/api/quote/").text


def test_admin_still_sees_the_quote(admin_client, hidden_quote):
    assert QUOTE_TEXT in admin_client.get("/api/quote/").text


# ---------------------------------------------------------------------------
# Memes
# ---------------------------------------------------------------------------

def test_a_meme_on_a_hidden_entry_is_not_listed(client, hidden_meme):
    response = client.get("/api/meme/")
    assert response.status_code == 200
    assert MEME_TEXT not in response.text


def test_a_meme_on_a_hidden_entry_is_not_found_by_id(client, hidden_meme):
    assert client.get(f"/api/meme/{hidden_meme.system_id}").status_code == 404


# ---------------------------------------------------------------------------
# Public GETs keyed by (type, id) - existence is the leak
# ---------------------------------------------------------------------------

def test_credits_for_a_hidden_entry_are_not_found(client, hidden_anime):
    response = client.get(f"/api/credits/anime/{hidden_anime.system_id}")
    assert response.status_code == 404


def test_credits_for_a_visible_entry_still_work(client, sample_anime):
    assert client.get(f"/api/credits/anime/{sample_anime.system_id}").status_code == 200


def test_notes_for_a_hidden_entry_are_not_found(client, hidden_anime):
    response = client.get(
        "/api/notes", params={"owner_type": "anime", "owner_id": str(hidden_anime.system_id)}
    )
    assert response.status_code == 404


def test_notes_for_a_visible_entry_still_work(client, sample_anime):
    response = client.get(
        "/api/notes", params={"owner_type": "anime", "owner_id": str(sample_anime.system_id)}
    )
    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Plan Next
# ---------------------------------------------------------------------------

def test_a_plan_row_for_a_hidden_entry_is_dropped(client, hidden_plan):
    response = client.get("/api/plan-next/")
    assert response.status_code == 200
    assert HIDDEN_NAME not in response.text
    assert str(hidden_plan.target_id) not in response.text


def test_admin_still_sees_the_plan_row(admin_client, hidden_plan):
    assert HIDDEN_NAME in admin_client.get("/api/plan-next/").text


# ---------------------------------------------------------------------------
# Relations
# ---------------------------------------------------------------------------

def test_relations_for_a_hidden_anchor_are_not_found(client, hidden_anime):
    response = client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(hidden_anime.system_id)},
    )
    assert response.status_code == 404


def test_a_relation_edge_to_a_hidden_entry_is_dropped(
    client, db_session, sample_anime, hidden_anime
):
    db_session.add(
        models.MediaRelation(
            system_id=uuid.uuid4(),
            relation_type="sequel",
            from_type="anime",
            from_id=sample_anime.system_id,
            to_type="anime",
            to_id=hidden_anime.system_id,
        )
    )
    db_session.flush()

    response = client.get(
        "/api/media-relation/for-entry",
        params={"media_type": "anime", "entry_id": str(sample_anime.system_id)},
    )
    assert response.status_code == 200
    assert HIDDEN_NAME not in response.text
    assert str(hidden_anime.system_id) not in response.text


# ---------------------------------------------------------------------------
# Memes, grouped
# ---------------------------------------------------------------------------

def test_a_meme_on_a_hidden_entry_is_not_grouped(client, hidden_meme):
    response = client.get("/api/meme/grouped")
    assert response.status_code == 200
    assert MEME_TEXT not in response.text
    assert HIDDEN_NAME not in response.text


# ---------------------------------------------------------------------------
# Watch orders - a step names the entry it points at
# ---------------------------------------------------------------------------

@pytest.fixture
def hidden_watch_step(db_session, sample_franchise, hidden_anime):
    wo = models.WatchOrderList(
        system_id=uuid.uuid4(),
        franchise_id=sample_franchise.system_id,
        list_name="Order under test",
    )
    db_session.add(wo)
    db_session.flush()
    item = models.WatchOrderItem(
        system_id=uuid.uuid4(),
        list_id=wo.system_id,
        position=1,
        media_type="anime",
        entry_id=hidden_anime.system_id,
    )
    db_session.add(item)
    db_session.flush()
    return wo


def test_a_watch_order_step_on_a_hidden_entry_is_dropped(
    client, hidden_watch_step
):
    response = client.get(f"/api/watch-order/lists/{hidden_watch_step.system_id}")
    assert response.status_code == 200
    assert HIDDEN_NAME not in response.text


def test_admin_still_sees_the_watch_order_step(admin_client, hidden_watch_step):
    response = admin_client.get(
        f"/api/watch-order/lists/{hidden_watch_step.system_id}"
    )
    assert HIDDEN_NAME in response.text


def test_a_hidden_entry_is_not_an_addable_candidate(
    client, sample_franchise, hidden_anime
):
    response = client.get(
        "/api/watch-order/candidates",
        params={"franchise_id": str(sample_franchise.system_id)},
    )
    assert response.status_code == 200
    assert HIDDEN_NAME not in response.text


# ---------------------------------------------------------------------------
# Credit counts - a number is a smaller leak, but still one
# ---------------------------------------------------------------------------

def test_a_credit_on_a_hidden_entry_is_not_counted(
    client, db_session, hidden_anime
):
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Director")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            system_id=uuid.uuid4(),
            media_type="anime",
            entry_id=hidden_anime.system_id,
            role="director",
            person_id=person.system_id,
        )
    )
    db_session.flush()

    body = client.get("/api/person/").json()
    row = next(p for p in body if p["system_id"] == str(person.system_id))
    assert row["credit_count"] == 0


def test_admin_still_counts_the_credit(admin_client, db_session, hidden_anime):
    person = models.Person(system_id=uuid.uuid4(), name_en="Zvornik Director 2")
    db_session.add(person)
    db_session.flush()
    db_session.add(
        models.MediaCredit(
            system_id=uuid.uuid4(),
            media_type="anime",
            entry_id=hidden_anime.system_id,
            role="director",
            person_id=person.system_id,
        )
    )
    db_session.flush()

    body = admin_client.get("/api/person/").json()
    row = next(p for p in body if p["system_id"] == str(person.system_id))
    assert row["credit_count"] == 1
