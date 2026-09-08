"""Every source in the old columns survives the move to media_source.

`test_every_source_other_key_becomes_a_row` from the brief is deliberately
NOT included here: this suite builds its schema with `Base.metadata.create_all`
and never runs migrations, so a test asserting against `media_source` rows
here would find an empty table and pass vacuously. The real losslessness
check is the manual verification run against the live database (see
task-11-report.md).
"""

import importlib.util
import pathlib

_spec = importlib.util.spec_from_file_location(
    "bf1i2l3l4",
    pathlib.Path(__file__).parents[2]
    / "alembic/versions/bf1i2l3l4_backfill_media_source.py",
)
migration = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(migration)


def test_the_map_covers_every_media_type():
    from app.utils.media_resolver import MEDIA_TYPE_KEYS

    assert set(migration.SOURCE_COLUMNS) == set(MEDIA_TYPE_KEYS)


def test_baha_carries_both_its_flag_and_its_link():
    anime = migration.SOURCE_COLUMNS["anime"]
    baha = next(c for c in anime if c.option_value == "Bahamut")
    assert baha.flag_column == "source_baha"
    assert baha.link_column == "baha_link"


def test_netflix_has_a_flag_but_no_link_column():
    anime = migration.SOURCE_COLUMNS["anime"]
    netflix = next(c for c in anime if c.option_value == "Netflix")
    assert netflix.flag_column == "source_netflix"
    assert netflix.link_column is None


def test_reference_columns_carry_no_flag():
    anime = migration.SOURCE_COLUMNS["anime"]
    for column in anime:
        if column.kind == "reference":
            assert column.flag_column is None


def test_comic_has_no_access_columns_to_migrate():
    assert [c for c in migration.SOURCE_COLUMNS["comic"] if c.kind == "access"] == []
