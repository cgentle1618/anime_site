import os
import uuid
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, String, Integer, Float, Date
from sqlalchemy.orm import declarative_base, sessionmaker

# 1. Load the environment variables from your .env file
load_dotenv()

# 2. Build the database connection URL dynamically
USER = os.getenv("POSTGRES_USER")
PASSWORD = os.getenv("POSTGRES_PASSWORD")
HOST = os.getenv("POSTGRES_HOST")
PORT = os.getenv("POSTGRES_PORT")
DB_NAME = os.getenv("POSTGRES_DB")

# Standard PostgreSQL connection string format
SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DB_NAME}"

# 3. Create the SQLAlchemy "Engine" (the thing that actually talks to the database)
engine = create_engine(SQLALCHEMY_DATABASE_URL)

# 4. Create a SessionLocal class (each instance of this will be an actual database session)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 5. Create a Base class that our models will inherit from
Base = declarative_base()


# 6. Define your Anime Table Schema
class AnimeEntry(Base):
    __tablename__ = "anime_library"

    # Core Identifiers
    system_id = Column(
        String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True
    )
    mal_id = Column(Integer, nullable=True, index=True)

    # Naming
    name_english = Column(String, nullable=True, index=True)
    name_romaji = Column(String, nullable=True)
    name_chinese = Column(String, nullable=True)

    # Series Info
    season = Column(String, nullable=True)  # e.g., Season 2
    seasonal_year = Column(String, nullable=True)  # e.g., WIN 2026
    studio = Column(String, nullable=True)
    release_date = Column(String, nullable=True)

    # User Progress & Rating
    ranking = Column(String, nullable=True)  # S, A, B, etc.
    watch_progress = Column(String, nullable=True)  # Active Watching, Paused, etc.
    ep_finished = Column(Integer, default=0)
    ep_total = Column(Integer, nullable=True)

    # External API Data
    mal_rating = Column(Float, nullable=True)
    cover_image_url = Column(String, nullable=True)
