"""Backup pipeline: dump the database to Google Sheets."""

import json
import logging
import asyncio
from fastapi import Request
from app.database import get_taipei_now
from sqlalchemy.orm import Session
from sqlalchemy import or_, text

from app.models import (
    Cartoon,
    Collection,
    Franchise,
    Manga,
    Novel,
    Series,
    Anime,
    AnimeMovies,
    Movies,
    TVShows,
    SystemOption,
    SystemConfigs,
    Seasonal,
    WatchOrderList,
    WatchOrderItem,
    MediaRelation,
    Quote,
    Meme,
    Note,
)

from app.utils.formatter import (
    format_model_for_sheet,
    parse_row_to_dict,
    parse_collection_from_sheet,
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


def execute_backup(db: Session, action_type: str = "Manual") -> dict:
    """
    Retrieves the entire PostgreSQL database and permanently overwrites
    the target tabs in Google Sheets dynamically based on the DB schema.
    """
    logger.info(f"Starting Google Sheets Backup Pipeline ({action_type})...")

    try:
        sysopts = db.query(SystemOption).all()
        sysopt_headers = [c.name for c in SystemOption.__table__.columns]
        sysopt_matrix = [sysopt_headers] + [format_model_for_sheet(o) for o in sysopts]
        bulk_overwrite_sheet("System Options", sysopt_matrix)

        # Announcements and admin form defaults live here as key/value rows,
        # so the tab is real user data rather than runtime bookkeeping.
        sysconfigs = db.query(SystemConfigs).all()
        sysconfig_headers = [c.name for c in SystemConfigs.__table__.columns]
        sysconfig_matrix = [sysconfig_headers] + [
            format_model_for_sheet(c) for c in sysconfigs
        ]
        bulk_overwrite_sheet("System Configs", sysconfig_matrix)

        seasonals = db.query(Seasonal).all()
        seasonal_headers = [c.name for c in Seasonal.__table__.columns]
        seasonal_matrix = [seasonal_headers] + [
            format_model_for_sheet(o) for o in seasonals
        ]
        bulk_overwrite_sheet("Seasonal", seasonal_matrix)

        # Collection is written before Franchise so the FK parent exists first.
        collections = db.query(Collection).all()
        collection_headers = [c.name for c in Collection.__table__.columns]
        collection_matrix = [collection_headers] + [
            format_model_for_sheet(c) for c in collections
        ]
        bulk_overwrite_sheet("Collection", collection_matrix)

        franchises = db.query(Franchise).all()
        franchise_headers = [c.name for c in Franchise.__table__.columns]
        franchise_matrix = [franchise_headers] + [
            format_model_for_sheet(f) for f in franchises
        ]
        bulk_overwrite_sheet("Franchise", franchise_matrix)

        series_entries = db.query(Series).all()
        series_headers = [c.name for c in Series.__table__.columns]
        series_matrix = [series_headers] + [
            format_model_for_sheet(s) for s in series_entries
        ]
        bulk_overwrite_sheet("Series", series_matrix)

        animes = db.query(Anime).all()
        anime_headers = [c.name for c in Anime.__table__.columns]
        anime_matrix = [anime_headers] + [format_model_for_sheet(a) for a in animes]
        bulk_overwrite_sheet("Anime", anime_matrix)

        anime_movies = db.query(AnimeMovies).all()
        anime_movie_headers = [c.name for c in AnimeMovies.__table__.columns]
        anime_movie_matrix = [anime_movie_headers] + [
            format_model_for_sheet(m) for m in anime_movies
        ]
        bulk_overwrite_sheet("Anime Movies", anime_movie_matrix)

        movie_entries = db.query(Movies).all()
        movie_headers = [c.name for c in Movies.__table__.columns]
        movie_matrix = [movie_headers] + [
            format_model_for_sheet(m) for m in movie_entries
        ]
        bulk_overwrite_sheet("Movies", movie_matrix)

        tv_show_entries = db.query(TVShows).all()
        tv_show_headers = [c.name for c in TVShows.__table__.columns]
        tv_show_matrix = [tv_show_headers] + [
            format_model_for_sheet(t) for t in tv_show_entries
        ]
        bulk_overwrite_sheet("TV Shows", tv_show_matrix)

        cartoon_entries = db.query(Cartoon).all()
        cartoon_headers = [c.name for c in Cartoon.__table__.columns]
        cartoon_matrix = [cartoon_headers] + [
            format_model_for_sheet(c) for c in cartoon_entries
        ]
        bulk_overwrite_sheet("Cartoons", cartoon_matrix)

        manga_entries = db.query(Manga).all()
        manga_headers = [c.name for c in Manga.__table__.columns]
        manga_matrix = [manga_headers] + [
            format_model_for_sheet(m) for m in manga_entries
        ]
        bulk_overwrite_sheet("Manga", manga_matrix)

        novel_entries = db.query(Novel).all()
        novel_headers = [c.name for c in Novel.__table__.columns]
        novel_matrix = [novel_headers] + [
            format_model_for_sheet(n) for n in novel_entries
        ]
        bulk_overwrite_sheet("Novel", novel_matrix)

        # Watch orders are written last: their items point at rows in every
        # media tab above, so dumping them afterwards keeps the sheet readable
        # in the same order Pull restores it.
        watch_order_lists = db.query(WatchOrderList).all()
        watch_order_list_headers = [
            c.name for c in WatchOrderList.__table__.columns
        ]
        watch_order_list_matrix = [watch_order_list_headers] + [
            format_model_for_sheet(w) for w in watch_order_lists
        ]
        bulk_overwrite_sheet("Watch Order List", watch_order_list_matrix)

        watch_order_items = db.query(WatchOrderItem).all()
        watch_order_item_headers = [
            c.name for c in WatchOrderItem.__table__.columns
        ]
        watch_order_item_matrix = [watch_order_item_headers] + [
            format_model_for_sheet(w) for w in watch_order_items
        ]
        bulk_overwrite_sheet("Watch Order Item", watch_order_item_matrix)

        # Relations come after every media tab for the same reason quotes do:
        # both endpoints are FK-less (media_type, entry_id) pairs, so on
        # restore the rows they point at must already exist.
        media_relations = db.query(MediaRelation).all()
        media_relation_headers = [
            c.name for c in MediaRelation.__table__.columns
        ]
        media_relation_matrix = [media_relation_headers] + [
            format_model_for_sheet(r) for r in media_relations
        ]
        bulk_overwrite_sheet("Media Relation", media_relation_matrix)

        # Quotes are written after every media tab: each row points at an entry
        # via a FK-less (media_type, entry_id) pair, so on restore those rows
        # must already exist.
        quotes = db.query(Quote).all()
        quote_headers = [c.name for c in Quote.__table__.columns]
        quote_matrix = [quote_headers] + [format_model_for_sheet(q) for q in quotes]
        bulk_overwrite_sheet("Quote", quote_matrix)

        # Memes are written after Quotes: a meme content line may name the
        # Quote it also is, so on restore those quotes must already exist.
        memes = db.query(Meme).all()
        meme_headers = [c.name for c in Meme.__table__.columns]
        meme_matrix = [meme_headers] + [format_model_for_sheet(m) for m in memes]
        bulk_overwrite_sheet("Meme", meme_matrix)

        # Notes point at owners the same FK-less way memes do, so they carry no
        # ordering constraint of their own.
        notes = db.query(Note).all()
        note_headers = [c.name for c in Note.__table__.columns]
        note_matrix = [note_headers] + [format_model_for_sheet(n) for n in notes]
        bulk_overwrite_sheet("Note", note_matrix)

        logger.info("Backup Pipeline completed successfully.")
        log_data_control(db, "Backup", "Backup", action_type, "Success")
        return {"status": "success", "message": "All tabs backed up to Google Sheets"}
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        log_data_control(
            db, "Backup", "Backup", action_type, "Failed", error_message=str(e)
        )
        raise e
