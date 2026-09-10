"""
A user restored from the Google Sheet has no password.

hashed_password deliberately does not travel in the sheet (see the Users tab
in app/services/pipelines/tabs.py), so Pull mints an account nobody can log
into until an admin sets a real password. The marker must be a value NO input
can ever verify against - a known placeholder string would be a password
printed in the source tree.

Pure Python, no database.
"""

from app.services.security import (
    UNUSABLE_PASSWORD_HASH,
    get_password_hash,
    is_unusable_password_hash,
    verify_password,
)


def test_the_marker_is_recognised():
    assert is_unusable_password_hash(UNUSABLE_PASSWORD_HASH) is True


def test_a_real_hash_is_not_the_marker():
    assert is_unusable_password_hash(get_password_hash("hunter2")) is False


def test_nothing_verifies_against_the_marker():
    for attempt in ["", " ", "!", UNUSABLE_PASSWORD_HASH, "admin", "hunter2"]:
        assert verify_password(attempt, UNUSABLE_PASSWORD_HASH) is False


def test_the_marker_is_not_a_valid_bcrypt_hash():
    """Belt and braces: even if verify_password stopped catching, bcrypt
    cannot parse this as a salt, so it can never report a match."""
    assert not UNUSABLE_PASSWORD_HASH.startswith("$2")
