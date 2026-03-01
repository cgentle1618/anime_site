from fastapi import FastAPI, Depends, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

import schemas
import database
from sheets_sync import sync_sheet_to_db, update_episode_progress_in_sheet

# 1. Initialize the FastAPI app
app = FastAPI(title="Anime Tracker API")

# 2. CORS Setup - allows your frontend (HTML) to talk to your backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Create tables on startup (if they don't already exist)
database.Base.metadata.create_all(bind=database.engine)


# 4. Dependency: Safely opens and closes a database session for each request
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ==========================================
# FRONTEND HTML ROUTES
# ==========================================


@app.get("/")
def serve_frontend():
    return FileResponse("static/index.html")


@app.get("/library")
def serve_library():
    return FileResponse("static/library.html")


# ==========================================
# BACKEND API ENDPOINTS
# ==========================================


@app.get("/api/anime", response_model=List[schemas.AnimeResponse])
def get_all_anime(db: Session = Depends(get_db)):
    """Fetches all anime entries from PostgreSQL."""
    return db.query(database.AnimeEntry).all()


@app.get("/api/series", response_model=List[schemas.AnimeSeriesResponse])
def get_all_series(db: Session = Depends(get_db)):
    """Fetches all anime series (franchises) from PostgreSQL."""
    return db.query(database.AnimeSeries).all()


@app.get("/api/series/{series_name}", response_model=List[schemas.AnimeResponse])
def get_series(series_name: str, db: Session = Depends(get_db)):
    """Fetches all anime matching a specific series."""
    return (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.series_en == series_name)
        .all()
    )


@app.post("/api/sync")
def trigger_sync(db: Session = Depends(get_db)):
    """Triggers the Google Sheets -> PostgreSQL sync script."""
    try:
        # We pass the FastAPI db session directly into the sync script
        result = sync_sheet_to_db(db_session=db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/anime/{system_id}/progress")
def update_progress(system_id: str, payload: dict, db: Session = Depends(get_db)):
    """Updates episodes watched in both PostgreSQL and Google Sheets."""
    new_ep_fin = payload.get("ep_fin")
    if new_ep_fin is None:
        raise HTTPException(status_code=400, detail="Missing 'ep_fin' in payload")

    # 1. Update PostgreSQL
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found in database")

    anime.ep_fin = new_ep_fin
    db.commit()

    # 2. Update Google Sheet (Source of Truth)
    try:
        update_episode_progress_in_sheet(system_id, new_ep_fin)
    except Exception as e:
        print(f"Failed to update Google Sheet: {e}")
        raise HTTPException(
            status_code=500, detail=f"Database updated, but Sheet failed: {e}"
        )

    return {"status": "success", "new_ep_fin": new_ep_fin}
