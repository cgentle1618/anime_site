"""
Which name column a person's name lands in.

The rule is shared by the reshape migration and by resolve_person, so it is
tested here once rather than in each. See the design spec's "One owner of the
rule" section for why it is shaped this way: a name that landed in name_en
during the migration and somewhere else the next day would be incoherent.
"""

import pytest

from app.utils.name_normalize import name_slot_for


@pytest.mark.parametrize(
    "name,role,scope,novel_type,expected",
    [
        # No CJK anywhere -> en, whatever the role.
        ("Ryan Coogler", "director", "movie", None, "en"),
        ("Evan Call", "composer", "anime", None, "en"),
        ("Abel Gongora", "director", "anime", None, "en"),
        # CJK anime-side staff -> cn.
        ("渡部高志", "director", "anime", None, "cn"),
        ("荒木哲郎", "director", "anime-movie", None, "cn"),
        ("伊藤智彥", "producer", "anime", None, "cn"),
        ("梶浦由記", "composer", "anime", None, "cn"),
        # CJK author of a plain novel -> cn; of a light/web novel -> jp.
        ("金庸", "author", "novel", "Novel", "cn"),
        ("金庸", "author", "novel", "Other", "cn"),
        ("金庸", "author", "novel", None, "jp"),
        ("鴨志田一", "author", "novel", "Light Novel", "jp"),
        ("鴨志田一", "author", "novel", "Web", "jp"),
        # Every other CJK -> jp.
        ("諫山創", "author", "manga", None, "jp"),
        ("えれっと", "illustrator", "novel", None, "jp"),
        ("藍本松", "illustrator", "manga", None, "jp"),
        ("北条司", "director", "movie", None, "jp"),
    ],
)
def test_name_slot_for(name, role, scope, novel_type, expected):
    assert name_slot_for(name, role=role, scope=scope, novel_type=novel_type) == expected


def test_never_returns_alt():
    """
    name_alt is the slot an admin uses for a name that is genuinely none of
    the three. A writer guessing its way into it would make that meaning
    useless, so no input may produce it.
    """
    cases = [
        ("Ryan Coogler", "director", "movie"),
        ("諫山創", "author", "manga"),
        ("渡部高志", "director", "anime"),
    ]
    for name, role, scope in cases:
        assert name_slot_for(name, role=role, scope=scope) in {"en", "cn", "jp"}


def test_mixed_script_name_is_not_latin():
    """A name with any CJK is not an English name, even mostly-Latin ones."""
    assert name_slot_for("Studio五組", role="author", scope="manga") == "jp"


def test_unknown_role_or_scope_still_returns_a_slot():
    """
    The migration calls this for every person, including any whose role rows
    are missing. It must not raise - a name with nowhere to go is worse than a
    name in the fallback slot.
    """
    assert name_slot_for("諫山創", role="", scope="") == "jp"
    assert name_slot_for("Ryan Coogler", role="", scope="") == "en"
