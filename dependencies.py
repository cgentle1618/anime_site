"""
dependencies.py
Contains reusable FastAPI dependencies used across different routers.
"""

from typing import Generator
from sqlalchemy.orm import Session
from database import SessionLocal


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
