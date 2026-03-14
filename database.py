"""
database.py
Handles the core SQLAlchemy database configuration, connection engine,
and session management. Also includes database-level utility functions.
Configured for both local development and GCP Cloud Run deployment.
"""

import os
import urllib.parse
from datetime import datetime, timedelta

import pytz
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Load environment variables from credentials.json or .env
load_dotenv()

# --- DEBUG BLOCK ---
print(
    f"🚀 [DEBUG] INSTANCE_CONNECTION_NAME from env: '{os.getenv('INSTANCE_CONNECTION_NAME')}'"
)
print(f"🚀 [DEBUG] DATABASE_URL from env: '{os.getenv('DATABASE_URL')}'")
# -------------------

# ==========================================
# DATABASE CONNECTION SETUP
# ==========================================

# Base credentials needed for both Local and Cloud
USER = os.getenv("POSTGRES_USER", "postgres")
RAW_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password").strip()
PASSWORD = urllib.parse.quote_plus(RAW_PASSWORD)
DB_NAME = os.getenv("POSTGRES_DB", "anime_site_db")

# GCP Cloud Run injects the Cloud SQL connection path here
INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME")

if INSTANCE_CONNECTION_NAME:
    # PRODUCTION (GCP Cloud Run via Unix Socket)
    # SQLAlchemy requires this specific format for psycopg2 unix sockets
    SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg2://{USER}:{PASSWORD}@/{DB_NAME}?host=/cloudsql/{INSTANCE_CONNECTION_NAME}"
    print(f"🔗 Connecting to Cloud SQL instance: {INSTANCE_CONNECTION_NAME}")
else:
    # LOCAL DEVELOPMENT (TCP/IP via Docker Desktop or Localhost)
    HOST = os.getenv("POSTGRES_HOST", "localhost")
    PORT = os.getenv("POSTGRES_PORT", "5432")
    SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DB_NAME}"
    print(f"🔗 Connecting to Local PostgreSQL at {HOST}:{PORT}")


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
