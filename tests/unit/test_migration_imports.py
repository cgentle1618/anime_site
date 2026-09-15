"""A revision must be self-contained: no imports from the application.

A data migration that reaches into live application code looks harmless and
rots silently. The usual shape is a query through an ORM model::

    from app.models import Publisher
    publishers = session.query(Publisher).all()

SQLAlchemy emits a SELECT naming every column the model declares *right now*,
and "right now" keeps moving. When a later migration adds a column to that
table, this revision's query asks for a column that does not exist yet at this
point in the chain, and building from zero dies on a migration nobody touched.

Two things make it expensive:

  * **It breaks for the wrong person.** Whoever adds the column sees nothing
    wrong; the failure lands on whoever next builds from scratch - a new
    machine, CI, or a from-scratch deploy.
  * **A revision is supposed to be frozen.** It must keep meaning what it meant
    the day it ran, and importing live code means its meaning changes
    underneath it.

The rule is deliberately "no imports from `app`" rather than "no ORM models".
The danger is not that `app.models` specifically is unsafe; it is that *any*
value taken from live application code can change after the revision is
written. A constant renamed, an enum member removed, a module reorganised -
each silently changes what an old revision does. A narrower rule would encode a
distinction that does not survive the next reorganisation, and
`4832c83905a3_baseline_schema` already states the principle in its general
form: frozen as literal SQL rather than imported.

There is no opt-out marker, on purpose. A waiver on a rule like this gets used
the first time somebody is in a hurry and is invisible in review afterwards. If
a genuine need appears, the right response is a person looking at it - which a
failing assertion produces and a marker prevents.
"""

import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]

# Scoped to alembic/versions/ and NOT alembic/versions_archive/, which holds 145
# revisions retired by the squash onto the baseline - 10 of which import `app`.
# A glob over both fails on day one, and that failure reads as "this rule is
# unsatisfiable" rather than "this glob is mis-scoped", which is how a useful
# guard gets deleted. Both directories are in ruff.toml's extend-exclude, so
# nothing else in the repo would reveal the archive's existence either.
VERSIONS = ROOT / "alembic" / "versions"

# Anchored to line-start import syntax. A loose search for "app.models" matches
# PROSE - both current hits in this repo are docstrings saying the opposite
# ("imports nothing from app.models") - so the pattern has to describe the
# statement, not the substring.
APP_IMPORT = re.compile(r"^\s*(?:from|import)\s+app\b", re.M)


def revision_files() -> list[Path]:
    return sorted(p for p in VERSIONS.glob("*.py") if p.name != "__init__.py")


@pytest.mark.parametrize("path", revision_files(), ids=lambda p: p.name)
def test_no_revision_imports_the_application(path):
    body = path.read_text(encoding="utf-8")
    offenders = APP_IMPORT.findall(body)
    assert not offenders, (
        f"{path.name} imports from `app`. A revision must be self-contained: "
        "freeze the values it needs as literal SQL in the revision instead. "
        "See this module's docstring for why."
    )


def test_the_versions_directory_is_not_empty():
    # Every assertion above is satisfied vacuously by an empty directory, and a
    # mis-scoped path would produce exactly that: zero files, zero failures,
    # green forever. Assert the set being checked is non-empty so the guard
    # cannot pass by checking nothing.
    assert len(revision_files()) > 5


def test_the_pattern_actually_matches_a_real_import():
    # The parametrised test above is green because nothing violates the rule
    # today, so on its own it proves nothing about whether the pattern WORKS.
    # A typo in the regex would look identical: all green, forever, including
    # through the change it exists to catch. These samples make the guard's
    # teeth the thing under test.
    must_match = [
        "from app.models import Publisher",
        "import app.models",
        "    from app.services.domain.credits import resolve_person",
        "from app import models",
    ]
    for sample in must_match:
        assert APP_IMPORT.search(sample), sample


def test_the_pattern_does_not_match_prose_or_unrelated_names():
    # The false-positive half. Both real hits for a loose "app.models" search in
    # this repo are docstrings stating the revision does NOT import it, and a
    # pattern that flagged those would make the guard unusable on the very
    # revisions that are doing the right thing.
    must_not_match = [
        "imports nothing from app.models: a data migration that selects live",
        "Both are frozen as literal SQL rather than imported from app.models.",
        "from application_config import thing",
        "import appdirs",
        "# from app.models import Publisher  (deliberately not done)",
    ]
    for sample in must_not_match:
        assert not APP_IMPORT.search(sample), sample
