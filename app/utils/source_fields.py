"""
The closed vocabulary behind media_source.

Shaped like credit_roles.py: constants that code branches on live here, not in
system_option, so they cannot be renamed out from under the logic. The values
inside a category - Netflix, Bahamut, Wikipedia - are open vocabulary and do
live in system_option, managed on the admin Options page.
"""

# media_source.kind
SOURCE_KINDS: tuple[str, ...] = ("access", "reference")

# media_source.bucket
SOURCE_BUCKETS: tuple[str, ...] = ("main", "other", "restricted")

# The buckets whose rows carry a typed name instead of an option_id. These are
# the gated ones - see FIELD_GROUPS in app/services/rbac/field_groups.py.
FREE_FORM_BUCKETS: tuple[str, ...] = ("other", "restricted")

# system_option_usage.usage. A value with no usage rows serves both.
OPTION_USAGES: tuple[str, ...] = ("watch", "origin")

# system_option_alias.source. The external APIs whose English is resolved back
# to a vocabulary value on the way in. Closed, because a source is asked for by
# name - autofill_game_from_igdb asks for "igdb" - so a value not on this list
# can never be matched by anything and would sit in the table doing nothing.
ALIAS_SOURCES: tuple[str, ...] = ("igdb",)

# The system_option categories that may carry alias rows at all.
#
# Deliberately a constant rather than an admin-editable setting. An alias is
# only useful where a pipeline actually asks for one, and the code that asks is
# autofill_game_from_igdb - so opening a category to aliases means teaching a
# pipeline to read them, which is a code change by definition. Left open, an
# admin could attach "Shooter" to a Genre Main row and watch it do nothing
# forever, with nothing anywhere to say why.
#
# These are exactly the four IGDB fields autofill_game_from_igdb resolves.
# Combat Mode is the game category NOT here: PvE/PvP is a hand-made
# classification IGDB does not model, so it carries no aliases at all.
#
# Game Platform is the odd one of the four. Its values are brand names, and
# several IGDB names fold into each - "PlayStation 4" and "PlayStation 5" both
# become PlayStation - so its rows are many-to-one where the other three are
# mostly one-to-one. game_vocabulary.py seeds them; editing them by hand is
# allowed, because a new console generation is exactly the case where waiting
# for a code change would be silly.
ALIAS_CATEGORIES: tuple[str, ...] = (
    "Game Genre",
    "Game Theme",
    "Game Mode",
    "Game Platform",
)

# system_option categories.
PLATFORM_CATEGORY = "Platform"
REFERENCE_CATEGORY = "Reference Source"
SERIALIZATION_CATEGORY = "Serialization Platform"

# The one Platform value code branches on: Check derives a Bahamut row's
# `available` from its url the way it used to derive source_baha from
# baha_link. Every other platform is pure vocabulary.
BAHAMUT_VALUE = "Bahamut"

# Reference Source values the Fill pipeline writes rows for, from the two
# links Tenrai returns.
OFFICIAL_SITE_VALUE = "Official site"
TWITTER_VALUE = "Twitter"
ANILIST_VALUE = "AniList"

_CATEGORY_BY_KIND: dict[str, str] = {
    "access": PLATFORM_CATEGORY,
    "reference": REFERENCE_CATEGORY,
}


def category_for_kind(kind: str) -> str:
    """The system_option category a main row of this kind draws from."""
    return _CATEGORY_BY_KIND[kind]
