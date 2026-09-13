"""
One place that answers "what is this entry called?".

media.display_name is denormalized: it is derived from the detail table's
*_name_* columns and stored on media so that a search across all nine types is
one indexed query instead of a nine-way UNION. Denormalized state needs one
producer, and this is it - the backfills and the write hook both call this, so
they cannot disagree.

This is not a new pattern: person, studio, publisher and character already each
carry a stored display_name_field derived the same way.
"""


def compute_display_name(entry) -> str:
    """
    CN-first fallback across `entry._name_fields`, in declaration order.

    Raises ValueError when every name column is empty - media.display_name is
    NOT NULL, and an entry with no name at all is a data error worth failing on
    rather than storing an empty string that no search will ever match.
    """
    fields = getattr(entry, "_name_fields", None)
    if not fields:
        raise ValueError(f"{type(entry).__name__} declares no _name_fields")

    cn = [f for f in fields if f.endswith("_cn")]
    ordered = cn + [f for f in fields if f not in cn]

    for field in ordered:
        value = getattr(entry, field, None)
        if value and str(value).strip():
            return str(value).strip()

    raise ValueError(f"{type(entry).__name__} has no name in any of {fields}")
