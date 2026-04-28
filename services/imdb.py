from services.omdb import fetch_omdb_data
from services.tmdb import fetch_tmdb_data
import logging

logger = logging.getLogger(__name__)


def fetch_imdb_data(imdb_id: str) -> dict:
    """
    Orchestrates TMDB + OMDb fetches for a single IMDb ID.
    Both calls run regardless of individual failure.
    Returns {"tmdb_raw": ..., "omdb_raw": ...}.
    """
    tmdb_raw = None
    omdb_raw = None

    try:
        tmdb_raw = fetch_tmdb_data(imdb_id)
    except Exception as e:
        logger.error(f"fetch_imdb_data: TMDB fetch failed for IMDb ID {imdb_id}: {e}")

    try:
        omdb_raw = fetch_omdb_data(imdb_id)
    except Exception as e:
        logger.error(f"fetch_imdb_data: OMDb fetch failed for IMDb ID {imdb_id}: {e}")

    return {"tmdb_raw": tmdb_raw, "omdb_raw": omdb_raw}
