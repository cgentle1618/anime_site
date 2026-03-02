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

app = FastAPI(title="Anime Tracker API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

database.Base.metadata.create_all(bind=database.engine)


# ==========================================
# DEPENDENCIES & ROBUST FINDERS
# ==========================================


def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def update_sheet_field(
    system_id: str, field_name: str, value, sheet_name: str = "Anime"
):
    sheet = get_google_sheet(sheet_name)
    cell = execute_with_retry(sheet.find, system_id)
    if not cell:
        return False
    headers = execute_with_retry(sheet.row_values, 1)
    try:
        col_index = len(headers) - headers[::-1].index(field_name)
        execute_with_retry(sheet.update_cell, cell.row, col_index, value)
        return True
    except ValueError:
        return False


# Bulletproof DB Lookup Helpers
def get_anime_by_id(db: Session, system_id: str):
    clean_id = str(system_id).strip().lower()
    for entry in db.query(database.AnimeEntry).all():
        if str(entry.system_id).strip().lower() == clean_id:
            return entry
    return None


def get_series_by_id(db: Session, system_id: str):
    clean_id = str(system_id).strip().lower()
    for series in db.query(database.AnimeSeries).all():
        if str(series.system_id).strip().lower() == clean_id:
            return series
    return None


# ==========================================
# FRONTEND HTML ROUTES
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


@app.get("/search")
def serve_search():
    return FileResponse("static/search.html")


# ==========================================
# BACKEND API ENDPOINTS - ANIME ENTRIES
# ==========================================


@app.get("/api/anime", response_model=List[schemas.AnimeResponse])
def get_all_anime(db: Session = Depends(get_db)):
    return db.query(database.AnimeEntry).all()


@app.get("/api/anime/details/{system_id}")
def get_anime_details(system_id: str, db: Session = Depends(get_db)):
    """Fetches full details for a single anime and injects its parent series metadata."""
    anime = get_anime_by_id(db, system_id)
    if not anime:
        raise HTTPException(
            status_code=404, detail=f"Anime with ID {system_id} not found"
        )

    # Robust matching for associated series
    series_meta = None
    if anime.series_en:
        clean_series_en = str(anime.series_en).strip().lower()
        for s in db.query(database.AnimeSeries).all():
            if str(s.series_en).strip().lower() == clean_series_en:
                series_meta = s
                break

    anime_dict = schemas.AnimeResponse.from_orm(anime).dict()
    anime_dict["alt_name"] = series_meta.alt_name if series_meta else None
    anime_dict["series_cn"] = series_meta.series_cn if series_meta else None
    anime_dict["series_id"] = series_meta.system_id if series_meta else None
    return anime_dict


@app.patch("/api/anime/{system_id}/progress")
def update_anime_state(
    system_id: str, payload: dict = Body(...), db: Session = Depends(get_db)
):
    anime = get_anime_by_id(db, system_id)
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")

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
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# BACKEND API ENDPOINTS - SERIES (FRANCHISE)
# ==========================================


@app.get("/api/series", response_model=List[schemas.AnimeSeriesResponse])
def get_all_series(db: Session = Depends(get_db)):
    return db.query(database.AnimeSeries).all()


@app.get("/api/series/details/{system_id}", response_model=schemas.AnimeSeriesResponse)
def get_series_details_by_id(system_id: str, db: Session = Depends(get_db)):
    series = get_series_by_id(db, system_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    return series


@app.get(
    "/api/anime/by-series/{series_name:path}",
    response_model=List[schemas.AnimeResponse],
)
def get_anime_by_series_name(series_name: str, db: Session = Depends(get_db)):
    """Robust lookup for all anime inside a specific franchise (handles special chars/slashes)."""
    clean_name = str(series_name).strip().lower()
    result = []
    for anime in db.query(database.AnimeEntry).all():
        if anime.series_en and str(anime.series_en).strip().lower() == clean_name:
            result.append(anime)
    return result


@app.patch("/api/series/{system_id}")
def update_series_state(
    system_id: str, payload: dict = Body(...), db: Session = Depends(get_db)
):
    series = get_series_by_id(db, system_id)
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    try:
        if "rating_series" in payload:
            new_rating = (
                None if payload["rating_series"] == "null" else payload["rating_series"]
            )
            series.rating_series = new_rating
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
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/sync")
def trigger_sync(db: Session = Depends(get_db)):
    try:
        return sync_sheet_to_db(db_session=db)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
