"""Backup pipeline: dump the database to Google Sheets."""

import logging

from sqlalchemy.orm import Session

from app.services.domain.credits import sheet_link_headers, sheet_link_rows
from app.services.integrations.sheets import bulk_overwrite_sheet
from app.services.pipelines.tabs import SHEET_TABS
from app.utils.data_control_utils import log_data_control
from app.utils.formatter import (
    format_model_for_sheet,
)

logger = logging.getLogger(__name__)


def execute_backup(db: Session, action_type: str = "Manual") -> dict:
    """
    Retrieves the entire PostgreSQL database and permanently overwrites
    the target tabs in Google Sheets dynamically based on the DB schema.
    """
    logger.info(f"Starting Google Sheets Backup Pipeline ({action_type})...")

    try:
        # One block per tab, driven by the registry Pull restores from, so the
        # two can never disagree about a tab's name, columns or order. Entry
        # tabs append their credit/tag columns AFTER the plain model columns
        # (Pull matches by header NAME, never position - see
        # credit_roles.LEGACY_SHEET_COLUMN for why the headers never change).
        for tab in SHEET_TABS:
            rows = db.query(tab.model).all()
            headers = [c.name for c in tab.model.__table__.columns]
            matrix = [format_model_for_sheet(r) for r in rows]
            if tab.media_type:
                headers += sheet_link_headers(tab.media_type)
                for row, links in zip(matrix, sheet_link_rows(db, tab.media_type, rows)):
                    row.extend(links)
            bulk_overwrite_sheet(tab.name, [headers] + matrix)

        logger.info("Backup Pipeline completed successfully.")
        log_data_control(db, "Backup", "Backup", action_type, "Success")
        return {"status": "success", "message": "All tabs backed up to Google Sheets"}
    except Exception as e:
        logger.error(f"Backup failed: {e}")
        log_data_control(
            db, "Backup", "Backup", action_type, "Failed", error_message=str(e)
        )
        raise e
