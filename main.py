from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

# Import our custom files
from database import engine, Base, SessionLocal, AnimeEntry
import schemas

# This tells SQLAlchemy to create the tables if they don't exist
Base.metadata.create_all(bind=engine)

# Initialize the FastAPI application
app = FastAPI(title="Anime Site API")


# Dependency: Safely opens and closes a database session for each request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# A simple root endpoint to check if the server is alive
@app.get("/")
def read_root():
    return {"message": "⛩️ Welcome to the Anime Site API! Server is running."}


# ==========================================
# PHASE 3, STEP 1: READ ENDPOINTS (GET)
# ==========================================


@app.get("/api/anime", response_model=List[schemas.AnimeResponse])
def get_all_anime(db: Session = Depends(get_db)):
    """Fetches every single anime from the database."""
    anime_list = db.query(AnimeEntry).all()
    return anime_list


@app.get("/api/series/{series_keyword}", response_model=List[schemas.AnimeResponse])
def search_anime_series(series_keyword: str, db: Session = Depends(get_db)):
    """
    Searches for anime where the keyword matches:
    - English Series Name (series_en)
    - Chinese Series Name (series_cn)
    - Alternative Names (alt_name)
    """
    # Create a wildcard search term (e.g., "%Titan%")
    search_term = f"%{series_keyword}%"

    # Use 'ilike' for case-insensitive searching across our new columns
    results = (
        db.query(AnimeEntry)
        .filter(
            (AnimeEntry.series_en.ilike(search_term))
            | (AnimeEntry.series_cn.ilike(search_term))
            | (AnimeEntry.alt_name.ilike(search_term))
        )
        .all()
    )

    # If the list is empty, return a 404 Not Found error
    if not results:
        raise HTTPException(
            status_code=404, detail="No anime found matching that keyword."
        )

    return results
