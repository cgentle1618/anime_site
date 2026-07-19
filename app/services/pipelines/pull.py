"""Pull pipeline: restore data from Google Sheets tabs."""

import json
import logging
import asyncio
from fastapi import Request
from app.database import get_taipei_now
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from app.models import (
    Cartoon,
    Franchise,
    Manga,
    Novel,
    Series,
    Anime,
    AnimeMovies,
    Movies,
    TVShows,
    SystemOption,
    Seasonal,
)

from app.utils.formatter import (
    format_model_for_sheet,
    parse_row_to_dict,
    parse_franchise_from_sheet,
    parse_series_from_sheet,
    parse_anime_from_sheet,
    parse_anime_movie_from_sheet,
    parse_cartoon_from_sheet,
    parse_manga_from_sheet,
    parse_novel_from_sheet,
    parse_movie_from_sheet,
    parse_tv_show_from_sheet,
    parse_system_option_from_sheet,
    parse_seasonal_from_sheet,
)
from app.utils.data_control_utils import log_data_control

from app.services.integrations.sheets import bulk_overwrite_sheet, get_all_raw_rows
from app.services.domain import (
    has_missing_values_anime,
    has_missing_values_anime_movie,
    has_missing_values_cartoon,
    has_missing_values_manga,
    has_missing_values_novel,
    has_missing_values_movie,
    has_missing_values_tv_show,
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
    autofill_cartoon_from_imdb,
    autofill_manga_from_mal,
    autofill_novel_from_mal,
    autofill_movie_from_imdb,
    autofill_tv_show_from_imdb,
    apply_single_replace_anime,
    apply_single_replace_anime_movie,
    apply_single_replace_cartoon,
    apply_single_replace_manga,
    apply_single_replace_novel,
    apply_single_replace_movie,
    apply_single_replace_tv_show,
    apply_extract_mal_id_anime,
    apply_extract_mal_id_manga_novel,
    apply_extract_imdb_id,
    anime_post_processing,
    anime_movie_post_processing,
    cartoon_post_processing,
    manga_post_processing,
    tv_show_post_processing,
    derive_related_anime,
    derive_related_cartoon,
    derive_related_manga,
    derive_related_tv_show,
    resolve_anime_movie_parent_hierarchy,
    resolve_cartoon_parent_hierarchy,
    resolve_manga_parent_hierarchy,
    resolve_novel_parent_hierarchy,
    resolve_movie_parent_hierarchy,
    resolve_tv_show_parent_hierarchy,
)
from app.services.calculation import (
    run_sync_anime,
    run_sync_anime_movie,
    run_sync_cartoon,
    run_sync_manga,
    run_sync_novel,
    run_sync_tv_show,
)

logger = logging.getLogger(__name__)


def execute_pull_specific(
    db: Session, tab_name: str, action_type: str = "Manual", log_action: bool = True
) -> dict:
    """
    Pulls data from a specific Google Sheet tab and gracefully Upserts it into PostgreSQL.
    Tracks exact rows added vs updated for logging.
    """
    MODEL_MAP = {
        "Franchise": Franchise,
        "Series": Series,
        "Anime": Anime,
        "Anime Movies": AnimeMovies,
        "Cartoons": Cartoon,
        "Manga": Manga,
        "Novel": Novel,
        "Movies": Movies,
        "TV Shows": TVShows,
        "System Options": SystemOption,
        "Seasonal": Seasonal,
    }

    PARSER_MAP = {
        "Franchise": parse_franchise_from_sheet,
        "Series": parse_series_from_sheet,
        "Anime": parse_anime_from_sheet,
        "Anime Movies": parse_anime_movie_from_sheet,
        "Cartoons": parse_cartoon_from_sheet,
        "Manga": parse_manga_from_sheet,
        "Novel": parse_novel_from_sheet,
        "Movies": parse_movie_from_sheet,
        "TV Shows": parse_tv_show_from_sheet,
        "System Options": parse_system_option_from_sheet,
        "Seasonal": parse_seasonal_from_sheet,
    }

    if tab_name not in MODEL_MAP:
        return {"status": "error", "message": f"Unknown tab: {tab_name}"}

    logger.info(f"Starting Pull Pipeline for '{tab_name}'...")

    raw_matrix = get_all_raw_rows(tab_name)
    if not raw_matrix or len(raw_matrix) < 2:
        logger.info(f"No data found in '{tab_name}' to pull.")
        if log_action:
            log_data_control(db, "Pull", f"Pull {tab_name}", action_type, "Success")
        return {"status": "success", "processed": 0, "rows_added": 0, "rows_updated": 0}

    headers = raw_matrix[0]
    data_rows = raw_matrix[1:]

    Model = MODEL_MAP[tab_name]
    parser = PARSER_MAP[tab_name]

    processed = 0
    rows_added = 0
    rows_updated = 0

    for row in data_rows:
        if not row or not any(row):
            continue

        raw_header_dict = parse_row_to_dict(headers, row)
        clean_header_dict = parser(raw_header_dict)

        # Resolve String Foreign Keys -> Actual UUIDs
        # TV Show uses resolve_tv_show_parent_hierarchy (auto-creates franchise, looks up series)
        if tab_name == "TV Shows" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("tv_name_en"),
                "cn": clean_header_dict.get("tv_name_cn"),
                "alt": clean_header_dict.get("tv_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_tv_show_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Cartoon uses resolve_cartoon_parent_hierarchy (auto-creates franchise with type "Cartoon", looks up series)
        elif tab_name == "Cartoons" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("cartoon_name_en"),
                "cn": clean_header_dict.get("cartoon_name_cn"),
                "alt": clean_header_dict.get("cartoon_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_cartoon_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Manga uses resolve_manga_parent_hierarchy (auto-creates franchise with type "ACG", looks up series)
        elif tab_name == "Manga" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("manga_name_en"),
                "cn": clean_header_dict.get("manga_name_cn"),
                "roman": clean_header_dict.get("manga_name_roman"),
                "jp": clean_header_dict.get("manga_name_jp"),
                "alt": clean_header_dict.get("manga_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_manga_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Novel uses resolve_novel_parent_hierarchy (auto-creates franchise with type "Novel", looks up series)
        elif tab_name == "Novel" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("novel_name_en"),
                "cn": clean_header_dict.get("novel_name_cn"),
                "roman": clean_header_dict.get("novel_name_roman"),
                "jp": clean_header_dict.get("novel_name_jp"),
                "alt": clean_header_dict.get("novel_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_novel_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Movie uses resolve_movie_parent_hierarchy (auto-creates franchise, looks up series)
        elif tab_name == "Movies" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            sid = clean_header_dict.get("series_id")
            name_fields = {
                "en": clean_header_dict.get("movie_name_en"),
                "cn": clean_header_dict.get("movie_name_cn"),
                "alt": clean_header_dict.get("movie_name_alt"),
            }
            clean_header_dict["franchise_id"], clean_header_dict["series_id"] = (
                resolve_movie_parent_hierarchy(db, fid, sid, name_fields)
            )
        # Anime Movie uses resolve_anime_movie_parent_hierarchy (auto-creates franchise if missing)
        elif tab_name == "Anime Movie" and "franchise_id" in clean_header_dict:
            fid = clean_header_dict.get("franchise_id")
            if fid is None or isinstance(fid, str):
                name_fields = {
                    "en": clean_header_dict.get("anime_movie_name_en"),
                    "cn": clean_header_dict.get("anime_movie_name_cn"),
                    "roman": clean_header_dict.get("anime_movie_name_roman"),
                    "jp": clean_header_dict.get("anime_movie_name_jp"),
                    "alt": clean_header_dict.get("anime_movie_name_alt"),
                }
                clean_header_dict["franchise_id"] = (
                    resolve_anime_movie_parent_hierarchy(db, fid, name_fields)
                )
        elif "franchise_id" in clean_header_dict and isinstance(
            clean_header_dict["franchise_id"], str
        ):
            fname = clean_header_dict["franchise_id"]
            if fname.strip():
                fran = (
                    db.query(Franchise)
                    .filter(
                        or_(
                            Franchise.franchise_name_en == fname,
                            Franchise.franchise_name_cn == fname,
                            Franchise.franchise_name_jp == fname,
                            Franchise.franchise_name_alt == fname,
                        )
                    )
                    .first()
                )
                if fran:
                    clean_header_dict["franchise_id"] = fran.system_id
                else:
                    logger.warning(
                        f"Could not resolve franchise FK for: {fname}. Skipping row."
                    )
                    continue

        if "series_id" in clean_header_dict and isinstance(
            clean_header_dict["series_id"], str
        ):
            sname = clean_header_dict["series_id"]
            if sname.strip():
                series = (
                    db.query(Series)
                    .filter(
                        or_(
                            Series.series_name_en == sname,
                            Series.series_name_cn == sname,
                            Series.series_name_alt == sname,
                        )
                    )
                    .first()
                )
                if series:
                    clean_header_dict["series_id"] = series.system_id
                else:
                    logger.warning(
                        f"Could not resolve series FK for: {sname}. Skipping row."
                    )
                    continue

        # System Options uses 'id', Seasonal uses 'seasonal', others use 'system_id'
        if tab_name == "System Options":
            pk_field = "id"
        elif tab_name == "Seasonal":
            pk_field = "seasonal"
        else:
            pk_field = "system_id"
        pk_value = clean_header_dict.get(pk_field)

        # Smart Primary Key Logic (Upsert vs Insert)
        if not pk_value or (isinstance(pk_value, str) and not pk_value.strip()):
            existing_record = None
            if tab_name == "Franchise":
                name = clean_header_dict.get(
                    "franchise_name_en"
                ) or clean_header_dict.get("franchise_name_cn")
                if name:
                    existing_record = (
                        db.query(Franchise)
                        .filter(
                            or_(
                                Franchise.franchise_name_en == name,
                                Franchise.franchise_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Series":
                name = clean_header_dict.get("series_name_en") or clean_header_dict.get(
                    "series_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Series)
                        .filter(
                            or_(
                                Series.series_name_en == name,
                                Series.series_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Anime":
                name = clean_header_dict.get("anime_name_en") or clean_header_dict.get(
                    "anime_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Anime)
                        .filter(
                            or_(
                                Anime.anime_name_en == name, Anime.anime_name_cn == name
                            )
                        )
                        .first()
                    )
            elif tab_name == "Anime Movie":
                name = clean_header_dict.get(
                    "anime_movie_name_en"
                ) or clean_header_dict.get("anime_movie_name_cn")
                if name:
                    existing_record = (
                        db.query(AnimeMovies)
                        .filter(
                            or_(
                                AnimeMovies.anime_movie_name_en == name,
                                AnimeMovies.anime_movie_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Movies":
                name = clean_header_dict.get("movie_name_en") or clean_header_dict.get(
                    "movie_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Movies)
                        .filter(
                            or_(
                                Movies.movie_name_en == name,
                                Movies.movie_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "TV Shows":
                name = clean_header_dict.get("tv_name_en") or clean_header_dict.get(
                    "tv_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(TVShows)
                        .filter(
                            or_(
                                TVShows.tv_name_en == name,
                                TVShows.tv_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Cartoons":
                name = clean_header_dict.get(
                    "cartoon_name_en"
                ) or clean_header_dict.get("cartoon_name_cn")
                if name:
                    existing_record = (
                        db.query(Cartoon)
                        .filter(
                            or_(
                                Cartoon.cartoon_name_en == name,
                                Cartoon.cartoon_name_cn == name,
                            )
                        )
                        .first()
                    )
            elif tab_name == "Manga":
                name = clean_header_dict.get("manga_name_en") or clean_header_dict.get(
                    "manga_name_cn"
                )
                if name:
                    existing_record = (
                        db.query(Manga)
                        .filter(
                            or_(
                                Manga.manga_name_en == name,
                                Manga.manga_name_cn == name,
                            )
                        )
                        .first()
                    )

            if existing_record:
                pk_value = getattr(existing_record, pk_field)
                clean_header_dict[pk_field] = pk_value
            else:
                clean_header_dict.pop(pk_field, None)
                pk_value = None

        # Data Sanitization (Prevent Pydantic Schema 500 Validation Errors)
        if tab_name == "Anime":
            if clean_header_dict.get("watching_status") is None:
                clean_header_dict["watching_status"] = "Haven't Started"
            if clean_header_dict.get("airing_status") is None:
                clean_header_dict["airing_status"] = ""
            if clean_header_dict.get("airing_type") is None:
                clean_header_dict["airing_type"] = ""
        elif tab_name in ("Movies", "Anime Movies", "TV Shows", "Cartoons"):
            if clean_header_dict.get("watching_status") is None:
                clean_header_dict["watching_status"] = "Might Watch"
            if clean_header_dict.get("created_at") is None:
                clean_header_dict["created_at"] = get_taipei_now()
            if clean_header_dict.get("updated_at") is None:
                clean_header_dict["updated_at"] = get_taipei_now()
        elif tab_name == "Manga":
            if clean_header_dict.get("reading_status") is None:
                clean_header_dict["reading_status"] = "Might Read"
            if clean_header_dict.get("created_at") is None:
                clean_header_dict["created_at"] = get_taipei_now()
            if clean_header_dict.get("updated_at") is None:
                clean_header_dict["updated_at"] = get_taipei_now()

        # UPSERT LOGIC
        if pk_value:
            existing = (
                db.query(Model).filter(getattr(Model, pk_field) == pk_value).first()
            )

            if existing:
                # Update existing record
                for key, value in clean_header_dict.items():
                    setattr(existing, key, value)
                rows_updated += 1
            else:
                # Create new record (UUID provided but record missing locally)
                new_record = Model(**clean_header_dict)
                db.add(new_record)
                rows_added += 1
        else:
            # Create new record (UUID missing, let DB generate it)
            new_record = Model(**clean_header_dict)
            db.add(new_record)
            rows_added += 1

        processed += 1

        # Flush periodically so DB generates new UUIDs immediately for Foreign Key references
        if processed % 50 == 0:
            db.flush()

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error(f"Error committing batch for {tab_name}: {e}")
        if log_action:
            log_data_control(
                db,
                "Pull",
                f"Pull {tab_name}",
                action_type,
                "Failed",
                error_message=str(e),
            )
        return {"status": "error", "message": str(e)}

    if tab_name == "System Options":
        db.execute(
            text(
                "SELECT setval('system_options_id_seq', COALESCE((SELECT MAX(id) FROM system_options), 0))"
            )
        )
        db.commit()

    logger.info(
        f"Successfully pulled and upserted {processed} records from '{tab_name}'."
    )
    if log_action:
        log_data_control(
            db,
            "Pull",
            f"Pull {tab_name}",
            action_type,
            "Success",
            rows_added=rows_added,
            rows_updated=rows_updated,
        )

    return {
        "status": "success",
        "processed": processed,
        "rows_added": rows_added,
        "rows_updated": rows_updated,
    }


def execute_pull_all(db: Session, action_type: str = "Manual") -> dict:
    """
    Pulls ALL tabs from Google Sheets into the database.
    WARNING: The execution order is STRICT to satisfy Foreign Key constraints.
    """
    logger.info("Starting Full Pull Pipeline (All Tabs)...")

    tabs_in_order = [
        "System Options",
        "Franchise",
        "Series",
        "Anime",
        "Anime Movies",
        "Movies",
        "TV Shows",
        "Cartoons",
        "Manga",
        "Novel",
        "Seasonal",
    ]

    results = {}
    total_added = 0
    total_updated = 0

    try:
        for tab in tabs_in_order:
            res = execute_pull_specific(db, tab, action_type="Manual", log_action=True)

            if res.get("status") == "error":
                raise Exception(f"Pull failed on tab {tab}: {res.get('message')}")

            total_added += res.get("rows_added", 0)
            total_updated += res.get("rows_updated", 0)
            results[tab] = res.get("processed", 0)

        logger.info("Full Pull Pipeline completed successfully.")
        log_data_control(
            db,
            "Pull",
            "Pull All",
            action_type,
            "Success",
            rows_added=total_added,
            rows_updated=total_updated,
            details_json=json.dumps(results),
        )
        return {"status": "success", "details": results}

    except Exception as e:
        logger.error(f"Full Pull Pipeline crashed: {e}")
        log_data_control(
            db, "Pull", "Pull All", action_type, "Failed", error_message=str(e)
        )
        raise e
