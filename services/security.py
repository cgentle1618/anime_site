"""
security.py
Provides cryptographic utilities for the application.
Handles password hashing via bcrypt and session management via JWT.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

# ==========================================
# JWT CONFIGURATION
# ==========================================
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_dev_secret_key_change_me_in_prod")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))


# ==========================================
# PASSWORD HASHING (BCRYPT)
# ==========================================


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
    data: Dict[str, Any], expires_delta: Optional[timedelta] = None
) -> str:
    """
    Generates a signed JWT access token containing the provided data payload.

    Includes an 'exp' (expiration) claim. If no specific expires_delta is provided,
    the token defaults to the global ACCESS_TOKEN_EXPIRE_MINUTES configuration.
    """
    to_encode = data.copy()

    # Use timezone-aware UTC to ensure consistency across cloud regions
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})

    # Sign the token using the secret key and defined algorithm
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
