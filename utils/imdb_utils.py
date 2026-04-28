import logging
from typing import Any, Dict, List, Optional

from utils.omdb_utils import map_omdb_to_movie_data
from utils.tmdb_utils import map_tmdb_to_movie_data

logger = logging.getLogger(__name__)


def map_imdb_to_movie_data(
    tmdb_raw: Optional[Dict[str, Any]], omdb_raw: Optional[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Merges TMDB and OMDb mapped data for a Movies entry.
    OMDb overwrites on key conflict (only imdb_rating overlaps).
    """
    merged: Dict[str, Any] = {}

    if tmdb_raw is not None:
        merged.update(map_tmdb_to_movie_data(tmdb_raw))

    if omdb_raw is not None:
        merged.update(map_omdb_to_movie_data(omdb_raw))

    return merged
