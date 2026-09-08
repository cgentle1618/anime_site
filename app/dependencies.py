"""
dependencies.py
Contains reusable FastAPI dependencies used across different routers.
Centralizes database session management and security middleware.
"""

from typing import Any, Dict, Generator

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import SessionLocal

# ==========================================
# SECURITY CONFIGURATION
# ==========================================
SECRET_KEY = settings.jwt_secret_key
ALGORITHM = settings.algorithm


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
def get_current_admin(
    request: Request, db: Session = Depends(get_db)
) -> Dict[str, Any]:
    """
    Security middleware for Role-Based Access Control (RBAC).

    Now a thin wrapper over the permission core: the viewer is resolved once,
    and the gate is simply "holds the admin permission". That keeps one source
    of truth while leaving every existing Depends(get_current_admin) call site
    untouched - FastAPI resolves the added db parameter.

    Stricter than the token check it replaces: a validly-signed token is no
    longer enough on its own, because the user row is consulted. A token for a
    deleted user, or for a user whose role has since lost admin, is rejected.

    Raises 401 - never 403 - to keep the one error shape the SPA knows.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials or insufficient permissions",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Imported here rather than at module scope: app.services.rbac.resolver
    # imports this module for SECRET_KEY and get_db.
    from app.services.rbac.permissions import PERM_ADMIN
    from app.services.rbac.resolver import resolve_viewer

    viewer = resolve_viewer(request, db)
    if not viewer.has(PERM_ADMIN):
        raise credentials_exception

    # No call site reads this, but it stays shaped like the JWT payload it was.
    return viewer.token_payload or {
        "sub": viewer.username,
        "role": viewer.role_name,
    }
