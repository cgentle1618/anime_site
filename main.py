from fastapi import FastAPI, Depends, HTTPException
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

# 1. Initialize the FastAPI app
app = FastAPI(title="Anime Tracker API")

# 2. CORS Setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Create tables on startup
database.Base.metadata.create_all(bind=database.engine)


# 4. Dependency
def get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Helper for generic sheet updates
def update_sheet_field(system_id: str, field_name: str, value):
    sheet = get_google_sheet("Anime")
    cell = execute_with_retry(sheet.find, system_id)
    if not cell:
        return
    headers = execute_with_retry(sheet.row_values, 1)
    try:
        col_index = len(headers) - headers[::-1].index(field_name)
        execute_with_retry(sheet.update_cell, cell.row, col_index, value)
    except ValueError:
        print(f"Column {field_name} not found in sheet.")


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


# ==========================================
# BACKEND API ENDPOINTS
# ==========================================


@app.get("/api/anime", response_model=List[schemas.AnimeResponse])
def get_all_anime(db: Session = Depends(get_db)):
    return db.query(database.AnimeEntry).all()


@app.get("/api/anime/details/{system_id}")
def get_anime_details(system_id: str, db: Session = Depends(get_db)):
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")

    series_meta = (
        db.query(database.AnimeSeries)
        .filter(database.AnimeSeries.series_en == anime.series_en)
        .first()
    )
    anime_dict = schemas.AnimeResponse.from_orm(anime).dict()

    # Inject series metadata into the response
    anime_dict["alt_name"] = series_meta.alt_name if series_meta else None
    anime_dict["series_cn"] = series_meta.series_cn if series_meta else None

    return anime_dict


@app.patch("/api/anime/{system_id}/progress")
def update_anime_state(system_id: str, payload: dict, db: Session = Depends(get_db)):
    """Updates watch progress or status in both PostgreSQL and Google Sheets."""
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")

    # Handle Episode Update
    if "ep_fin" in payload:
        new_ep_fin = payload["ep_fin"]
        anime.ep_fin = new_ep_fin
        try:
            update_episode_progress_in_sheet(system_id, new_ep_fin)
        except Exception as e:
            print(f"Sheet update failed: {e}")

    # Handle Status Update
    if "my_progress" in payload:
        new_status = payload["my_progress"]
        anime.my_progress = new_status
        try:
            update_sheet_field(system_id, "my_progress", new_status)
        except Exception as e:
            print(f"Sheet update failed: {e}")

    # Handle Rating Update
    if "rating_mine" in payload:
        new_rating = payload["rating_mine"]
        if new_rating == "null":
            new_rating = None

        anime.rating_mine = new_rating
        try:
            update_sheet_field(
                system_id, "rating_mine", new_rating if new_rating else ""
            )
        except Exception as e:
            print(f"Sheet update failed: {e}")

    # Handle Remark Update
    if "remark" in payload:
        new_remark = payload["remark"]
        anime.remark = new_remark
        try:
            update_sheet_field(system_id, "remark", new_remark if new_remark else "")
        except Exception as e:
            print(f"Sheet update failed: {e}")

    db.commit()
    return {"status": "success"}


@app.get("/api/series", response_model=List[schemas.AnimeSeriesResponse])
def get_all_series(db: Session = Depends(get_db)):
    return db.query(database.AnimeSeries).all()


@app.post("/api/sync")
def trigger_sync(db: Session = Depends(get_db)):
    try:
        result = sync_sheet_to_db(db_session=db)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
