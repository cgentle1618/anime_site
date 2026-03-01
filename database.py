import os
import uuid
from dotenv import load_dotenv
from sqlalchemy import create_engine, Column, String, Integer, Float, Date
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

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
    __tablename__ = "anime_entries"

    system_id = Column(String, primary_key=True, index=True)

    series_en = Column(String, nullable=True)
    series_season_en = Column(String, nullable=True)
    series_season_roman = Column(String, nullable=True)
    series_season_cn = Column(String, nullable=True)
    series_season = Column(String, nullable=True)

    airing_type = Column(String, nullable=True)
    my_progress = Column(String, nullable=True)
    airing_status = Column(String, nullable=True)
    ep_total = Column(Integer, nullable=True)
    ep_fin = Column(Integer, default=0, nullable=True)
    rating_mine = Column(String, nullable=True)

    main_spinoff = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
    studio = Column(String, nullable=True)
    director = Column(String, nullable=True)
    producer = Column(String, nullable=True)
    distributor_tw = Column(String, nullable=True)

    genre_main = Column(String, nullable=True)
    genre_sub = Column(String, nullable=True)
    remark = Column(String, nullable=True)

    mal_id = Column(Integer, nullable=True)
    mal_link = Column(String, nullable=True)
    anilist_link = Column(String, nullable=True)

    op = Column(String, nullable=True)
    ed = Column(String, nullable=True)
    insert_ost = Column(String, nullable=True)
    seiyuu = Column(String, nullable=True)

    source_baha = Column(String, nullable=True)
    source_netflix = Column(String, nullable=True)

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
