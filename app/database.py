"""
database.py
Handles the core SQLAlchemy database configuration, connection engine,
and session management.
"""

from datetime import datetime

import pytz
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

# ==========================================
# DATABASE CONNECTION SETUP
# ==========================================

# The connection URL is assembled in config.Settings.sqlalchemy_database_url.
SQLALCHEMY_DATABASE_URL = settings.sqlalchemy_database_url


# ==========================================
# ENGINE INITIALIZATION
# ==========================================

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# ==========================================
# DATABASE UTILITIES
# ==========================================


def get_taipei_now() -> datetime:
    """
    Returns the current timezone-naive datetime in Taipei time.
    Used as the default timestamp generator for database models.
    """
    tz = pytz.timezone("Asia/Taipei")
    return datetime.now(tz).replace(tzinfo=None)
