"""
database.py
Handles the core SQLAlchemy database configuration, connection engine,
and session management. Optimized for V2 to be "Cloud-First".
"""

import os
import urllib.parse
from datetime import datetime, timedelta
import pytz
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base

# 1. Load local .env (Only used if real system variables aren't set)
load_dotenv()

# ==========================================
# DATABASE CONNECTION SETUP
# ==========================================

# Base credentials
USER = os.getenv("POSTGRES_USER", "postgres")
RAW_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password").strip()
PASSWORD = urllib.parse.quote_plus(RAW_PASSWORD)
DB_NAME = os.getenv("POSTGRES_DB", "anime_site_db")

# Connection identifiers
INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME")

# We check if DATABASE_URL exists, but we ignore it if it contains "localhost"
# to prevent leaked local .env files from crashing the Cloud Run container.
RAW_DB_URL = os.getenv("DATABASE_URL")
USE_LOCAL_OVERRIDE = RAW_DB_URL and "localhost" in RAW_DB_URL

# --- THE SMART SWITCH LOGIC ---
if INSTANCE_CONNECTION_NAME:
    # PRODUCTION: GCP Cloud Run via Unix Socket
    SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg2://{USER}:{PASSWORD}@/{DB_NAME}?host=/cloudsql/{INSTANCE_CONNECTION_NAME}"
    print(
        f"🔗 [System] Cloud Mode: Connecting via Unix Socket to {INSTANCE_CONNECTION_NAME}"
    )
elif RAW_DB_URL and not USE_LOCAL_OVERRIDE:
    # CLOUD OVERRIDE: Using a full external URL (if provided in GCP console)
    SQLALCHEMY_DATABASE_URL = RAW_DB_URL
    print("🔗 [System] Cloud Override: Using provided DATABASE_URL")
else:
    # LOCAL DEVELOPMENT: Fallback to local network
    HOST = os.getenv("POSTGRES_HOST", "127.0.0.1")
    PORT = os.getenv("POSTGRES_PORT", "5432")
    SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DB_NAME}"
    print(f"🏠 [System] Local Mode: Connecting to {HOST}:{PORT}")

# --- FINAL SAFETY CHECK ---
# If we are in the cloud but still hitting localhost, we force a descriptive crash in the logs
if os.getenv("K_SERVICE") and "localhost" in SQLALCHEMY_DATABASE_URL:
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
    """Returns standard timezone-naive datetime for DB storage."""
    tz = pytz.timezone("Asia/Taipei")
    return datetime.now(tz).replace(tzinfo=None)


def cleanup_old_logs(db, days_to_keep: int = 30) -> int:
    """Maintenance utility to prevent log bloat. Fixed import error."""
    from models import SyncLog

    cutoff_date = get_taipei_now() - timedelta(days=days_to_keep)
    try:
        deleted = db.query(SyncLog).filter(SyncLog.timestamp < cutoff_date).delete()
        db.commit()
        return deleted
    except Exception as e:
        db.rollback()
        print(f"Error cleaning logs: {e}")
        return 0
