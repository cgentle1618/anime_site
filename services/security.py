"""
security.py
Handles cryptographic operations including password hashing via bcrypt
and generating/decoding JSON Web Tokens (JWT) for authentication.
"""

import os
from datetime import datetime, timedelta
from passlib.context import CryptContext
import jwt
from dotenv import load_dotenv

load_dotenv()

# JWT Configuration
# In production, ALWAYS set JWT_SECRET_KEY in your .env file
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_dev_secret_key_change_me_in_prod")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440")
)  # 24 hours

# Initialize bcrypt context
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain text password against the hashed version in the DB."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hashes a password for secure database storage."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: timedelta = None) -> str:
    """Generates a signed JWT access token containing the provided payload (data)."""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

    return encoded_jwt
