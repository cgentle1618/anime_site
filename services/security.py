"""
security.py
Handles cryptographic operations including password hashing via native bcrypt
and generating/decoding JSON Web Tokens (JWT).
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, Optional
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


def get_password_hash(password: str) -> str:
    """
    Hashes a password using native bcrypt.
    Note: Bcrypt has a 72-byte limit. We securely truncate the input
    to ensure the hashing mechanism doesn't crash on oversized inputs.
    """
    # Encode password to bytes and truncate to 72 bytes (industry standard for bcrypt)
    pwd_bytes = password.encode("utf-8")[:72]
    # Generate salt and hash
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain text password against the stored bcrypt hash.
    Safely truncates the incoming password to match the 72-byte hashing limit.
    """
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(
    data: Dict[str, Any], expires_delta: Optional[timedelta] = None
) -> str:
    """
    Constructs and signs a JSON Web Token (JWT) with an expiration claim.
    This token is subsequently injected into a secure HTTP-Only cookie by the
    auth router to maintain stateless user sessions.
    """
    to_encode = data.copy()

    # Use timezone-aware UTC datetime to prevent deprecation warnings and syncing issues
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )

    to_encode.update({"exp": expire})

    # Generate the JWT string signed with the SECRET_KEY
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt
