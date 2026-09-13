"""
security.py
Provides cryptographic utilities for the application.
Handles password hashing via bcrypt and session management via JWT.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt

from app.config import settings

# ==========================================
# JWT CONFIGURATION
# ==========================================
SECRET_KEY = settings.jwt_secret_key
ALGORITHM = settings.algorithm
ACCESS_TOKEN_EXPIRE_MINUTES = settings.access_token_expire_minutes


# ==========================================
# PASSWORD HASHING (BCRYPT)
# ==========================================


# The hash stored for an account that has no password on this machine.
#
# users.hashed_password does NOT travel in the Google Sheet: it is credential
# material for other people's accounts, and a Backup writes the sheet outside
# this database's trust boundary. Pull therefore restores the account and
# stamps this marker, and an admin sets a real password through
# PUT /api/users/{id} on the arriving machine.
#
# "!" is not a bcrypt hash and cannot be produced by get_password_hash (every
# bcrypt hash starts "$2"), so no input can ever verify against it: checkpw
# raises on the malformed salt and verify_password returns False. Django uses
# the same leading "!" convention for the same reason.
UNUSABLE_PASSWORD_HASH = "!"


def is_unusable_password_hash(value: str | None) -> bool:
    """True when this account cannot be logged into until a password is set."""
    return not value or value.startswith("!")


def get_password_hash(password: str) -> str:
    """
    Hashes a plain-text password using the bcrypt algorithm.

    Note: Bcrypt has a hard limit of 72 bytes for the input string.
    We truncate the input to 72 bytes to ensure consistency and prevent
    errors with exceptionally long passwords.
    """
    pwd_bytes = password.encode("utf-8")[:72]
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Checks a plain-text password against a known bcrypt hash.
    Returns True if the credentials match, False otherwise.
    """
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False


# ==========================================
# SESSION TOKEN MANAGEMENT (JWT)
# ==========================================


def create_access_token(
    data: Dict[str, Any],
    expires_delta: Optional[timedelta] = None,
    expires_at: Optional[datetime] = None,
) -> str:
    """
    Generates a signed JWT access token containing the provided data payload.

    Includes an 'exp' (expiration) claim. If no specific expires_delta is provided,
    the token defaults to the global ACCESS_TOKEN_EXPIRE_MINUTES configuration.

    `expires_at` is used VERBATIM and takes precedence over both. It exists for
    one caller and one reason: a request that REISSUES a live session's token -
    the access-mode switch - must preserve the original deadline. Without it,
    toggling between two modes would mint a fresh 24-hour token each time and
    become an unlimited session-extension oracle, which matters here because
    the lifetime is flat with no refresh flow and no revocation. Anything else
    that reissues a token in future must pass this too.
    """
    to_encode = data.copy()

    # Use timezone-aware UTC to ensure consistency across cloud regions
    if expires_at is not None:
        expire = expires_at
    elif expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})

    # Sign the token using the secret key and defined algorithm
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
