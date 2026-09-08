"""The shared release-date field validator, mounted by every media schema."""

from typing import Any, Optional

from pydantic import field_validator

from app.utils.release_date import is_valid, normalize


def _coerce(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str) and not value.strip():
        return None

    canonical = normalize(value)
    if canonical is None or not is_valid(canonical):
        raise ValueError(
            f"{value!r} is not a release date. Use YYYY, YYYY-MM, or YYYY-MM-DD."
        )
    return canonical


def release_date_validator(*field_names: str):
    """
    A Pydantic validator for the named release-date fields. Accepts anything
    normalize() understands and stores the canonical form, so a client posting
    the legacy "JUL 2001" is corrected rather than rejected.
    """
    return field_validator(*field_names, mode="before")(
        classmethod(lambda cls, v: _coerce(v))
    )
