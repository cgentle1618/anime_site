"""Remark review query."""

import logging

from sqlalchemy.orm import Session

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Comic,
    Manga,
    Movies,
    Novel,
    TVShows,
)
from app.services.domain.watch_order import release_display

logger = logging.getLogger(__name__)


def find_all_remarks(db: Session) -> dict:
    """Returns all entries with a non-empty remark, grouped by media type."""

    def _query(model):
        return (
            db.query(model)
            .filter(model.remark.isnot(None), model.remark != "")
            .order_by(model.updated_at.desc())
            .all()
        )

    return {
        "anime": [
            {
                "system_id": str(e.system_id),
                "anime_name_cn": e.anime_name_cn,
                "anime_name_en": e.anime_name_en,
                "airing_type": e.airing_type,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(Anime)
        ],
        "anime_movie": [
            {
                "system_id": str(e.system_id),
                "anime_movie_name_cn": e.anime_movie_name_cn,
                "anime_movie_name_en": e.anime_movie_name_en,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(AnimeMovies)
        ],
        "movie": [
            {
                "system_id": str(e.system_id),
                "movie_name_cn": e.movie_name_cn,
                "movie_name_en": e.movie_name_en,
                "release_date": release_display(e, "movie"),
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(Movies)
        ],
        "tv_show": [
            {
                "system_id": str(e.system_id),
                "tv_name_cn": e.tv_name_cn,
                "tv_name_en": e.tv_name_en,
                "season_part": e.season_part,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(TVShows)
        ],
        "cartoon": [
            {
                "system_id": str(e.system_id),
                "cartoon_name_cn": e.cartoon_name_cn,
                "cartoon_name_en": e.cartoon_name_en,
                "airing_type": e.airing_type,
                "watching_status": e.watching_status,
                "remark": e.remark,
            }
            for e in _query(Cartoon)
        ],
        "manga": [
            {
                "system_id": str(e.system_id),
                "manga_name_cn": e.manga_name_cn,
                "manga_name_en": e.manga_name_en,
                "is_main": e.is_main,
                "reading_status": e.reading_status,
                "remark": e.remark,
            }
            for e in _query(Manga)
        ],
        "novel": [
            {
                "system_id": str(e.system_id),
                "novel_name_cn": e.novel_name_cn,
                "novel_name_en": e.novel_name_en,
                "is_main": e.is_main,
                "reading_status": e.reading_status,
                "remark": e.remark,
            }
            for e in _query(Novel)
        ],
        "comic": [
            {
                "system_id": str(e.system_id),
                # EN first: comic's display name falls back EN -> CN -> Alt,
                # and `volume_label` disambiguates two runs sharing a title.
                "comic_name_en": e.comic_name_en,
                "comic_name_cn": e.comic_name_cn,
                "volume_label": e.volume_label,
                "reading_status": e.reading_status,
                "remark": e.remark,
            }
            for e in _query(Comic)
        ],
    }
