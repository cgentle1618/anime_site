"""Fill and Pull write link rows, not strings."""

from app import models
from app.services.domain.credits import credit_names


def test_a_fetched_studio_name_lands_on_a_studio_row(db_session):
    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()

    from app.services.domain.credits import replace_credits

    replace_credits(db_session, "anime", a.system_id, "studio", ["MAPPA"])
    db_session.commit()

    assert db_session.query(models.Studio).count() == 1
    assert credit_names(db_session, "anime", a.system_id, "studio") == ["MAPPA"]


def test_a_fetched_name_reuses_an_existing_studio(db_session):
    db_session.add(models.Studio(name_en="MAPPA"))
    db_session.commit()

    a = models.Anime(anime_name_cn="測試")
    db_session.add(a)
    db_session.commit()

    from app.services.domain.credits import replace_credits

    replace_credits(db_session, "anime", a.system_id, "studio", ["ＭＡＰＰＡ"])
    db_session.commit()
    assert db_session.query(models.Studio).count() == 1


def test_no_pipeline_or_autofill_module_still_assigns_a_dropped_column():
    """
    A source-inspection guard: none of the modules that write fetched external
    data onto an entry may assign a dropped comma-joined column directly.
    Fetched names must go through replace_credits/replace_tags instead, or the
    assignment silently creates a dead Python attribute (SQLAlchemy does not
    error on an unknown column) and the fetched value is thrown away.

    Checks both `attr =` assignment and `setattr(<any var>, "attr", ...)`,
    since autofill.py's comic path used the dynamic form against a `comic`
    variable - the regex does not assume that variable name, so it also
    catches the same pattern written as `setattr(movie, ...)`,
    `setattr(entry, ...)`, etc.
    """
    import inspect
    import re

    from app.services.domain import autofill
    from app.services.pipelines import fill, pull

    dropped_columns = (
        "studio",
        "director",
        "producer",
        "music",
        "distributor_tw",
        "genre_main",
        "genre_sub",
        "author_plot",
        "author_draw",
        "publisher_tw",
        "author",
        "illustrator",
        "writer",
        "artist",
        "publisher",
        "imprint",
        "continuity",
        "era",
        "events",
        "source_official",
    )

    for module in (fill, pull, autofill):
        source = inspect.getsource(module)
        for dropped in dropped_columns:
            assert f".{dropped} =" not in source, (
                f"{module.__name__} still assigns .{dropped} directly"
            )
            setattr_pattern = re.compile(
                r"""setattr\(\s*\w+\s*,\s*['"]""" + re.escape(dropped) + r"""['"]"""
            )
            assert not setattr_pattern.search(source), (
                f"{module.__name__} still setattr()s '{dropped}' directly"
            )
