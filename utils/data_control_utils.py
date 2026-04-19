"""
data_control_utils.py
Contains utility functions for the Data Control Logs.
"""

import logging
from typing import Any
from sqlalchemy.orm import Session

from models import Franchise, Series, DataControlLog, DeletedRecord


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
        franchise_name = None
        series_name = None
        anime_cn = None
        anime_en = None
        airing_type = None

        # Fallback Helper: CN -> EN -> Alt -> Romanji -> JP
        def get_cn_name(item, t):
            if not item:
                return None
            if t == "series":
                return (
                    getattr(item, f"{t}_name_cn")
                    or getattr(item, f"{t}_name_en")
                    or getattr(item, f"{t}_name_alt")
                )
            return (
                getattr(item, f"{t}_name_cn")
                or getattr(item, f"{t}_name_en")
                or getattr(item, f"{t}_name_alt")
                or getattr(item, f"{t}_name_romanji", None)
                or getattr(item, f"{t}_name_jp", None)
            )

        # Fallback Helper: EN -> Romanji -> CN -> Alt -> JP
        def get_en_name(item, t):
            if not item:
                return None
            if t == "series":
                return (
                    getattr(item, f"{t}_name_en")
                    or getattr(item, f"{t}_name_cn")
                    or getattr(item, f"{t}_name_alt")
                )
            return (
                getattr(item, f"{t}_name_en")
                or getattr(item, f"{t}_name_romanji", None)
                or getattr(item, f"{t}_name_cn")
                or getattr(item, f"{t}_name_alt")
                or getattr(item, f"{t}_name_jp", None)
            )

        if entry_type == "System Options":
            # Map category/value to CN/EN columns so it displays nicely in the UI
            anime_cn = getattr(entry, "category", None)
            anime_en = getattr(entry, "option_value", None)

        elif entry_type == "Franchise":
            franchise_name = get_cn_name(entry, "franchise")

        elif entry_type == "Series":
            series_name = get_cn_name(entry, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_name = get_cn_name(f, "franchise")

        elif entry_type == "Anime":
            anime_cn = get_cn_name(entry, "anime")
            anime_en = get_en_name(entry, "anime")
            airing_type = getattr(entry, "airing_type", None)

            if getattr(entry, "series_id", None):
                s = db.query(Series).filter(Series.system_id == entry.series_id).first()
                series_name = get_cn_name(s, "series")
            if getattr(entry, "franchise_id", None):
                f = (
                    db.query(Franchise)
                    .filter(Franchise.system_id == entry.franchise_id)
                    .first()
                )
                franchise_name = get_cn_name(f, "franchise")

        deleted_log = DeletedRecord(
            type=entry_type,
            franchise=franchise_name,
            series=series_name,
            anime_cn=anime_cn,
            anime_en=anime_en,
            airing_type=airing_type,
        )

        db.add(deleted_log)
        logger.info(
            f"Staged deleted record log for {entry_type}: {anime_cn or franchise_name or series_name}"
        )

    except Exception as e:
        logger.error(f"Failed to stage deleted record log: {e}")
