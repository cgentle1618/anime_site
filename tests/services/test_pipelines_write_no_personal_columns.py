"""
No pipeline write path may name a user_media_list column.

Static, not behavioural: this reads the pipeline modules' source and fails on
the mention. A behavioural test would need one case per pipeline per column,
and would still miss the next one somebody adds. The blunt version is the one
that keeps working.

The models no longer stop this on their own. A pipeline that sets an attribute
the model does not declare fails loudly on a `Model(**dict)` but silently on a
`setattr`, and pull.py upserts with `setattr` - so a stray personal key would
be quietly dropped rather than raising, and the value the user typed would
appear to have been saved.

Whitelisted mentions are listed explicitly with a reason. Adding to that list
is a decision, which is the point of making it a literal.
"""

import ast
import pathlib

import pytest

from app.services.domain.user_list import LIST_FIELDS

ROOT = pathlib.Path(__file__).resolve().parents[2]

# Every payload key that lives on a list row, from the one table that defines
# them. Derived, so a column added to user_media_list is guarded from day one.
PERSONAL = {field for fields in LIST_FIELDS.values() for field in fields}

PIPELINE_FILES = [
    "app/services/pipelines/fill.py",
    "app/services/pipelines/replace.py",
    "app/services/pipelines/pull.py",
    "app/services/pipelines/specs.py",
    "app/services/pipelines/runner.py",
    "app/services/domain/post_processing.py",
    "app/services/domain/autofill.py",
    "app/services/domain/checking.py",
]

# name -> why it is allowed to appear. Add a line and a reason if a genuine
# catalogue use of one of these names turns up.
ALLOWED: dict[str, str] = {}


def _identifiers(path: pathlib.Path) -> set[str]:
    """Every attribute name, keyword argument and string literal in the file."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    found = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute):
            found.add(node.attr)
        elif isinstance(node, ast.keyword) and node.arg:
            found.add(node.arg)
        elif isinstance(node, ast.Constant) and isinstance(node.value, str):
            found.add(node.value)
        elif isinstance(node, ast.Name):
            found.add(node.id)
    return found


@pytest.mark.parametrize("relative", PIPELINE_FILES)
def test_no_pipeline_file_names_a_personal_column(relative):
    path = ROOT / relative
    if not path.exists():
        pytest.skip(f"{relative} does not exist")
    named = _identifiers(path) & PERSONAL
    named -= set(ALLOWED)
    assert not named, (
        f"{relative} names personal column(s) {sorted(named)}. A pipeline may "
        "not write anyone's list row; move the write to a list-aware service "
        "or, if this is a genuine catalogue use, add it to ALLOWED with a reason."
    )


def test_no_sheet_parser_for_a_media_tab_parses_a_personal_column():
    """The nine media tabs carry catalogue columns only; the personal values
    travel in the User Media List tab."""
    import inspect

    from app.utils import formatter

    parsers = [
        formatter.parse_anime_from_sheet,
        formatter.parse_anime_movie_from_sheet,
        formatter.parse_movie_from_sheet,
        formatter.parse_tv_show_from_sheet,
        formatter.parse_cartoon_from_sheet,
        formatter.parse_manga_from_sheet,
        formatter.parse_novel_from_sheet,
        formatter.parse_comic_from_sheet,
        formatter.parse_game_from_sheet,
    ]
    for parser in parsers:
        source = inspect.getsource(parser)
        named = {name for name in PERSONAL if f'"{name}"' in source}
        assert not named, f"{parser.__name__} parses {sorted(named)}"


def test_the_guard_actually_has_teeth():
    """A canary: if PERSONAL ever comes back empty the two tests above pass
    vacuously and guard nothing."""
    assert len(PERSONAL) >= 12
    assert "watching_status" in PERSONAL
    assert "my_rating" in PERSONAL
