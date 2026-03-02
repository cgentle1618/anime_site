from fastapi import FastAPI, Depends, HTTPException, Body
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from typing import List

import schemas
import database
from sheets_sync import (
    sync_sheet_to_db,
    update_episode_progress_in_sheet,
    get_google_sheet,
    execute_with_retry,
)

# ==========================================
# 1. APP INITIALIZATION & SETUP
# ==========================================

app = FastAPI(title="Anime Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create tables on startup
database.Base.metadata.create_all(bind=database.engine)


# ==========================================
# 2. DEPENDENCIES & HELPERS
# ==========================================


def get_db():
    """Safely opens and closes a database session for each request."""
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def update_sheet_field(
    system_id: str, field_name: str, value, sheet_name: str = "Anime"
):
    """
    Generic, reusable helper to update a specific cell in any Google Sheets tab.
    Locates the row by system_id and the column by header name.
    """
    sheet = get_google_sheet(sheet_name)
    cell = execute_with_retry(sheet.find, system_id)

    if not cell:
        print(f"system_id {system_id} not found in sheet '{sheet_name}'.")
        return False

    headers = execute_with_retry(sheet.row_values, 1)
    try:
        # Reverse lookup ensures we update the real column, bypassing hidden/duplicate columns
        col_index = len(headers) - headers[::-1].index(field_name)
        execute_with_retry(sheet.update_cell, cell.row, col_index, value)
        return True
    except ValueError:
        print(f"Column '{field_name}' not found in sheet '{sheet_name}'.")
        return False


# ==========================================
# 3. FRONTEND HTML ROUTES
# ==========================================


@app.get("/")
def serve_frontend():
    return FileResponse("static/index.html")


@app.get("/library")
def serve_library():
    return FileResponse("static/library.html")


@app.get("/anime/{system_id}")
def serve_details(system_id: str):
    return FileResponse("static/details.html")


@app.get("/series/{system_id}")
def serve_series(system_id: str):
    return FileResponse("static/series.html")


# ==========================================
# 4. BACKEND API ENDPOINTS - ANIME ENTRIES
# ==========================================


@app.get("/api/anime", response_model=List[schemas.AnimeResponse])
def get_all_anime(db: Session = Depends(get_db)):
    """Fetches all anime entries from PostgreSQL."""
    return db.query(database.AnimeEntry).all()


@app.get("/api/anime/details/{system_id}")
def get_anime_details(system_id: str, db: Session = Depends(get_db)):
    """Fetches full details for a single anime and injects its parent series metadata."""
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")

    # Fetch associated series to enrich the response
    series_meta = (
        db.query(database.AnimeSeries)
        .filter(database.AnimeSeries.series_en == anime.series_en)
        .first()
    )

    # Convert ORM to dict to inject extra fields
    anime_dict = schemas.AnimeResponse.from_orm(anime).dict()
    anime_dict["alt_name"] = series_meta.alt_name if series_meta else None
    anime_dict["series_cn"] = series_meta.series_cn if series_meta else None
    anime_dict["series_id"] = series_meta.system_id if series_meta else None

    return anime_dict


@app.patch("/api/anime/{system_id}/progress")
def update_anime_state(
    system_id: str, payload: dict = Body(...), db: Session = Depends(get_db)
):
    """Dynamically updates episodes, watch status, rating, or remarks in DB and Sheets."""
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found in database")

    try:
        if "ep_fin" in payload:
            anime.ep_fin = payload["ep_fin"]
            update_episode_progress_in_sheet(system_id, payload["ep_fin"])

        if "my_progress" in payload:
            anime.my_progress = payload["my_progress"]
            update_sheet_field(system_id, "my_progress", payload["my_progress"])

        if "rating_mine" in payload:
            new_rating = (
                None if payload["rating_mine"] == "null" else payload["rating_mine"]
            )
            anime.rating_mine = new_rating
            update_sheet_field(
                system_id, "rating_mine", new_rating if new_rating else ""
            )

        if "remark" in payload:
            anime.remark = payload["remark"]
            update_sheet_field(
                system_id, "remark", payload["remark"] if payload["remark"] else ""
            )

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        print(f"Sync failed during PATCH: {e}")
        raise HTTPException(
            status_code=500, detail="Database updated, but Google Sheets sync failed."
        )


# ==========================================
# 5. BACKEND API ENDPOINTS - SERIES (FRANCHISE)
# ==========================================


@app.get("/api/series", response_model=List[schemas.AnimeSeriesResponse])
def get_all_series(db: Session = Depends(get_db)):
    """Fetches all anime series (franchises)."""
    return db.query(database.AnimeSeries).all()


@app.get("/api/series/{series_name}", response_model=List[schemas.AnimeResponse])
def get_anime_by_series(series_name: str, db: Session = Depends(get_db)):
    """Fetches all individual anime seasons/movies belonging to a specific franchise."""
    return (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.series_en == series_name)
        .all()
    )


@app.get("/api/series/details/{system_id}", response_model=schemas.AnimeSeriesResponse)
def get_series_details(system_id: str, db: Session = Depends(get_db)):
    """Fetches metadata for a single franchise/series."""
    series = (
        db.query(database.AnimeSeries)
        .filter(database.AnimeSeries.system_id == system_id)
        .first()
    )
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    return series


@app.patch("/api/series/{system_id}")
def update_series_state(
    system_id: str, payload: dict = Body(...), db: Session = Depends(get_db)
):
    """Updates series metadata (like the overall franchise rating) in DB and Sheets."""
    series = (
        db.query(database.AnimeSeries)
        .filter(database.AnimeSeries.system_id == system_id)
        .first()
    )
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    try:
        if "rating_series" in payload:
            new_rating = (
                None if payload["rating_series"] == "null" else payload["rating_series"]
            )
            series.rating_series = new_rating
            # Notice we pass sheet_name="Anime Series" to target the correct tab
            update_sheet_field(
                system_id,
                "rating_series",
                new_rating if new_rating else "",
                sheet_name="Anime Series",
            )

        db.commit()
        return {"status": "success"}
    except Exception as e:
        db.rollback()
        print(f"Sync failed during PATCH: {e}")
        raise HTTPException(
            status_code=500, detail="Database updated, but Google Sheets sync failed."
        )


# ==========================================
# 6. BACKEND API ENDPOINTS - ETL
# ==========================================


@app.post("/api/sync")
def trigger_sync(db: Session = Depends(get_db)):
    """Triggers the Google Sheets -> PostgreSQL sync script."""
    try:
        return sync_sheet_to_db(db_session=db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
