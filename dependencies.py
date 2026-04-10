"""
dependencies.py
Contains reusable FastAPI dependencies used across different routers.
Centralizes database session management and security middleware.
"""

import os
from typing import Any, Dict, Generator

import jwt
from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from database import SessionLocal

# ==========================================
# SECURITY CONFIGURATION
# ==========================================
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "fallback_dev_secret_key_change_me_in_prod")
ALGORITHM = os.getenv("ALGORITHM", "HS256")


# ==========================================
# DATABASE DEPENDENCIES
# ==========================================
def get_db() -> Generator[Session, None, None]:
    """
    Dependency function that yields a database session for a single request.
    Ensures the session is cleanly closed after the HTTP request completes,
    preventing connection leaks and database timeouts.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# AUTHENTICATION & RBAC DEPENDENCIES
# ==========================================
def get_current_admin(request: Request) -> Dict[str, Any]:
    """
    Security middleware for Role-Based Access Control (RBAC).

    Mechanism:
    1. Extracts the JWT from the secure, HTTP-Only 'access_token' cookie.
    2. Cryptographically verifies the token using the SECRET_KEY.
    3. Enforces that the authenticated user explicitly possesses the 'admin' role.

    Raises a 401 Unauthorized exception if any validation step fails.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or insufficient permissions",
        headers={"WWW-Authenticate": "Bearer"},
    )

    token = request.cookies.get("access_token")
    if not token or not token.startswith("Bearer "):
        raise credentials_exception

    try:
        token_str = token.split(" ")[1]
        payload = jwt.decode(token_str, SECRET_KEY, algorithms=[ALGORITHM])

        role: str = payload.get("role")
        if role != "admin":
            raise credentials_exception

        return payload

    except jwt.PyJWTError:
        raise credentials_exception
