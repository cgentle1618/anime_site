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
    Note,
    Novel,
    TVShows,
)
from app.services.domain.watch_order import release_display

logger = logging.getLogger(__name__)


def find_all_remarks(db: Session, author_id=None) -> dict:
    """
    Every entry carrying a non-empty remark, grouped by media type.

    THE CALLER'S OWN remarks, not everybody's. `remark` is a personal-scope
    note and belongs to its author (decision 12); this is a review screen for
    the operator's own writing, and the response shape carries one remark per
    entry, which only has a meaning once a author is fixed. With a single
    account - the case this installation has been in all along - the answer is
    identical to the old one.

    author_id=None returns nothing rather than everything. There is no caller
    for whom "somebody's remarks, unspecified" is the right answer, and
    failing open here would publish every account's private assessments to a
    screen that used to show only one person's.

    The two-step query is not an oversight. `Model.remark` used to be a
    column_property and could be filtered in SQL; it is a plain per-request
    attribute now, so the ids come from `note` first and the entries second.
    """
    remarks: dict = {}
    if author_id is not None:
        for owner_id, content in db.query(Note.media_id, Note.content).filter(
            Note.section == "remark",
            Note.media_id.isnot(None),
            Note.author_id == author_id,
            Note.content.isnot(None),
            Note.content != "",
        ):
            remarks[owner_id] = content

    def _query(model):
        if not remarks:
            return []
        rows = (
            db.query(model)
            .filter(model.system_id.in_(list(remarks)))
            .order_by(model.updated_at.desc())
            .all()
        )
        for row in rows:
            row.remark = remarks.get(row.system_id)
        return rows

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
