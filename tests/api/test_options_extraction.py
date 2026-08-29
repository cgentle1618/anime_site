"""The rewritten, table-driven option extraction."""

from app import models
from app.services.domain.options_extraction import extract_system_options


def test_extraction_is_one_function_now():
    import app.services.domain.options_extraction as m

    assert not [n for n in dir(m) if n.startswith("extract_system_options_from_")]


def test_extraction_creates_no_duplicate_options(db_session):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()
    from app.services.domain.credits import replace_tags

    replace_tags(db_session, "anime", a.system_id, "genre_main", ["Action"])
    db_session.commit()

    extract_system_options(db_session)
    extract_system_options(db_session)
    assert db_session.query(models.SystemOption).filter_by(
        category="Genre Main", value="Action"
    ).count() == 1


def test_extraction_records_the_scope_a_value_is_used_in(db_session):
    show = models.TVShows(tv_name_cn="A")
    db_session.add(show)
    db_session.commit()
    from app.services.domain.credits import replace_tags

    replace_tags(db_session, "tv-show", show.system_id, "source_official", ["Netflix"])
    db_session.commit()

    # replace_tags already writes the scope row for the type it was called
    # with. Delete it so the extraction pass under test is what recreates it,
    # not a leftover from setup.
    opt = db_session.query(models.SystemOption).filter_by(
        category="Official Source", value="Netflix"
    ).one()
    db_session.query(models.SystemOptionScope).filter_by(
        option_id=opt.system_id
    ).delete()
    db_session.commit()

    extract_system_options(db_session)
    db_session.refresh(opt)
    assert [s.scope for s in opt.scopes] == ["tv-show"]


def test_the_old_tv_official_source_category_is_never_written(db_session):
    extract_system_options(db_session)
    assert (
        db_session.query(models.SystemOption)
        .filter_by(category="TV Official Source")
        .count()
        == 0
    )


def test_extraction_reports_counts(db_session):
    report = extract_system_options(db_session)
    assert set(report) >= {"status", "message"}


def test_extraction_actually_recreates_a_deleted_scope_row(db_session):
    """Prove the pass does work, not just that it returns success.

    A function that silently no-ops (the R19 bug: reading dropped legacy
    columns via getattr(..., None)) would still satisfy a bare "returns
    success" assertion. Assert the scope row count changes.
    """
    a = models.Anime(anime_name_cn="測試2")
    db_session.add(a)
    db_session.commit()
    from app.services.domain.credits import replace_tags

    replace_tags(db_session, "anime", a.system_id, "genre_main", ["Comedy"])
    db_session.commit()

    opt = db_session.query(models.SystemOption).filter_by(
        category="Genre Main", value="Comedy"
    ).one()
    db_session.query(models.SystemOptionScope).filter_by(
        option_id=opt.system_id
    ).delete()
    db_session.commit()
    assert opt.scopes == []

    report = extract_system_options(db_session)
    assert "Added 1" in report["message"]
    db_session.refresh(opt)
    assert [s.scope for s in opt.scopes] == ["anime"]
