"""
omdb_utils.py
Contains domain-specific logic to parse and transform raw JSON data from the
OMDb (Open Movie Database) API into the formats required by our database models.
Used solely to extract imdb_rating, which TMDB does not provide.
"""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# ==========================================
# DATA TRANSFORMERS
# ==========================================


def _convert_imdb_rating(rating_str: Optional[str]) -> Optional[str]:
    """Returns the rating string as-is, or None if missing or 'N/A'."""
    if not rating_str or rating_str.strip() == "N/A":
        return None
    return rating_str.strip()


# ==========================================
# MASTER ORCHESTRATORS
# ==========================================


def map_omdb_to_movie_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts OMDb fields relevant to the Movies model.
    """
    return {
        "imdb_rating": _convert_imdb_rating(raw_data.get("imdbRating")),
    }


def map_omdb_to_tv_data(raw_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extracts OMDb fields relevant to the TvShows and Cartoons models.
    """
    return {
        "imdb_rating": _convert_imdb_rating(raw_data.get("imdbRating")),
    }
