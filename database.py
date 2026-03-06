"""
database.py
Handles the core SQLAlchemy database configuration, connection engine,
and session management. Also includes database-level utility functions.
Configured for both local development and GCP Cloud Run deployment.
"""

import os
from datetime import datetime, timedelta

import pytz
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load environment variables from credentials.json or .env
load_dotenv()

# ==========================================
# DATABASE CONNECTION SETUP
# ==========================================

# Added default fallbacks for robustness during Docker/Cloud transition
USER = os.getenv("POSTGRES_USER", "postgres")
PASSWORD = os.getenv("POSTGRES_PASSWORD", "password")
HOST = os.getenv("POSTGRES_HOST", "localhost")
PORT = os.getenv("POSTGRES_PORT", "5432")
DB_NAME = os.getenv("POSTGRES_DB", "anime_site_db")

# Construct the PostgreSQL connection string explicitly
SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DB_NAME}"

# Initialize the SQLAlchemy Database Engine with production-ready connection pooling
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # Crucial for Cloud SQL: Automatically tests connections before using them
    pool_recycle=1800,  # Recycle connections every 30 mins to prevent stale connection drops
)

# Create a localized session factory for dependency injection in FastAPI
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for all ORM models to inherit from
Base = declarative_base()

# ==========================================
# DATABASE UTILITIES
# ==========================================


def get_taipei_now() -> datetime:
    """
    Returns the current time in the Asia/Taipei timezone,
    stripped of tzinfo for standard database storage.
    """
    tz = pytz.timezone("Asia/Taipei")
    return datetime.now(tz).replace(tzinfo=None)


def cleanup_old_logs(db, days_to_keep: int = 30) -> int:
    """
    Deletes sync log records that are older than the specified number of days.
    Prevents the database from bloating over time.
    """
    from models import (
        SyncLog,
    )  # Local import prevents circular dependency with models.py

    cutoff_date = get_taipei_now() - timedelta(days=days_to_keep)

    deleted_count = db.query(SyncLog).filter(SyncLog.timestamp < cutoff_date).delete()
    db.commit()

    return deleted_count
