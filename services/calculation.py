"""
calculation.py
On-demand bulk calculate and fix operations.
Wraps single-entry logic from other_logics.py for bulk application across the DB.
"""

from typing import Optional

from sqlalchemy.orm import Session

from utils.jikan_utils import ALLOWED_AIRING_TYPES

from models import Anime
from services.other_logics import (
    derive_ep_previous,
    derive_watch_order,
    derive_prequel_sequel,
    sync_seasonal_counts,
    create_missing_seasonal,
    extract_system_options_from_anime,
    autofill_anime_from_mal,
    process_anime_entry,
)


def bulk_check_cover_image(db: Session, entry_type: Optional[str] = None) -> dict:
    from services.image_manager import cover_image_exists

    query = db.query(Anime).filter(Anime.cover_image_file.isnot(None))
    if entry_type:
        query = query.filter(Anime.airing_type == entry_type)
    animes = query.all()

    missing = []
    for anime in animes:
        if not cover_image_exists(str(anime.system_id)):
            name = (
                anime.anime_name_cn
                or anime.anime_name_en
                or anime.anime_name_romanji
                or str(anime.system_id)
            )
            missing.append(
                {
                    "system_id": str(anime.system_id),
                    "name": name,
                    "airing_type": anime.airing_type,
                }
            )
    return {
        "status": "success",
        "total_checked": len(animes),
        "missing_count": len(missing),
        "missing": missing,
        "entry_type": entry_type,
    }


def bulk_download_missing_covers(db: Session, entry_type: Optional[str] = None) -> dict:
    from services.image_manager import cover_image_exists

    query = db.query(Anime).filter(Anime.cover_image_file.isnot(None))
    if entry_type:
        query = query.filter(Anime.airing_type == entry_type)
    animes = query.all()

    to_fix = [a for a in animes if not cover_image_exists(str(a.system_id))]
    downloaded = 0
    skipped = 0
    for anime in to_fix:
        if anime.airing_type in ALLOWED_AIRING_TYPES:
            anime.cover_image_file = None
            autofill_anime_from_mal(anime, force_replace_ratings=False)
            if anime.cover_image_file:
                downloaded += 1
        else:
            skipped += 1
    if to_fix:
        db.commit()
    parts = [f"Downloaded {downloaded} of {len(to_fix)} missing cover images."]
    if skipped:
        parts.append(f"{skipped} skipped (no Jikan source for this type).")
    return {"status": "success", "message": " ".join(parts)}


def run_anime_post_processing(db: Session) -> dict:
    animes = db.query(Anime).all()
    for anime in animes:
        process_anime_entry(anime)
    db.commit()
    return {
        "status": "success",
        "message": f"Post-processed {len(animes)} anime entries.",
    }


def run_derive_related(db: Session) -> dict:
    rows = (
        db.query(Anime.franchise_id)
        .filter(Anime.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        derive_watch_order(db, fid)
        derive_ep_previous(db, fid)
        derive_prequel_sequel(db, fid)
    if franchise_ids:
        db.commit()
    return {
        "status": "success",
        "message": f"Derived watch order, ep_previous, and prequel/sequel for {len(franchise_ids)} franchises.",
    }


def run_sync(db: Session) -> dict:
    create_missing_seasonal(db)
    sync_seasonal_counts(db)
    extract_system_options_from_anime(db)
    return {
        "status": "success",
        "message": "Missing seasonals created, seasonal counts synced, system options extracted.",
    }


def run_calculate_all(db: Session) -> dict:
    run_anime_post_processing(db)
    run_derive_related(db)
    run_sync(db)
    return {
        "status": "success",
        "message": "Full calculation complete.",
    }
