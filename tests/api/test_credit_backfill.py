"""The one-time backfill from string columns into link tables."""

from app import models
from app.services.domain.credits import backfill_credits, credit_names, tag_values


def _anime(db_session, **kwargs):
    a = models.Anime(anime_name_cn="測試", **kwargs)
    db_session.add(a)
    db_session.commit()
    return a


def test_splits_a_comma_joined_column_into_rows(db_session):
    a = _anime(db_session, studio="MAPPA, WIT STUDIO")
    backfill_credits(db_session)
    assert credit_names(db_session, "anime", a.system_id, "studio") == [
        "MAPPA",
        "WIT STUDIO",
    ]


def test_two_entries_sharing_a_studio_produce_one_studio_row(db_session):
    _anime(db_session, studio="MAPPA")
    _anime(db_session, studio="MAPPA")
    backfill_credits(db_session)
    assert db_session.query(models.Studio).count() == 1


def test_spelling_variants_collapse_to_one_person(db_session):
    _anime(db_session, director="新海 誠")
    _anime(db_session, director="新海誠")
    backfill_credits(db_session)
    assert db_session.query(models.Person).count() == 1


def test_anime_directors_get_the_anime_scope(db_session):
    _anime(db_session, director="新海誠")
    backfill_credits(db_session)
    role = db_session.query(models.PersonRole).one()
    assert (role.role, role.scope) == ("director", "anime")


def test_movie_directors_get_the_non_anime_scope(db_session):
    m = models.Movies(movie_name_cn="全面啟動", director="Christopher Nolan")
    db_session.add(m)
    db_session.commit()
    backfill_credits(db_session)
    role = db_session.query(models.PersonRole).one()
    assert (role.role, role.scope) == ("director", "non_anime")


def test_genres_become_tags_not_credits(db_session):
    a = _anime(db_session, genre_main="Action, SF")
    backfill_credits(db_session)
    assert tag_values(db_session, "anime", a.system_id, "genre_main") == [
        "Action",
        "SF",
    ]
    assert db_session.query(models.MediaCredit).count() == 0


def test_distributor_tw_and_manga_publisher_tw_merge_into_one_category(
    db_session,
):
    _anime(db_session, distributor_tw="東立")
    mg = models.Manga(manga_name_cn="測試漫畫", publisher_tw="東立")
    db_session.add(mg)
    db_session.commit()

    backfill_credits(db_session)
    options = db_session.query(models.SystemOption).filter_by(
        category="Publisher / Distributor TW"
    ).all()
    assert len(options) == 1
    assert {s.scope for s in options[0].scopes} == {"anime", "manga"}


def test_official_source_merges_across_tv_show_and_cartoon(db_session):
    db_session.add(models.TVShows(tv_name_cn="A", source_official="Netflix"))
    db_session.add(models.Cartoon(cartoon_name_cn="B", source_official="Netflix"))
    db_session.commit()

    backfill_credits(db_session)
    options = db_session.query(models.SystemOption).filter_by(
        category="Official Source"
    ).all()
    assert len(options) == 1
    assert {s.scope for s in options[0].scopes} == {"tv-show", "cartoon"}


def test_manga_anime_studio_is_not_migrated(db_session):
    mg = models.Manga(manga_name_cn="測試漫畫", anime_studio="MAPPA")
    db_session.add(mg)
    db_session.commit()
    backfill_credits(db_session)
    assert db_session.query(models.MediaCredit).count() == 0


def test_running_twice_changes_nothing(db_session):
    _anime(db_session, studio="MAPPA, WIT STUDIO", director="新海誠")
    first = backfill_credits(db_session)
    second = backfill_credits(db_session)
    assert db_session.query(models.MediaCredit).count() == 3
    assert first["credits"] == second["credits"]


def test_unplaced_values_are_reported_not_guessed(db_session):
    a = _anime(db_session, studio="MAPPA, , ,")
    report = backfill_credits(db_session)
    assert credit_names(db_session, "anime", a.system_id, "studio") == ["MAPPA"]
    assert any(u["column"] == "studio" for u in report["unplaced"])


def test_report_counts_what_it_created(db_session):
    _anime(db_session, studio="MAPPA", genre_main="Action")
    report = backfill_credits(db_session)
    assert report["studios"] == 1
    assert report["credits"] == 1
    assert report["tags"] == 1
