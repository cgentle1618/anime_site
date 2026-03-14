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
    SQLALCHEMY_DATABASE_URL = f"postgresql+pg8000://{USER}:{PASSWORD}@/{DB_NAME}?unix_sock=/cloudsql/{INSTANCE_CONNECTION_NAME}/.s.PGSQL.5432"
elif RAW_DB_URL and not USE_LOCAL_OVERRIDE:
    # LOCAL CLOUD PROXY: e.g. postgresql://user:pass@127.0.0.1:5432/db
    SQLALCHEMY_DATABASE_URL = RAW_DB_URL
else:
    # FALLBACK LOCAL: Standard local Docker/Postgres
    SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@localhost:5432/{DB_NAME}"

# If we are in the cloud but still hitting localhost, we force a descriptive crash in the logs
if os.getenv("K_SERVICE") and "localhost" in SQLALCHEMY_DATABASE_URL:
    print("❌ [CRITICAL] Cloud Run detected but INSTANCE_CONNECTION_NAME is missing!")
    print("❌ Action Required: Go to GCP Console and set INSTANCE_CONNECTION_NAME.")

# ==========================================
# ENGINE INITIALIZATION
# ==========================================

# DEBUGGING: Safely log the connection string without leaking the password
masked_url = SQLALCHEMY_DATABASE_URL.replace(PASSWORD, "******")
print(f"🔧 [DB DEBUG] Connecting to: {masked_url}")

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,
    pool_recycle=1800,
    echo=True,  # <-- DEBUGGING ACTIVE: Will print raw SQL to Cloud Logs
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
        deleted = (
            db.query(SyncLog)
            .filter(SyncLog.timestamp < cutoff_date)
            .delete(synchronize_session=False)
        )
        db.commit()
        return deleted
    except Exception as e:
        db.rollback()
        raise e


def get_db():
    """Yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
