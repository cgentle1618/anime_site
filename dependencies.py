"""
dependencies.py
Contains reusable FastAPI dependencies used across different routers.
"""

from typing import Generator
import os
import jwt
from fastapi import Request, HTTPException, status
from sqlalchemy.orm import Session
from database import SessionLocal

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_dev_secret_key_change_me_in_prod")
ALGORITHM = os.getenv("ALGORITHM", "HS256")


def get_db() -> Generator[Session, None, None]:
    """
    Dependency function that yields a database session for a single request.
    Ensures the session is cleanly closed after the request completes,
    preventing database connection leaks and timeouts.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_admin(request: Request) -> dict:
    """
    Dependency that extracts the JWT from the HTTP-Only cookie,
    verifies it, and ensures the user has the 'admin' role.
    Raises a 401 Unauthorized error if validation fails.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = request.cookies.get("access_token")
    if not token or not token.startswith("Bearer "):
        raise credentials_exception

    try:
        # Remove 'Bearer ' prefix
        token_str = token.split(" ")[1]
        payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])
        role: str = payload.get("role")
        if role != "admin":
            raise credentials_exception
        return payload
    except jwt.PyJWTError:
        raise credentials_exception
