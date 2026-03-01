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

SQLALCHEMY_DATABASE_URL = f"postgresql://{USER}:{PASSWORD}@{HOST}:{PORT}/{DB_NAME}"

engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


# 6. Define your Anime Table Schema matching the Google Sheet EXACTLY
class AnimeEntry(Base):
    __tablename__ = "anime_library"

    # Core Identifiers
    system_id = Column(
        String, primary_key=True, default=lambda: str(uuid.uuid4()), index=True
    )

    # Naming & Titles
    series_en = Column(String, nullable=True, index=True)
    series_roman = Column(String, nullable=True)
    series_cn = Column(String, nullable=True)
    series_season_en = Column(String, nullable=True)
    series_season_roman = Column(String, nullable=True)
    series_season_cn = Column(String, nullable=True)
    alt_name = Column(String, nullable=True)

    # Status & Progress
    airing_type = Column(String, nullable=True)  # TV, Movie, OVA, etc.
    my_progress = Column(String, nullable=True)  # Active Watching, Temp Dropped, etc.
    airing_status = Column(String, nullable=True)  # Finished Airing, Airing, etc.
    ep_total = Column(Integer, nullable=True)
    ep_fin = Column(Integer, default=0, nullable=True)
    rating_mine = Column(String, nullable=True)  # S, A, B, etc.

    # Production Info
    main_spinoff = Column(String, nullable=True)  # 本傳, 外傳, etc.
    release_date = Column(String, nullable=True)  # e.g., WIN 2024
    studio = Column(String, nullable=True)
    director = Column(String, nullable=True)
    producer = Column(String, nullable=True)
    distributor_tw = Column(String, nullable=True)

    # Genres & Notes
    genre_main = Column(String, nullable=True)
    genre_sub = Column(String, nullable=True)
    remark = Column(String, nullable=True)

    # External Links & IDs
    mal_id = Column(Integer, nullable=True, index=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)

    # Music & Cast
    op = Column(String, nullable=True)
    ed = Column(String, nullable=True)
    insert_ost = Column(String, nullable=True)
    seiyuu = Column(String, nullable=True)

    # Streaming Sources (Using String to capture "TRUE" or blanks easily from CSV/Sheets)
    source_baha = Column(String, nullable=True)
    source_netflix = Column(String, nullable=True)

    # --- Phase 5: External API Data (Auto-fetched later) ---
    mal_rating = Column(Float, nullable=True)
    cover_image_url = Column(String, nullable=True)


# --- NEW TABLE: Anime Series (Franchise Hubs) ---
class AnimeSeries(Base):
    __tablename__ = "anime_series"

    system_id = Column(String, primary_key=True, index=True)
    series_en = Column(String, nullable=True)
    series_roman = Column(String, nullable=True)
    series_cn = Column(String, nullable=True)
    rating_series = Column(String, nullable=True)
    alt_name = Column(String, nullable=True)
