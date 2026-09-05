"""
What varies per media type in the Fill / Replace pipelines - and nothing else.

Read alongside runner.py: the runner owns the loop, the SSE messages, the
commit/rollback per entry, disconnect handling and audit logging; each spec
below only says which model to walk, how to tell an entry needs filling, which
external autofill to call, what to derive afterwards, and how long to pause
between external calls (Tenrai's public rate limit wants a second; TMDB/OMDb
do not).
"""

from sqlalchemy import or_

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Comic,
    Manga,
    Movies,
    Novel,
    Studio,
    TVShows,
)
from app.services.calculation import (
    run_sync_anime,
    run_sync_anime_movie,
    run_sync_cartoon,
    run_sync_comic,
    run_sync_manga,
    run_sync_novel,
    run_sync_tv_show,
)
from app.services.domain import (
    anime_movie_post_processing,
    anime_post_processing,
    apply_extract_comicvine_id,
    apply_extract_imdb_id,
    apply_extract_mal_id_anime,
    apply_extract_mal_id_manga_novel,
    apply_extract_mal_id_studio,
    apply_extract_novel_ids,
    apply_single_replace_anime,
    apply_single_replace_anime_movie,
    apply_single_replace_cartoon,
    apply_single_replace_manga,
    apply_single_replace_movie,
    apply_single_replace_novel,
    apply_single_replace_tv_show,
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
    autofill_cartoon_from_imdb,
    autofill_comic_from_comicvine,
    autofill_manga_from_mal,
    autofill_movie_from_imdb,
    autofill_novel_from_mal,
    autofill_novel_from_openlibrary,
    autofill_studio_from_mal,
    autofill_tv_show_from_imdb,
    cartoon_post_processing,
    derive_ep_previous_all_anime,
    has_missing_values_anime,
    has_missing_values_anime_movie,
    has_missing_values_cartoon,
    has_missing_values_comic,
    has_missing_values_manga,
    has_missing_values_movie,
    has_missing_values_novel,
    has_missing_values_novel_openlibrary,
    has_missing_values_studio,
    has_missing_values_tv_show,
    manga_post_processing,
    tv_show_post_processing,
)
from app.services.integrations.comicvine import comicvine_rate_limiter
from app.services.pipelines.runner import PipelineSpec

# Tenrai (MAL) asks for ~1 request/second from unauthenticated clients.
MAL_PAUSE = 1
COMICVINE_PAUSE = 1


def _linked(model, *columns):
    """Bulk Replace only re-fetches entries that already carry an external id/link."""
    return lambda db: db.query(model).filter(or_(*[c.isnot(None) for c in columns])).all()


PIPELINES: dict[str, PipelineSpec] = {
    "anime": PipelineSpec(
        key="anime", label="Anime", model=Anime,
        extract_id=apply_extract_mal_id_anime,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_anime(e),
        fill=lambda db, e: autofill_anime_from_mal(e, force_replace_ratings=True, db=db),
        fill_sleep=MAL_PAUSE,
        post_process=anime_post_processing,
        fill_after=(
            ("Deriving episode counts...", derive_ep_previous_all_anime),
            ("Syncing seasonal data...", run_sync_anime),
        ),
        replace_select=_linked(Anime, Anime.mal_id, Anime.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_anime(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(
            ("Deriving episode counts...", derive_ep_previous_all_anime),
            ("Syncing seasonal data...", run_sync_anime),
        ),
        single_after=(run_sync_anime,),
    ),
    "anime-movie": PipelineSpec(
        key="anime-movie", label="Anime Movie", model=AnimeMovies,
        extract_id=apply_extract_mal_id_anime,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_anime_movie(e),
        fill=lambda db, e: autofill_anime_movie_from_mal(e, force_replace_ratings=True, db=db),
        fill_sleep=MAL_PAUSE,
        post_process=anime_movie_post_processing,
        fill_after=(("Syncing system options...", run_sync_anime_movie),),
        replace_select=_linked(AnimeMovies, AnimeMovies.mal_id, AnimeMovies.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_anime_movie(db, e),
        replace_sleep=MAL_PAUSE,
        replace_after=(("Syncing system options...", run_sync_anime_movie),),
        single_after=(run_sync_anime_movie,),
    ),
    "movie": PipelineSpec(
        key="movie", label="Movie", model=Movies,
        extract_id=apply_extract_imdb_id,
        fill_eligible=has_missing_values_movie,
        fill=lambda db, e: autofill_movie_from_imdb(e, db),
        replace_select=_linked(Movies, Movies.imdb_id, Movies.imdb_link),
        replace=lambda db, e, bulk: apply_single_replace_movie(db, e, bulk=bulk),
    ),
    "tv-show": PipelineSpec(
        key="tv-show", label="TV Show", model=TVShows,
        extract_id=apply_extract_imdb_id,
        fill_eligible=lambda db, e: has_missing_values_tv_show(e),
        fill=lambda db, e: autofill_tv_show_from_imdb(e, db),
        post_process=tv_show_post_processing,
        fill_after=(("Syncing system options...", run_sync_tv_show),),
        replace_select=_linked(TVShows, TVShows.imdb_id, TVShows.imdb_link),
        replace=lambda db, e, bulk: apply_single_replace_tv_show(db, e, bulk=bulk),
        replace_after=(("Syncing system options...", run_sync_tv_show),),
    ),
    "cartoon": PipelineSpec(
        key="cartoon", label="Cartoon", model=Cartoon,
        extract_id=apply_extract_imdb_id,
        # Only TV and Movie cartoons have a TMDB/OMDb record to fetch.
        fill_eligible=lambda db, e: e.airing_type in {"Movie", "TV"} and has_missing_values_cartoon(e),
        fill=lambda db, e: autofill_cartoon_from_imdb(e, db),
        post_process=cartoon_post_processing,
        fill_after=(("Syncing system options...", run_sync_cartoon),),
        replace_select=lambda db: db.query(Cartoon).filter(
            Cartoon.airing_type.in_(["Movie", "TV"]),
            or_(Cartoon.imdb_id.isnot(None), Cartoon.imdb_link.isnot(None)),
        ).all(),
        replace=lambda db, e, bulk: apply_single_replace_cartoon(db, e, bulk=bulk),
        replace_after=(("Syncing system options...", run_sync_cartoon),),
        single_after=(run_sync_cartoon,),
    ),
    "manga": PipelineSpec(
        key="manga", label="Manga", model=Manga,
        extract_id=apply_extract_mal_id_manga_novel,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_manga(e),
        fill=lambda db, e: autofill_manga_from_mal(e, force_replace_ratings=True),
        fill_sleep=MAL_PAUSE,
        post_process=manga_post_processing,
        fill_after=(("Syncing system options...", run_sync_manga),),
        replace_select=_linked(Manga, Manga.mal_id, Manga.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_manga(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(("Syncing system options...", run_sync_manga),),
        single_after=(run_sync_manga,),
    ),
    "novel": PipelineSpec(
        key="novel", label="Novel", model=Novel,
        # Novel is the one type with two sources, so both extractors run.
        extract_id=apply_extract_novel_ids,
        # A mal_link means Tenrai, which returns strictly more. Open Library
        # covers only the novels MAL does not have. The `not e.mal_link`
        # guard on the second branch keeps eligibility identical to the
        # routing below: without it, a MAL-complete novel with no author
        # credit would be eligible forever and never progress. Both branches
        # test mal_link (and openlibrary_id) truthily, matching `fill`'s
        # routing and the autofill's own guard, so an empty string can't
        # disagree between them the way it would under an `is not None`
        # check.
        fill_eligible=lambda db, e: bool(
            (e.mal_link and has_missing_values_novel(e))
            or (
                not e.mal_link
                and e.openlibrary_id
                and has_missing_values_novel_openlibrary(db, e)
            )
        ),
        fill=lambda db, e: (
            autofill_novel_from_mal(e, force_replace_ratings=True)
            if e.mal_link
            else autofill_novel_from_openlibrary(e, db)
        ),
        fill_sleep=MAL_PAUSE,
        fill_after=(("Syncing system options...", run_sync_novel),),
        replace_select=_linked(Novel, Novel.mal_id, Novel.mal_link),
        replace=lambda db, e, bulk: apply_single_replace_novel(db, e, bulk=bulk),
        replace_sleep=MAL_PAUSE,
        replace_after=(("Syncing system options...", run_sync_novel),),
        single_after=(run_sync_novel,),
    ),
    "comic": PipelineSpec(
        key="comic", label="Comic", model=Comic,
        extract_id=apply_extract_comicvine_id,
        fill_eligible=lambda db, e: e.comicvine_id is not None and has_missing_values_comic(db, e),
        fill=lambda db, e: autofill_comic_from_comicvine(e, db),
        fill_sleep=COMICVINE_PAUSE,
        fill_after=(("Syncing system options...", run_sync_comic),),
        # ~200 requests/hour: stop when the budget is gone rather than block.
        budget=comicvine_rate_limiter.has_capacity,
        # Fill Comic is run on its own, never inside Fill All (quota), and there
        # is no bulk Replace: the single-entry hook only re-syncs options.
        in_fill_all=False,
        replace_select=None,
        replace=None,
        single_after=(run_sync_comic,),
        in_replace_all=False,
    ),
    "studio": PipelineSpec(
        key="studio", label="Studio", model=Studio,
        # Not a media entry: nothing to post-process and nothing to sync
        # afterwards. It does have an id to derive - a producer URL is
        # /anime/producer/<id>/<slug>, which needs its own pattern.
        extract_id=apply_extract_mal_id_studio,
        fill_eligible=lambda db, e: e.mal_id is not None and has_missing_values_studio(e),
        fill=lambda db, e: autofill_studio_from_mal(e),
        fill_sleep=MAL_PAUSE,
        fill_only=True,
        in_replace_all=False,
    ),
}

FILL_ALL = [s for s in PIPELINES.values() if s.in_fill_all]
REPLACE_ALL = [s for s in PIPELINES.values() if s.in_replace_all]
