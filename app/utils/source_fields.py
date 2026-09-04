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

# system_option categories.
PLATFORM_CATEGORY = "Platform"
REFERENCE_CATEGORY = "Reference Source"
SERIALIZATION_CATEGORY = "Serialization Platform"

_CATEGORY_BY_KIND: dict[str, str] = {
    "access": PLATFORM_CATEGORY,
    "reference": REFERENCE_CATEGORY,
}


def category_for_kind(kind: str) -> str:
    """The system_option category a main row of this kind draws from."""
    return _CATEGORY_BY_KIND[kind]
