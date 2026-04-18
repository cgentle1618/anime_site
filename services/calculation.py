"""
calculation.py
On-demand bulk calculate and fix operations.
Wraps single-entry logic from other_logics.py and utils for bulk application across the DB.
"""

from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from utils.jikan_utils import ALLOWED_AIRING_TYPES

from models import Anime
from services.other_logics import (
    check_is_tv_completed,
    mark_tv_completed,
    apply_check_baha,
    auto_create_seasonal,
    sync_seasonal_counts,
    autofill_ep_previous,
    autofill_watch_order,
    autofill_prequel_sequel,
    autofill_anime_from_mal,
    extract_system_options_from_anime,
)
from utils.utils import (
    validate_episode_math,
    extract_season_from_title,
    calculate_season_from_month,
)


def bulk_set_season_1(db: Session) -> dict:
    lone_franchise_sq = (
        db.query(Anime.franchise_id)
        .filter(
            Anime.franchise_id.isnot(None),
            Anime.airing_type == "TV",
        )
        .group_by(Anime.franchise_id)
        .having(func.count(Anime.system_id) == 1)
        .subquery()
    )
    animes = (
        db.query(Anime)
        .filter(
            Anime.franchise_id.in_(db.query(lone_franchise_sq.c.franchise_id)),
            Anime.airing_type == "TV",
            Anime.season_part.is_(None),
        )
        .all()
    )
    for anime in animes:
        anime.season_part = "Season 1"
    if animes:
        db.commit()
    return {
        "status": "success",
        "message": f"Set season_part='Season 1' for {len(animes)} lone TV entries.",
    }


def bulk_check_baha(db: Session) -> dict:
    animes = (
        db.query(Anime)
        .filter(
            Anime.baha_link.isnot(None),
            Anime.airing_status == "Airing",
            Anime.source_baha.is_(None),
        )
        .all()
    )
    for anime in animes:
        apply_check_baha(anime)
    if animes:
        db.commit()
    return {
        "status": "success",
        "message": f"Set source_baha=True for {len(animes)} entries.",
    }


def bulk_validate_episode_math(db: Session) -> dict:
    animes = db.query(Anime).all()
    updated = 0
    for anime in animes:
        safe_total, safe_fin = validate_episode_math(anime.ep_total, anime.ep_fin)
        if anime.ep_total != safe_total or anime.ep_fin != safe_fin:
            anime.ep_total = safe_total
            anime.ep_fin = safe_fin
            updated += 1
    if updated > 0:
        db.commit()
    return {
        "status": "success",
        "message": f"Validated {len(animes)} entries, fixed {updated}.",
    }


def bulk_mark_tv_completed(db: Session) -> dict:
    animes = db.query(Anime).filter(Anime.airing_type.in_(["TV", "ONA"])).all()
    marked = 0
    for anime in animes:
        if check_is_tv_completed(anime) and anime.watching_status != "Completed":
            mark_tv_completed(anime)
            marked += 1
    if marked > 0:
        db.commit()
    return {
        "status": "success",
        "message": f"Checked {len(animes)} TV/ONA entries, marked {marked} as completed.",
    }


def bulk_extract_season_from_title(db: Session) -> dict:
    animes = db.query(Anime).filter(Anime.season_part.is_(None)).all()
    updated = 0
    for anime in animes:
        title = anime.anime_name_en or anime.anime_name_romanji or ""
        extracted = extract_season_from_title(title)
        if extracted:
            anime.season_part = extracted
            updated += 1
    if updated > 0:
        db.commit()
    return {
        "status": "success",
        "message": f"Checked {len(animes)} entries without season_part, extracted {updated}.",
    }


def bulk_calculate_season_from_month(db: Session) -> dict:
    animes = (
        db.query(Anime)
        .filter(
            Anime.release_season.is_(None),
            Anime.release_month.isnot(None),
            Anime.airing_type == "TV",
        )
        .all()
    )
    updated = 0
    for anime in animes:
        season = calculate_season_from_month(anime.release_month)
        if season:
            anime.release_season = season
            updated += 1
    if updated > 0:
        db.commit()
    return {
        "status": "success",
        "message": f"Checked {len(animes)} TV entries, derived release_season for {updated}.",
    }


def bulk_autofill_ep_previous(db: Session) -> dict:
    rows = (
        db.query(Anime.franchise_id)
        .filter(Anime.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        autofill_ep_previous(db, fid)
    if franchise_ids:
        db.commit()
    return {
        "status": "success",
        "message": f"Ran ep_previous cascade for {len(franchise_ids)} franchises.",
    }


def bulk_autofill_watch_order(db: Session) -> dict:
    rows = (
        db.query(Anime.franchise_id)
        .filter(Anime.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        autofill_watch_order(db, fid)
    if franchise_ids:
        db.commit()
    return {
        "status": "success",
        "message": f"Ran watch_order autofill for {len(franchise_ids)} franchises.",
    }


def bulk_autofill_prequel_sequel(db: Session) -> dict:
    rows = (
        db.query(Anime.franchise_id)
        .filter(Anime.franchise_id.isnot(None))
        .distinct()
        .all()
    )
    franchise_ids = [r[0] for r in rows]
    for fid in franchise_ids:
        autofill_prequel_sequel(db, fid)
    if franchise_ids:
        db.commit()
    return {
        "status": "success",
        "message": f"Ran prequel/sequel autofill for {len(franchise_ids)} franchises.",
    }


def run_sync_seasonal_counts(db: Session) -> dict:
    sync_seasonal_counts(db)
    return {
        "status": "success",
        "message": "Seasonal entry counts (completed / watching / dropped) updated.",
    }


def run_auto_create_seasonal(db: Session) -> dict:
    auto_create_seasonal(db)
    return {
        "status": "success",
        "message": "Seasonal entries created for all unique season/year combinations.",
    }


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
            missing.append({
                "system_id": str(anime.system_id),
                "name": name,
                "airing_type": anime.airing_type,
            })
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


def run_extract_system_options(db: Session) -> dict:
    return extract_system_options_from_anime(db)
