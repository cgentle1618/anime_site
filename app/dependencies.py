"""
dependencies.py
Contains reusable FastAPI dependencies used across different routers.
Centralizes database session management and security middleware.
"""

from typing import Generator
from uuid import UUID

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
def get_current_user_id(request: Request, db: Session = Depends(get_db)) -> UUID:
    """
    The authenticated caller's user id, or 401.

    The guard on every per-user route, read as well as write: plan_next and
    seasonal hold one account's private queues and ratings, so an anonymous
    caller gets a refusal rather than an empty page. Distinct from the
    capability dependencies (require_admin_authz and friends in
    app.services.rbac.resolver), which ask for a permission - this asks only
    for an account, because a seasonal rating is the caller's OWN. 401 rather
    than 403, matching the one error shape the SPA knows.
    """
    # Imported here rather than at module scope: app.services.rbac.resolver
    # imports this module for SECRET_KEY and get_db.
    from app.services.rbac.resolver import resolve_viewer

    viewer = resolve_viewer(request, db)
    if viewer.user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials or insufficient permissions",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return viewer.user_id
