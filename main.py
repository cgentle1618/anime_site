from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
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

# Add CORS middleware to allow your frontend to talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins (perfect for local development)
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods (GET, POST, PATCH, etc.)
    allow_headers=["*"],
)


# Dependency: Safely opens and closes a database session for each request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/")
def serve_frontend():
    # This tells FastAPI to send your index.html file when someone visits the root URL
    return FileResponse("static/index.html")


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


# ==========================================
# PHASE 3, STEP 3: PROGRESS UPDATE (PATCH)
# ==========================================


@app.patch("/api/anime/{system_id}/progress")
def update_anime_progress(
    system_id: str, progress: schemas.ProgressUpdate, db: Session = Depends(get_db)
):
    """Updates watched episodes in PostgreSQL AND Google Sheets (2-Way Sync)."""

    # 1. Update the PostgreSQL Database (High-Speed Cache)
    anime = db.query(AnimeEntry).filter(AnimeEntry.system_id == system_id).first()
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found in database.")

    anime.ep_fin = progress.ep_fin
    db.commit()
    db.refresh(anime)

    # 2. Update the Google Sheet (Master Record)
    try:
        sheets_sync.update_episode_progress_in_sheet(system_id, progress.ep_fin)
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"DB updated, but Google Sheets failed: {str(e)}"
        )

    return {"message": "Progress updated successfully", "ep_fin": anime.ep_fin}
