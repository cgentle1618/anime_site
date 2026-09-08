"""
Deleting a media entry must take its credit and tag rows with it.

media_credit / media_tag address their entry by a FK-less
(media_type, entry_id) pair - no single foreign key can span the eight media
tables - so nothing cascades on its own. Without an explicit cleanup the rows
outlive the entry forever, and the orphans then feed extract_system_options
and the duplicate checks. delete_plans_for already solves the same problem for
plan_next; these tests pin the equivalent for links.
"""

from app import models
from app.services.domain import credits as credits_service


def _links(db_session, media_type, entry_id):
    return (
        db_session.query(models.MediaCredit)
        .filter_by(media_type=media_type, entry_id=entry_id)
        .count()
        + db_session.query(models.MediaTag)
        .filter_by(media_type=media_type, entry_id=entry_id)
        .count()
    )


def test_deleting_an_anime_removes_its_links(admin_client, db_session):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    credits_service.replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA"])
    credits_service.replace_tags(
        db_session, "anime", a.system_id, "genre_main", ["Action"]
    )
    db_session.commit()
    assert _links(db_session, "anime", a.system_id) == 2

    assert admin_client.delete(f"/api/anime/{a.system_id}").status_code == 200
    assert _links(db_session, "anime", a.system_id) == 0


def test_deleting_an_anime_movie_removes_its_links(admin_client, db_session):
    m = models.AnimeMovies(anime_movie_name_cn="測試電影")
    db_session.add(m)
    db_session.commit()
    credits_service.replace_credits(
        db_session, "anime-movie", m.system_id, "director", ["新海誠"]
    )
    db_session.commit()
    assert _links(db_session, "anime-movie", m.system_id) == 1

    assert admin_client.delete(f"/api/anime-movie/{m.system_id}").status_code == 200
    assert _links(db_session, "anime-movie", m.system_id) == 0


def test_deleting_a_factory_type_entry_removes_its_links(admin_client, db_session):
    """Comic goes through the shared router factory, which the other five use."""
    c = models.Comic(comic_name_en="Saga")
    db_session.add(c)
    db_session.commit()
    credits_service.replace_credits(
        db_session, "comic", c.system_id, "author", ["Brian K. Vaughan"]
    )
    credits_service.replace_tags(
        db_session, "comic", c.system_id, "comic_era", ["Modern Age"]
    )
    db_session.commit()
    assert _links(db_session, "comic", c.system_id) == 2

    assert admin_client.delete(f"/api/comic/{c.system_id}").status_code == 200
    assert _links(db_session, "comic", c.system_id) == 0


def test_another_entrys_links_are_left_alone(admin_client, db_session):
    """The delete is scoped to one (media_type, entry_id), not to the role."""
    a = models.Anime(anime_name_cn="甲")
    b = models.Anime(anime_name_cn="乙")
    db_session.add_all([a, b])
    db_session.commit()
    for entry in (a, b):
        credits_service.replace_credits(
            db_session, "anime", entry.system_id, "studio", ["MAPPA"]
        )
    db_session.commit()

    admin_client.delete(f"/api/anime/{a.system_id}")
    assert _links(db_session, "anime", b.system_id) == 1
