"""
database.py
Handles the core SQLAlchemy database configuration, connection engine,
and session management. Includes environment-aware routing for Cloud Run.
"""

from datetime import datetime

import pytz
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

# ==========================================
# DATABASE CONNECTION SETUP
# ==========================================

# Environment-aware connection URL (Cloud SQL socket > TCP override > local).
# Routing logic lives in config.Settings.sqlalchemy_database_url.
SQLALCHEMY_DATABASE_URL = settings.sqlalchemy_database_url

# Cloud Run Safety Check: Force a descriptive crash log if misconfigured
if settings.is_cloud_run and "localhost" in SQLALCHEMY_DATABASE_URL:
    print("❌ [CRITICAL] Cloud Run detected but INSTANCE_CONNECTION_NAME is missing!")
    print("❌ Action Required: Go to GCP Console and set INSTANCE_CONNECTION_NAME.")


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
