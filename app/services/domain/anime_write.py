"""
What an anime create/update does before its row is committed.

Anime is the one type whose write path is synchronous and internal: the
Tenrai autofill runs inside the request (ratings never forced), ep_previous
is re-derived for the affected franchise/series, and any seasonal bucket the
row now needs is created. The regular types instead run a post-commit write
hook (see registry.py `write_hook`).
"""

import logging

from sqlalchemy.orm import Session

from app.services.domain.derivation import derive_ep_previous_anime
from app.services.domain.post_processing import apply_single_replace_anime
from app.services.domain.seasonal import create_missing_seasonal

logger = logging.getLogger(__name__)


def prepare_anime_write(db: Session, anime) -> None:
    apply_single_replace_anime(db, anime, force_replace_ratings=False)
    db.flush()
    derive_ep_previous_anime(db, anime.franchise_id, anime.series_id)
    db.flush()
    try:
        create_missing_seasonal(db)
    except Exception as e:  # a missing seasonal bucket must not block the write
        logger.warning("Auto create seasonal failed: %s", e)
