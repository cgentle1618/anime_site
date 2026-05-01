"""
calculation.py
On-demand bulk calculate and fix operations.
Wraps single-entry logic from other_logics.py for bulk application across the DB.
"""

from typing import Optional

from sqlalchemy.orm import Session

from utils.jikan_utils import ALLOWED_AIRING_TYPES
from utils.data_control_utils import log_data_control

from models import Anime, AnimeMovies, Cartoon, Movies, TVShows

from services.image_manager import cover_image_exists, list_all_cover_images
from services.other_logics import (
    sync_seasonal_counts,
    create_missing_seasonal,
    extract_system_options_from_anime,
    extract_system_options_from_anime_movie,
    extract_system_options_from_cartoon,
    extract_system_options_from_tv_show,
    autofill_anime_from_mal,
    anime_post_processing,
    anime_movie_post_processing,
    cartoon_post_processing,
    tv_show_post_processing,
    derive_related_anime,
    derive_related_cartoon,
    derive_related_tv_show,
)

# ==========================================
# BULK ACTIONS
# ==========================================


def bulk_check_unused_cover_images(db: Session) -> dict:
    all_files = set(list_all_cover_images())
    referenced = (
        {
            row[0]
            for row in db.query(Anime.cover_image_file)
            .filter(Anime.cover_image_file.isnot(None))
            .all()
        }
        | {
            row[0]
            for row in db.query(AnimeMovies.cover_image_file)
            .filter(AnimeMovies.cover_image_file.isnot(None))
            .all()
        }
        | {
            row[0]
            for row in db.query(Cartoon.cover_image_file)
            .filter(Cartoon.cover_image_file.isnot(None))
            .all()
        }
        | {
            row[0]
            for row in db.query(Movies.cover_image_file)
            .filter(Movies.cover_image_file.isnot(None))
            .all()
        }
        | {
            row[0]
            for row in db.query(TVShows.cover_image_file)
            .filter(TVShows.cover_image_file.isnot(None))
            .all()
        }
    )
    entry_map = {str(e.system_id): e for e in db.query(Anime).all()}
    entry_map.update({str(e.system_id): e for e in db.query(AnimeMovies).all()})
    entry_map.update({str(e.system_id): e for e in db.query(Cartoon).all()})
    entry_map.update({str(e.system_id): e for e in db.query(Movies).all()})
    entry_map.update({str(e.system_id): e for e in db.query(TVShows).all()})

    should_use = []
    orphaned = []
    for filename in sorted(all_files - referenced):
        stem = filename[:-4] if filename.endswith(".jpg") else filename
        if stem in entry_map:
            e = entry_map[stem]
            should_use.append({"system_id": stem, "name": e.display_name or stem})
        else:
            orphaned.append(filename)

    return {
        "status": "success",
        "total_in_storage": len(all_files),
        "should_use": should_use,
        "should_use_count": len(should_use),
        "orphaned": orphaned,
        "orphaned_count": len(orphaned),
    }


def bulk_check_cover_image(db: Session, entry_type: Optional[str] = None) -> dict:
    unused_result = bulk_check_unused_cover_images(db)

    missing = []

    query = db.query(Anime).filter(Anime.cover_image_file.isnot(None))
    if entry_type:
        query = query.filter(Anime.airing_type == entry_type)
    animes = query.all()
    for anime in animes:
        if not cover_image_exists(str(anime.system_id)):
            missing.append(
                {
                    "system_id": str(anime.system_id),
                    "name": anime.display_name or str(anime.system_id),
                    "entry_type": anime.airing_type,
                }
            )

    if not entry_type:
        anime_movies = (
            db.query(AnimeMovies).filter(AnimeMovies.cover_image_file.isnot(None)).all()
        )
        for am in anime_movies:
            if not cover_image_exists(str(am.system_id)):
                missing.append(
                    {
                        "system_id": str(am.system_id),
                        "name": am.display_name or str(am.system_id),
                        "entry_type": "anime_movie",
                    }
                )

        cartoons = db.query(Cartoon).filter(Cartoon.cover_image_file.isnot(None)).all()
        for c in cartoons:
            if not cover_image_exists(str(c.system_id)):
                missing.append(
                    {
                        "system_id": str(c.system_id),
                        "name": c.display_name or str(c.system_id),
                        "entry_type": "cartoon",
                    }
                )

        movies = db.query(Movies).filter(Movies.cover_image_file.isnot(None)).all()
        for m in movies:
            if not cover_image_exists(str(m.system_id)):
                missing.append(
                    {
                        "system_id": str(m.system_id),
                        "name": m.display_name or str(m.system_id),
                        "entry_type": "movie",
                    }
                )

        tv_shows = db.query(TVShows).filter(TVShows.cover_image_file.isnot(None)).all()
        for t in tv_shows:
            if not cover_image_exists(str(t.system_id)):
                missing.append(
                    {
                        "system_id": str(t.system_id),
                        "name": t.display_name or str(t.system_id),
                        "entry_type": "tv_show",
                    }
                )

    total_checked = len(animes) + (
        0
        if entry_type
        else len(anime_movies) + len(cartoons) + len(movies) + len(tv_shows)
    )
    return {
        "status": "success",
        "total_checked": total_checked,
        "missing_count": len(missing),
        "missing": missing,
        "entry_type": entry_type,
        "should_use": unused_result["should_use"],
        "should_use_count": unused_result["should_use_count"],
        "orphaned": unused_result["orphaned"],
        "orphaned_count": unused_result["orphaned_count"],
    }


def bulk_set_cover_image_fields(db: Session) -> dict:
    animes = db.query(Anime).filter(Anime.cover_image_file.is_(None)).all()
    updated = 0
    for anime in animes:
        sid = str(anime.system_id)
        if cover_image_exists(sid):
            anime.cover_image_file = f"{sid}.jpg"
            updated += 1
    if updated:
        db.commit()
    return {"status": "success", "updated_count": updated}


def bulk_delete_orphaned_cover_images(db: Session) -> dict:
    from services.image_manager import delete_cover_image

    unused_result = bulk_check_unused_cover_images(db)
    orphaned = unused_result["orphaned"]
    for filename in orphaned:
        stem = filename[:-4] if filename.endswith(".jpg") else filename
        delete_cover_image(stem)
    return {"status": "success", "deleted_count": len(orphaned)}


def bulk_download_missing_covers(
    db: Session, system_ids: Optional[list[str]] = None
) -> dict:
    query = db.query(Anime).filter(Anime.cover_image_file.isnot(None))
    if system_ids is not None:
        query = query.filter(Anime.system_id.in_(system_ids))
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


# ==========================================
# COMPOSITE LOGICS
# ==========================================


def run_post_processing(db: Session) -> dict:
    animes = db.query(Anime).all()
    for anime in animes:
        anime_post_processing(anime, db)
    db.commit()

    movies = db.query(AnimeMovies).all()
    for movie in movies:
        anime_movie_post_processing(movie, db)
    db.commit()

    shows = db.query(TVShows).all()
    for show in shows:
        tv_show_post_processing(show, db)
    db.commit()

    cartoons = db.query(Cartoon).all()
    for cartoon in cartoons:
        cartoon_post_processing(cartoon, db)
    db.commit()

    return {
        "status": "success",
        "message": f"Post-processed {len(animes)} anime, {len(movies)} anime movies, {len(shows)} TV show entries, and {len(cartoons)} cartoon entries.",
    }


def run_derive_related(db: Session) -> dict:
    derive_related_anime(db)
    derive_related_tv_show(db)
    derive_related_cartoon(db)
    return {
        "status": "success",
        "message": "Derived watch order, ep_previous, and prequel/sequel for all franchises.",
    }


def run_sync(db: Session) -> dict:
    run_sync_anime(db)
    run_sync_anime_movie(db)
    run_sync_tv_show(db)
    run_sync_cartoon(db)
    return {
        "status": "success",
        "message": "All synchronization tasks completed.",
    }


def run_sync_cartoon(db: Session) -> dict:
    extract_system_options_from_cartoon(db)
    return {
        "status": "success",
        "message": "System options extracted from cartoons.",
    }


def run_sync_anime(db: Session) -> dict:
    create_missing_seasonal(db)
    sync_seasonal_counts(db)
    extract_system_options_from_anime(db)
    return {
        "status": "success",
        "message": "Missing seasonals created, seasonal counts synced, system options extracted.",
    }


def run_sync_anime_movie(db: Session) -> dict:
    extract_system_options_from_anime_movie(db)
    return {
        "status": "success",
        "message": "System options extracted from anime movies.",
    }


def run_sync_tv_show(db: Session) -> dict:
    extract_system_options_from_tv_show(db)
    return {
        "status": "success",
        "message": "System options extracted from TV shows.",
    }


def run_calculate_all(db: Session) -> dict:
    try:
        run_post_processing(db)
        run_derive_related(db)
        run_sync(db)
        bulk_check_cover_image(db)
        log_data_control(db, "Calculate", "Calculate All", "Manual", "Success")
        return {"status": "success", "message": "Full calculation complete."}
    except Exception as e:
        log_data_control(
            db, "Calculate", "Calculate All", "Manual", "Failed", error_message=str(e)
        )
        raise
