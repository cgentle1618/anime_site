"""
database.py
Handles the core SQLAlchemy database configuration, connection engine,
and session management. Optimized for V2 to be "Cloud-First".
"""

import os
import urllib.parse
from datetime import datetime
import pytz
from dotenv import load_dotenv
from sqlalchemy import create_engine
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
    # Connects securely within the GCP VPC
    SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg2://{USER}:{PASSWORD}@/{DB_NAME}?host=/cloudsql/{INSTANCE_CONNECTION_NAME}"
elif RAW_DB_URL and not USE_LOCAL_OVERRIDE:
    # EXTERNAL CLOUD / OVERRIDE: Uses standard TCP connection string
    SQLALCHEMY_DATABASE_URL = RAW_DB_URL
else:
    # LOCAL DEVELOPMENT: Falls back to local PostgreSQL instance
    SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@localhost:5432/{DB_NAME}"

# Cloud Run Safety Check: If K_SERVICE is present (running in the cloud)
# but we are still hitting localhost, we force a descriptive crash in the logs.
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
