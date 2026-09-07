"""
Every payload a detail page builds a link from carries the target's public_id.

Detail URLs are /<type>/<public_id>/<slug>, and the SPA builds all of them
through one helper that needs the public_id and a name. A payload that offers
only a UUID forces the page back to a bare-UUID URL - which still resolves,
but shows a UUID in the address bar until it self-corrects and loses the slug
entirely. These are the payloads that used to do that.
"""

from app.services.domain import credits as credits_service


def test_credit_refs_carry_the_person_public_id(client, db_session, manga_with_credits):
    entry = manga_with_credits
    body = client.get(f"/api/manga/{entry.public_id}").json()
    refs = [r for group in body["credit_refs"].values() for r in group]
    assert refs, "fixture should credit at least one person"
    for ref in refs:
        assert ref["public_id"] > 0
        assert ref["display_name"]


def test_studio_refs_carry_the_studio_public_id(client, anime_with_studio):
    body = client.get(f"/api/anime/{anime_with_studio.public_id}").json()
    assert body["studio_refs"]
    for ref in body["studio_refs"]:
        assert ref["public_id"] > 0


def test_publisher_refs_carry_the_publisher_public_id(
    client, db_session, manga_entry
):
    credits_service.replace_credits(
        db_session, "manga", manga_entry.system_id, "publisher", ["Kadokawa"]
    )
    db_session.flush()
    body = client.get(f"/api/manga/{manga_entry.public_id}").json()
    assert body["publisher_refs"]
    for ref in body["publisher_refs"]:
        assert ref["public_id"] > 0


def test_casting_rows_carry_both_public_ids(client, seiyuu_with_one_casting, anime):
    rows = client.get(f"/api/casting/anime/{anime.system_id}").json()["cast"]
    assert rows
    for row in rows:
        assert row["character_public_id"] > 0
        assert row["person_public_id"] > 0


def test_entity_entries_carry_the_entry_public_id(client, anime_with_studio):
    """The cards on /studio, /person, /publisher and /character link to entries."""
    studio_id = client.get(
        f"/api/anime/{anime_with_studio.public_id}"
    ).json()["studio_refs"][0]["system_id"]
    groups = client.get(f"/api/studio/{studio_id}/entries").json()["groups"]
    assert groups
    for group in groups:
        assert group["entries"]
        for entry in group["entries"]:
            assert entry["public_id"] > 0


def test_character_entries_carry_the_seiyuu_public_id(
    client, seiyuu_with_one_casting, character
):
    # The nested /entries route keeps its UUID: only the detail GET widened.
    groups = client.get(f"/api/character/{character.system_id}/entries").json()["groups"]
    assert groups
    seen = [e for g in groups for e in g["entries"]]
    assert seen
    for entry in seen:
        assert entry["public_id"] > 0
        assert entry["seiyuu_public_id"] > 0


def test_a_dlc_carries_its_base_game_as_a_ref(client, db_session):
    """
    The game detail page linked to `base_game_id` and labelled it with a
    `base_game_name` the API never sent, so every DLC showed a bare
    "Base game". The ref carries the public_id the link needs and the name
    that was missing.
    """
    from app import models

    base = models.Game(game_name_en="Base Game", game_type="Base Game")
    db_session.add(base)
    db_session.flush()
    dlc = models.Game(
        game_name_en="The Expansion", game_type="DLC", base_game_id=base.system_id
    )
    db_session.add(dlc)
    db_session.flush()

    body = client.get(f"/api/game/{dlc.public_id}").json()
    assert body["base_game"]["public_id"] == base.public_id
    assert body["base_game"]["display_name"] == "Base Game"

    plain = client.get(f"/api/game/{base.public_id}").json()
    assert plain["base_game"] is None
