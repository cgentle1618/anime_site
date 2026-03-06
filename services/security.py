"""
security.py
Handles cryptographic operations including password hashing via native bcrypt
and generating/decoding JSON Web Tokens (JWT).
"""

import os
from datetime import datetime, timedelta
import bcrypt
import jwt
from dotenv import load_dotenv

load_dotenv()

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_dev_secret_key_change_me_in_prod")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))


def get_password_hash(password: str) -> str:
    """
    Hashes a password using native bcrypt.
    Note: Bcrypt has a 72-character limit. We truncate to ensure it doesn't crash.
    """
    # Encode password to bytes and truncate to 72 bytes (industry standard for bcrypt)
    pwd_bytes = password.encode("utf-8")[:72]
    # Generate salt and hash
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(pwd_bytes, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain text password against the hashed version."""
    try:
        pwd_bytes = plain_password.encode("utf-8")[:72]
        hashed_bytes = hashed_password.encode("utf-8")
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Generates a signed JWT access token."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
