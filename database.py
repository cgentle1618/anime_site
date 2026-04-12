"""
database.py
Handles the core SQLAlchemy database configuration, connection engine,
and session management. Includes environment-aware routing for Cloud Run.
"""

import os
import urllib.parse
from datetime import datetime

import pytz
from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

# ==========================================
# DATABASE CONNECTION SETUP
# ==========================================

# Base credentials
USER = os.getenv("POSTGRES_USER", "postgres")
RAW_PASSWORD = os.getenv("POSTGRES_PASSWORD", "password").strip()
PASSWORD = urllib.parse.quote_plus(RAW_PASSWORD)
DB_NAME = os.getenv("POSTGRES_DB", "anime_site_db")

INSTANCE_CONNECTION_NAME = os.getenv("INSTANCE_CONNECTION_NAME")
RAW_DB_URL = os.getenv("DATABASE_URL")

# Prevent leaked local .env files from crashing the Cloud Run container
USE_LOCAL_OVERRIDE = RAW_DB_URL and "localhost" in RAW_DB_URL

# --- Smart Connection Routing Logic ---
if INSTANCE_CONNECTION_NAME:
    SQLALCHEMY_DATABASE_URL = f"postgresql+psycopg2://{USER}:{PASSWORD}@/{DB_NAME}?host=/cloudsql/{INSTANCE_CONNECTION_NAME}"
elif RAW_DB_URL and not USE_LOCAL_OVERRIDE:
    # EXTERNAL CLOUD: Uses standard TCP connection string
    SQLALCHEMY_DATABASE_URL = RAW_DB_URL
else:
    # LOCAL DEVELOPMENT
    SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@localhost:5432/{DB_NAME}"

# Cloud Run Safety Check: Force a descriptive crash log if misconfigured
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
    """
    Returns the current timezone-naive datetime in Taipei time.
    Used as the default timestamp generator for database models.
    """
    tz = pytz.timezone("Asia/Taipei")
    return datetime.now(tz).replace(tzinfo=None)
