"""
The studio write path's Tenrai autofill.

Tenrai and the GCS upload are patched at the autofill module's own names, so
these exercise the real router -> autofill wiring without a network call.
"""

import pytest

from app.services.domain import autofill as autofill_module

MAPPA_RESULT = {
    "mal_id": 569,
    "url": "https://myanimelist.net/anime/producer/569/MAPPA",
    "titles": [
        {"type": "Default", "title": "MAPPA"},
        {"type": "Japanese", "title": "マッパ"},
    ],
    "images": {
        "jpg": {
            "image_url": "https://cdn.myanimelist.net/s/common/company_logos/e3a5.jpg"
        }
    },
    "established": "2011-06-14T00:00:00+00:00",
    "external": [{"name": "mappa.co.jp", "url": "http://www.mappa.co.jp/"}],
}


@pytest.fixture
def tenrai_calls(monkeypatch):
    """Records every producer id fetched, and stubs the logo download."""
    calls = []

    def fake_fetch(mal_id):
        calls.append(mal_id)
        return MAPPA_RESULT

    monkeypatch.setattr(autofill_module, "fetch_tenrai_producer_data", fake_fetch)
    monkeypatch.setattr(
        autofill_module, "download_cover_image", lambda url, system_id: "stored.jpg"
    )
    return calls


def test_creating_a_studio_with_a_mal_id_fills_it_from_mal(admin_client, tenrai_calls):
    body = admin_client.post(
        "/api/studio/", json={"name_en": "MAPPA", "mal_id": 569}
    ).json()
    assert tenrai_calls == [569]
    assert body["logo_file"] == "stored.jpg"
    assert body["founded_date"] == "2011-06-14"
    assert body["name_jp"] == "マッパ"
    assert body["website_url"] == "http://www.mappa.co.jp/"
    assert body["mal_link"] == "https://myanimelist.net/anime/producer/569/MAPPA"


def test_creating_a_studio_without_a_mal_id_calls_nothing(admin_client, tenrai_calls):
    body = admin_client.post("/api/studio/", json={"name_en": "Bones"}).json()
    assert tenrai_calls == []
    assert body["logo_file"] is None


def test_adding_a_mal_id_on_update_fills_the_studio(admin_client, tenrai_calls):
    created = admin_client.post("/api/studio/", json={"name_en": "MAPPA"}).json()
    body = admin_client.put(
        f"/api/studio/{created['system_id']}",
        json={"name_en": "MAPPA", "mal_id": 569},
    ).json()
    assert tenrai_calls == [569]
    assert body["logo_file"] == "stored.jpg"


def test_update_never_overwrites_a_logo_already_on_the_studio(
    admin_client, tenrai_calls
):
    created = admin_client.post("/api/studio/", json={"name_en": "MAPPA"}).json()
    body = admin_client.put(
        f"/api/studio/{created['system_id']}",
        json={"name_en": "MAPPA", "mal_id": 569, "logo_file": "mine.png"},
    ).json()
    assert body["logo_file"] == "mine.png"


def test_posting_an_existing_studio_name_does_not_refetch(admin_client, tenrai_calls):
    """
    POST is find-or-create - ensureSourceValues hits it for every typed name.
    Re-filling on each of those would spend the MAL budget on nothing.
    """
    admin_client.post("/api/studio/", json={"name_en": "MAPPA", "mal_id": 569})
    tenrai_calls.clear()
    admin_client.post("/api/studio/", json={"name_en": "MAPPA", "mal_id": 569})
    assert tenrai_calls == []


def test_creating_a_studio_from_a_pasted_link_derives_the_mal_id(
    admin_client, tenrai_calls
):
    body = admin_client.post(
        "/api/studio/",
        json={
            "name_en": "A-1 Pictures",
            "mal_link": "https://myanimelist.net/anime/producer/56/A-1_Pictures",
        },
    ).json()
    assert body["mal_id"] == 56
    assert tenrai_calls == [56]
    assert body["logo_file"] == "stored.jpg"


def test_pasting_the_link_on_update_derives_the_mal_id(admin_client, tenrai_calls):
    created = admin_client.post("/api/studio/", json={"name_en": "A-1 Pictures"}).json()
    body = admin_client.put(
        f"/api/studio/{created['system_id']}",
        json={
            "name_en": "A-1 Pictures",
            "mal_link": "https://myanimelist.net/anime/producer/56/A-1_Pictures",
        },
    ).json()
    assert body["mal_id"] == 56
    assert body["logo_file"] == "stored.jpg"


def test_a_website_in_mal_link_derives_nothing_and_fetches_nothing(
    admin_client, tenrai_calls
):
    body = admin_client.post(
        "/api/studio/", json={"name_en": "A-1 Pictures", "mal_link": "https://a-1p.co.jp/"}
    ).json()
    assert body["mal_id"] is None
    assert tenrai_calls == []
