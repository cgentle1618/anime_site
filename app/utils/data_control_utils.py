"""
data_control_utils.py
Contains utility functions for the Data Control Logs.
"""

import logging
from typing import Any
from sqlalchemy.orm import Session

from app.models import Franchise, Series, DataControlLog, DeletedRecord

logger = logging.getLogger(__name__)


# ==========================================
# CENTRALIZED AUDIT LOGGING
# ==========================================


def log_data_control(
    db: Session,
    action_main: str,
    action_specific: str,
    action_type: str,
    status: str,
    rows_added: int = 0,
    rows_updated: int = 0,
    rows_deleted: int = 0,
    error_message: str = None,
    details_json: str = None,
):
    """
    Safely commits an audit trail entry for Data Control Pipelines.
    """
    try:
        log_entry = DataControlLog(
            action_main=action_main,
            action_specific=action_specific,
            type=action_type,
            status=status,
            rows_added=rows_added,
            rows_updated=rows_updated,
            rows_deleted=rows_deleted,
            error_message=error_message,
            details_json=details_json,
        )
        db.add(log_entry)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to save DataControlLog: {e}")
        db.rollback()


def log_deleted_record(db: Session, entry: Any, entry_type: str):
    """
    Intercepts an entry right before deletion and stages its metadata in the deleted_record table.
    NOTE: This does NOT call db.commit(). The parent router must commit the transaction
    so the log and the actual deletion succeed or fail together atomically.
    """
    try:

        def _cn(item, prefix):
            """CN fallback: CN → EN → Alt → roman → JP"""
            if not item:
                return None
            return (
                getattr(item, f"{prefix}_name_cn", None)
                or getattr(item, f"{prefix}_name_en", None)
                or getattr(item, f"{prefix}_name_alt", None)
                or getattr(item, f"{prefix}_name_roman", None)
                or getattr(item, f"{prefix}_name_jp", None)
            )

        def _en(item, prefix):
            """EN fallback: EN → roman → Alt → JP (never CN)"""
            if not item:
                return None
            return (
                getattr(item, f"{prefix}_name_en", None)
                or getattr(item, f"{prefix}_name_roman", None)
                or getattr(item, f"{prefix}_name_alt", None)
                or getattr(item, f"{prefix}_name_jp", None)
            )

        def _has_cn(item, prefix):
            return bool(getattr(item, f"{prefix}_name_cn", None))

        name_cn = None
        name_en = None
        franchise_cn = None
        franchise_type = None
        series_cn = None
        category = None

        if entry_type == "System Options":
            name_cn = getattr(entry, "option_value", None)
            category = getattr(entry, "category", None)

        elif entry_type == "Collection":
            name_cn = _cn(entry, "collection")
            if _has_cn(entry, "collection"):
                name_en = _en(entry, "collection")

        elif entry_type == "Franchise":
            name_cn = _cn(entry, "franchise")
            if _has_cn(entry, "franchise"):
                name_en = _en(entry, "franchise")
            franchise_type = getattr(entry, "franchise_type", None)

        elif entry_type == "Series":
            name_cn = _cn(entry, "series")
            if _has_cn(entry, "series"):
                name_en = _en(entry, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_cn = _cn(f, "franchise")

        elif entry_type == "Anime":
            name_cn = _cn(entry, "anime")
            if _has_cn(entry, "anime"):
                name_en = _en(entry, "anime")
            if getattr(entry, "series_id", None):
                s = db.query(Series).filter(Series.system_id == entry.series_id).first()
                series_cn = _cn(s, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_cn = _cn(f, "franchise")

        elif entry_type == "TV Show":
            name_cn = (
                getattr(entry, "tv_name_cn", None)
                or getattr(entry, "tv_name_en", None)
                or getattr(entry, "tv_name_alt", None)
            )
            name_en = getattr(entry, "tv_name_en", None) or getattr(
                entry, "tv_name_alt", None
            )
            if getattr(entry, "series_id", None):
                s = db.query(Series).filter(Series.system_id == entry.series_id).first()
                series_cn = _cn(s, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_cn = _cn(f, "franchise")
                franchise_type = getattr(f, "franchise_type", None)

        elif entry_type == "Movie":
            name_cn = (
                getattr(entry, "movie_name_cn", None)
                or getattr(entry, "movie_name_en", None)
                or getattr(entry, "movie_name_alt", None)
            )
            name_en = getattr(entry, "movie_name_en", None) or getattr(
                entry, "movie_name_alt", None
            )
            if getattr(entry, "series_id", None):
                s = db.query(Series).filter(Series.system_id == entry.series_id).first()
                series_cn = _cn(s, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_cn = _cn(f, "franchise")
                franchise_type = getattr(f, "franchise_type", None)

        elif entry_type == "Anime Movie":
            name_cn = _cn(entry, "anime_movie")
            if _has_cn(entry, "anime_movie"):
                name_en = _en(entry, "anime_movie")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_cn = _cn(f, "franchise")

        elif entry_type == "Cartoon":
            name_cn = _cn(entry, "cartoon")
            if _has_cn(entry, "cartoon"):
                name_en = _en(entry, "cartoon")
            if getattr(entry, "series_id", None):
                s = db.query(Series).filter(Series.system_id == entry.series_id).first()
                series_cn = _cn(s, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_cn = _cn(f, "franchise")

        elif entry_type == "Manga":
            name_cn = _cn(entry, "manga")
            if _has_cn(entry, "manga"):
                name_en = _en(entry, "manga")
            if getattr(entry, "series_id", None):
                s = db.query(Series).filter(Series.system_id == entry.series_id).first()
                series_cn = _cn(s, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_cn = _cn(f, "franchise")

        elif entry_type == "Novel":
            name_cn = _cn(entry, "novel")
            if _has_cn(entry, "novel"):
                name_en = _en(entry, "novel")
            if getattr(entry, "series_id", None):
                s = db.query(Series).filter(Series.system_id == entry.series_id).first()
                series_cn = _cn(s, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_cn = _cn(f, "franchise")

        deleted_log = DeletedRecord(
            type=entry_type,
            name_cn=name_cn,
            name_en=name_en,
            franchise_cn=franchise_cn,
            franchise_type=franchise_type,
            series_cn=series_cn,
            category=category,
        )

        db.add(deleted_log)
        logger.info(f"Staged deleted record log for {entry_type}: {name_cn}")

    except Exception as e:
        logger.error(f"Failed to stage deleted record log: {e}")
