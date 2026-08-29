"""
Regression test for app/registry.py: manga, novel and comic list_filters used
to carry "to_reread", a column dropped from those models. _factory.py's list
endpoint does `columns[field]` against Model.__table__.columns for every
configured filter, so passing that dead filter raised an unhandled KeyError
(500) instead of being silently ignored like any other unknown filter.
"""


def test_manga_list_ignores_dead_to_reread_filter(client):
    response = client.get("/api/manga/?to_reread=true")
    assert response.status_code == 200
