from fastapi import FastAPI, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

# Import our custom files
from database import engine, Base, SessionLocal, AnimeEntry
import schemas

import sheets_sync

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
    """Searches for anime where the keyword matches titles or alt names."""
    search_term = f"%{series_keyword}%"

    results = (
        db.query(AnimeEntry)
        .filter(
            (AnimeEntry.series_en.ilike(search_term))
            | (AnimeEntry.series_cn.ilike(search_term))
            | (AnimeEntry.alt_name.ilike(search_term))
        )
        .all()
    )

    if not results:
        raise HTTPException(
            status_code=404, detail="No anime found matching that keyword."
        )
    return results


# ==========================================
# PHASE 3, STEP 2: ADMIN SYNC ENDPOINT (POST)
# ==========================================


@app.post("/api/sync")
def sync_with_google_sheets(db: Session = Depends(get_db)):
    """Triggers the Google Sheets ETL pipeline to update the PostgreSQL database."""
    try:
        rows_updated = sheets_sync.sync_sheet_to_db()

        # Placeholder so the server doesn't crash before you hook it up:
        rows_updated = "Successfully triggered the sync script!"

        return {"message": "Sync complete", "status": rows_updated}

    except Exception as e:
        # If your sync script crashes, this sends the exact error safely back to the frontend
        raise HTTPException(status_code=500, detail=f"Sync failed: {str(e)}")
