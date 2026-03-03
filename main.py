from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks, Body
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from typing import List
import uvicorn

import database
import schemas
import sheets_sync

# Initialize Database
database.Base.metadata.create_all(bind=database.engine)

app = FastAPI(title="CG1618 Anime Database")

# Mount static files
app.mount("/static", StaticFiles(directory="static"), name="static")


# Dependency
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


@app.get("/anime/{system_id}")
def serve_details(system_id: str):
    return FileResponse("static/details.html")


@app.get("/series/{system_id}")
def serve_series(system_id: str):
    return FileResponse("static/series.html")


@app.get("/search")
def serve_search():
    return FileResponse("static/search.html")


@app.get("/system", response_class=HTMLResponse)
def read_admin():
    with open("static/admin.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/add", response_class=HTMLResponse)
def read_add():
    with open("static/add.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/modify", response_class=HTMLResponse)
def read_modify():
    with open("static/modify.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/delete", response_class=HTMLResponse)
def read_delete():
    with open("static/delete.html", "r", encoding="utf-8") as f:
        return f.read()


@app.get("/api/anime", response_model=List[schemas.AnimeResponse])
def get_all_anime(db: Session = Depends(get_db)):
    return db.query(database.AnimeEntry).all()


@app.get(
    "/api/anime/by-series/{series_name:path}",
    response_model=List[schemas.AnimeResponse],
)
def get_anime_by_series_name(series_name: str, db: Session = Depends(get_db)):
    """Robust lookup for all anime inside a specific franchise."""
    clean_name = str(series_name).strip().lower()
    result = []
    for anime in db.query(database.AnimeEntry).all():
        if anime.series_en and str(anime.series_en).strip().lower() == clean_name:
            result.append(anime)
    return result


@app.get("/api/anime/details/{system_id}", response_model=schemas.AnimeResponse)
def get_anime_details_alias(system_id: str, db: Session = Depends(get_db)):
    """Alias route to catch detail page requests that accidentally include /details/"""
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")
    return anime


@app.get("/api/anime/{system_id}", response_model=schemas.AnimeResponse)
def get_anime_by_id(system_id: str, db: Session = Depends(get_db)):
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")
    return anime


@app.patch("/api/anime/{system_id}/progress")
def update_anime_progress(
    system_id: str, payload: dict = Body(...), db: Session = Depends(get_db)
):
    """Dynamically updates any allowed field and pushes it to Google Sheets"""
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if not anime:
        raise HTTPException(status_code=404, detail="Anime not found")

    allowed_fields = ["ep_fin", "my_progress", "rating_mine", "remark"]
    updated_fields = {}

    for field in allowed_fields:
        if field in payload:
            val = payload[field]
            # Convert Javascript's "null" string back to Python None
            if val == "null":
                val = None

            setattr(anime, field, val)
            updated_fields[field] = val

    if not updated_fields:
        raise HTTPException(
            status_code=400, detail="No valid fields provided to update"
        )

    db.commit()

    # Update Google Sheets directly for each modified field
    try:
        for field, val in updated_fields.items():
            sheets_sync.update_anime_field_in_sheet(system_id, field, val)
    except Exception as e:
        print(f"Failed to update sheet for {system_id}: {e}")

    return {"status": "success", "updated_fields": updated_fields}


# ==========================================
# BACKEND API ENDPOINTS - SERIES
# ==========================================


@app.get("/api/series", response_model=List[schemas.AnimeSeriesResponse])
def get_all_series(db: Session = Depends(get_db)):
    return db.query(database.AnimeSeries).all()


@app.get(
    "/api/series/details/{system_id:path}", response_model=schemas.AnimeSeriesResponse
)
def get_series_details_by_id(system_id: str, db: Session = Depends(get_db)):
    # 1. First, try treating it as a legitimate Series system_id
    series = (
        db.query(database.AnimeSeries)
        .filter(database.AnimeSeries.system_id == system_id)
        .first()
    )
    if series:
        return series

    # 2. Smart Fallback A: The frontend passed a Series Name instead of an ID!
    clean_name = str(system_id).strip().lower()
    for s in db.query(database.AnimeSeries).all():
        if s.series_en and str(s.series_en).strip().lower() == clean_name:
            return s

    # 3. Smart Fallback B: The frontend passed an Anime system_id!
    # Let's find the anime, extract its series name, and return the parent series automatically.
    anime = (
        db.query(database.AnimeEntry)
        .filter(database.AnimeEntry.system_id == system_id)
        .first()
    )
    if anime and anime.series_en:
        clean_anime_name = str(anime.series_en).strip().lower()
        for s in db.query(database.AnimeSeries).all():
            if s.series_en and str(s.series_en).strip().lower() == clean_anime_name:
                return s

    raise HTTPException(status_code=404, detail="Series not found")


@app.patch("/api/series/{system_id}")
def update_series_state(
    system_id: str, payload: dict = Body(...), db: Session = Depends(get_db)
):
    series = (
        db.query(database.AnimeSeries)
        .filter(database.AnimeSeries.system_id == system_id)
        .first()
    )
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")

    if "rating_series" in payload:
        series.rating_series = payload["rating_series"]

    db.commit()
    return {"status": "success"}


# ==========================================
# BACKEND API ENDPOINTS - SYNC
# ==========================================


@app.post("/api/sync")
def trigger_manual_sync(
    background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    try:
        result = sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ==========================================
# BACKEND API ENDPOINTS - ADMIN
# ==========================================


@app.get("/api/admin/logs", response_model=List[schemas.SyncLogResponse])
def get_sync_logs(db: Session = Depends(get_db), limit: int = 50):
    """Fetches the most recent background and manual sync logs."""
    return (
        db.query(database.SyncLog)
        .order_by(database.SyncLog.timestamp.desc())
        .limit(limit)
        .all()
    )


@app.post("/api/admin/add")
def manual_add_anime(payload: schemas.AnimeManualCreate, db: Session = Depends(get_db)):
    """Appends a new anime to the Google Sheet, handles new series creation, and immediately syncs to PostgreSQL."""
    import uuid
    import database  # Ensure access to models

    try:
        # 1. Check if it's a completely new series
        if payload.series_en:
            existing_series = (
                db.query(database.AnimeSeries)
                .filter(database.AnimeSeries.series_en == payload.series_en)
                .first()
            )

            if not existing_series:
                print(
                    f"New series detected: {payload.series_en}. Creating series entry in Google Sheets..."
                )
                new_series_data = {
                    "system_id": str(uuid.uuid4()),
                    "series_en": payload.series_en,
                    "series_roman": payload.series_season_roman,
                    "series_cn": payload.series_season_cn,
                    "rating_series": "",
                    "alt_name": payload.series_alt_name,
                }
                sheets_sync.append_new_series(new_series_data)

        # 2. Append Anime to Google Sheets (Exclude the temporary alt_name so it maps correctly)
        anime_dict = payload.model_dump(exclude={"series_alt_name"})
        sheets_sync.append_new_anime(anime_dict)

        # 3. Immediately trigger Database Sync to keep Postgres completely aligned
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": "Successfully appended to Google Sheets and synced to database.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/admin/anime/{system_id}")
def update_anime_entry(
    system_id: str, payload: schemas.AnimeManualUpdate, db: Session = Depends(get_db)
):
    """Updates an anime in Google Sheets and triggers a DB sync."""
    try:
        anime_dict = payload.model_dump()
        anime_dict["system_id"] = system_id  # Inject the path ID securely into the dict

        sheets_sync.update_anime_row(system_id, anime_dict)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": f"Successfully updated anime {system_id}.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/admin/anime/{system_id}")
def delete_anime_entry(system_id: str, db: Session = Depends(get_db)):
    """Deletes an anime in Google Sheets and triggers a DB sync."""
    try:
        sheets_sync.delete_anime_row(system_id)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": f"Successfully deleted anime {system_id}.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/admin/series/{system_id}")
def update_series_entry(
    system_id: str, payload: schemas.AnimeSeriesUpdate, db: Session = Depends(get_db)
):
    """Updates a series in Google Sheets and triggers a DB sync."""
    try:
        series_dict = payload.model_dump()
        series_dict["system_id"] = system_id

        sheets_sync.update_series_row(system_id, series_dict)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": f"Successfully updated series {system_id}.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/admin/series/{system_id}")
def delete_series_entry(system_id: str, db: Session = Depends(get_db)):
    """Deletes a series in Google Sheets and triggers a DB sync."""
    try:
        sheets_sync.delete_series_row(system_id)
        sheets_sync.sync_sheet_to_db(db_session=db, sync_type="manual")

        return {
            "status": "success",
            "message": f"Successfully deleted series {system_id}.",
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/admin/orphans")
def get_orphaned_entries(db: Session = Depends(get_db)):
    """Detects orphaned entries in the Postgres DB that are missing from Google Sheets."""
    try:
        orphans = sheets_sync.detect_orphans(db)
        return orphans
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/admin/orphans/{system_id}")
def delete_orphan_entry(system_id: str, db: Session = Depends(get_db)):
    """Deletes an orphaned entry directly from the Postgres Database."""
    try:
        db_entry = (
            db.query(database.AnimeEntry)
            .filter(database.AnimeEntry.system_id == system_id)
            .first()
        )
        if not db_entry:
            raise HTTPException(status_code=404, detail="Orphan not found in database.")

        db.delete(db_entry)
        db.commit()
        return {
            "status": "success",
            "message": "Orphan successfully cleared from database.",
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
