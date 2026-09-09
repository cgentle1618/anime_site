"""
calculation.py
On-demand bulk calculate and fix operations.
Wraps single-entry logic from services.domain for bulk application across the DB.
"""

from typing import Optional

from sqlalchemy.orm import Session, selectinload

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Character,
    CharacterCasting,
    Comic,
    Game,
    Manga,
    Media,
    Movies,
    Novel,
    Person,
    Publisher,
    Studio,
    TVShows,
)
from app.services.domain import (
    anime_movie_post_processing,
    anime_post_processing,
    autofill_anime_from_mal,
    autofill_anime_movie_from_mal,
    autofill_cartoon_from_imdb,
    autofill_comic_from_comicvine,
    autofill_game_from_igdb,
    autofill_manga_from_mal,
    autofill_movie_from_imdb,
    autofill_novel_from_mal,
    autofill_tv_show_from_imdb,
    cartoon_post_processing,
    create_missing_seasonal,
    derive_ep_previous_all_anime,
    derive_novel_catalog,
    derive_novel_list,
    extract_system_options,
    manga_post_processing,
    sync_seasonal_counts,
    tv_show_post_processing,
)
from app.services.domain.plan_next import derive_size_groups
from app.services.domain.user_list import acting_user_id, list_row
from app.services.integrations.image_manager import (
    cover_image_exists,
    cover_key,
    list_all_cover_images,
)
from app.utils.data_control_utils import log_data_control
from app.utils.tenrai_utils import ALLOWED_AIRING_TYPES

# Every table that owns a stored image, as (owner_type, model, column). The
# owner_type is the folder its images live in - see image_manager.cover_key.
# The four entity tables belong here as much as the media ones: their portraits
# and logos share the same storage, and leaving them out of the orphan scan
# reported every one of them as unreferenced.
# The nine media types collapse into one row: their covers live on `media`, and
# `media.media_type` IS the folder name, so one query answers for all nine
# where there used to be nine. owner_type None means "read it from the row".
COVER_OWNER_TABLES: tuple[tuple[str | None, type, str], ...] = (
    (None, Media, "cover_image_file"),
    ("staff", Person, "photo_file"),
    ("character", Character, "photo_file"),
    ("publisher", Publisher, "logo_file"),
    ("studio", Studio, "logo_file"),
)


# ==========================================
# BULK ACTIONS
# ==========================================


def bulk_check_unused_cover_images(db: Session) -> dict:
    """
    Compare what is in storage against what the database references.

    A file is `should_use` when a row with that id exists but has not recorded
    the image, and `orphaned` only when no row owns it at all - orphaned files
    are what the delete action removes, so every table that owns images must be
    scanned here or its images are deleted as strays.
    """
    all_files = set(list_all_cover_images())

    referenced: set[str] = set()
    owned: dict[str, object] = {}
    for owner_type, model, column in COVER_OWNER_TABLES:
        col = getattr(model, column)
        referenced |= {
            row[0] for row in db.query(col).filter(col.isnot(None)).all()
        }
        for row in db.query(model).all():
            folder = owner_type if owner_type is not None else row.media_type
            owned[cover_key(folder, str(row.system_id))] = row

    # A casting may override a character's portrait with its own photo. It has
    # no folder of its own - the file sits among the character images - so it
    # only needs to count as referenced.
    referenced |= {
        row[0]
        for row in db.query(CharacterCasting.photo_file)
        .filter(CharacterCasting.photo_file.isnot(None))
        .all()
    }

    should_use = []
    orphaned = []
    for key in sorted(all_files - referenced):
        row = owned.get(key)
        if row is not None:
            system_id = str(row.system_id)
            should_use.append(
                {"system_id": system_id, "name": row.display_name or system_id}
            )
        else:
            orphaned.append(key)

    return {
        "status": "success",
        "total_in_storage": len(all_files),
        "should_use": should_use,
        "should_use_count": len(should_use),
        "orphaned": orphaned,
        "orphaned_count": len(orphaned),
    }


def bulk_check_cover_image(db: Session, entry_type: Optional[str] = None) -> dict:
    unused_result = bulk_check_unused_cover_images(db)

    missing = []

    query = db.query(Anime).join(Anime.media_row).filter(Media.cover_image_file.isnot(None))
    if entry_type:
        query = query.filter(Anime.airing_type == entry_type)
    animes = query.all()
    for anime in animes:
        if not cover_image_exists("anime", str(anime.system_id)):
            missing.append(
                {
                    "system_id": str(anime.system_id),
                    "name": anime.display_name or str(anime.system_id),
                    "entry_type": anime.airing_type,
                }
            )

    if not entry_type:
        anime_movies = (
            db.query(AnimeMovies).join(AnimeMovies.media_row).filter(Media.cover_image_file.isnot(None)).all()
        )
        for am in anime_movies:
            if not cover_image_exists("anime-movie", str(am.system_id)):
                missing.append(
                    {
                        "system_id": str(am.system_id),
                        "name": am.display_name or str(am.system_id),
                        "entry_type": "anime_movie",
                    }
                )

        cartoons = db.query(Cartoon).join(Cartoon.media_row).filter(Media.cover_image_file.isnot(None)).all()
        for c in cartoons:
            if not cover_image_exists("cartoon", str(c.system_id)):
                missing.append(
                    {
                        "system_id": str(c.system_id),
                        "name": c.display_name or str(c.system_id),
                        "entry_type": "cartoon",
                    }
                )

        movies = db.query(Movies).join(Movies.media_row).filter(Media.cover_image_file.isnot(None)).all()
        for m in movies:
            if not cover_image_exists("movie", str(m.system_id)):
                missing.append(
                    {
                        "system_id": str(m.system_id),
                        "name": m.display_name or str(m.system_id),
                        "entry_type": "movie",
                    }
                )

        tv_shows = db.query(TVShows).join(TVShows.media_row).filter(Media.cover_image_file.isnot(None)).all()
        for t in tv_shows:
            if not cover_image_exists("tv-show", str(t.system_id)):
                missing.append(
                    {
                        "system_id": str(t.system_id),
                        "name": t.display_name or str(t.system_id),
                        "entry_type": "tv_show",
                    }
                )

        mangas = db.query(Manga).join(Manga.media_row).filter(Media.cover_image_file.isnot(None)).all()
        for mg in mangas:
            if not cover_image_exists("manga", str(mg.system_id)):
                missing.append(
                    {
                        "system_id": str(mg.system_id),
                        "name": mg.display_name or str(mg.system_id),
                        "entry_type": "manga",
                    }
                )

        novels = db.query(Novel).join(Novel.media_row).filter(Media.cover_image_file.isnot(None)).all()
        for nv in novels:
            if not cover_image_exists("novel", str(nv.system_id)):
                missing.append(
                    {
                        "system_id": str(nv.system_id),
                        "name": nv.display_name or str(nv.system_id),
                        "entry_type": "novel",
                    }
                )

        games = db.query(Game).join(Game.media_row).filter(Media.cover_image_file.isnot(None)).all()
        for gm in games:
            if not cover_image_exists("game", str(gm.system_id)):
                missing.append(
                    {
                        "system_id": str(gm.system_id),
                        "name": gm.display_name or str(gm.system_id),
                        "entry_type": "game",
                    }
                )

        comics = db.query(Comic).join(Comic.media_row).filter(Media.cover_image_file.isnot(None)).all()
        for cm in comics:
            if not cover_image_exists("comic", str(cm.system_id)):
                missing.append(
                    {
                        "system_id": str(cm.system_id),
                        "name": cm.display_name or str(cm.system_id),
                        "entry_type": "comic",
                    }
                )

    total_checked = len(animes) + (
        0
        if entry_type
        else len(anime_movies)
        + len(cartoons)
        + len(movies)
        + len(tv_shows)
        + len(mangas)
        + len(novels)
        + len(comics)
        + len(games)
    )
    return {
        "status": "success",
        "total_checked": total_checked,
        "missing_count": len(missing),
        "missing": missing,
        "entry_type": entry_type,
        "should_use": unused_result["should_use"],
        "should_use_count": unused_result["should_use_count"],
        "orphaned": unused_result["orphaned"],
        "orphaned_count": unused_result["orphaned_count"],
    }


def bulk_set_cover_image_fields(db: Session) -> dict:
    """
    Record the stored image on rows whose column is NULL but whose file exists.

    Covers only: the entity tables in COVER_OWNER_TABLES store their image in
    photo_file / logo_file, which this does not stamp.
    """
    updated = 0
    for owner_type, model, column in COVER_OWNER_TABLES:
        if column != "cover_image_file":
            continue
        col = getattr(model, column)
        for entry in db.query(model).filter(col.is_(None)).all():
            sid = str(entry.system_id)
            folder = owner_type if owner_type is not None else entry.media_type
            if cover_image_exists(folder, sid):
                entry.cover_image_file = cover_key(folder, sid)
                updated += 1
    if updated:
        db.commit()
    return {"status": "success", "updated_count": updated}


def bulk_delete_orphaned_cover_images(db: Session) -> dict:
    from app.services.integrations.image_manager import delete_cover_image

    unused_result = bulk_check_unused_cover_images(db)
    orphaned = unused_result["orphaned"]
    for key in orphaned:
        owner_type, _, filename = key.partition("/")
        stem = filename[:-4] if filename.endswith(".jpg") else filename
        delete_cover_image(owner_type, stem)
    return {"status": "success", "deleted_count": len(orphaned)}


def bulk_download_missing_covers(
    db: Session, system_ids: Optional[list[str]] = None
) -> dict:
    downloaded = 0
    skipped = 0
    total = 0

    def _collect(query, model, owner_type):
        if system_ids is not None:
            query = query.filter(model.system_id.in_(system_ids))
        return [
            e
            for e in query.all()
            if not cover_image_exists(owner_type, str(e.system_id))
        ]

    anime_query = db.query(Anime).join(Anime.media_row).filter(Media.cover_image_file.isnot(None))
    for anime in _collect(anime_query, Anime, "anime"):
        total += 1
        if anime.airing_type in ALLOWED_AIRING_TYPES:
            anime.cover_image_file = None
            autofill_anime_from_mal(anime, force_replace_ratings=False, db=db)
            if anime.cover_image_file:
                downloaded += 1
        else:
            skipped += 1

    am_query = db.query(AnimeMovies).join(AnimeMovies.media_row).filter(Media.cover_image_file.isnot(None))
    for am in _collect(am_query, AnimeMovies, "anime-movie"):
        total += 1
        am.cover_image_file = None
        autofill_anime_movie_from_mal(am, force_replace_ratings=False, db=db)
        if am.cover_image_file:
            downloaded += 1

    movie_query = db.query(Movies).join(Movies.media_row).filter(Media.cover_image_file.isnot(None))
    for movie in _collect(movie_query, Movies, "movie"):
        total += 1
        movie.cover_image_file = None
        autofill_movie_from_imdb(movie, db)
        if movie.cover_image_file:
            downloaded += 1

    tv_query = db.query(TVShows).join(TVShows.media_row).filter(Media.cover_image_file.isnot(None))
    for tv in _collect(tv_query, TVShows, "tv-show"):
        total += 1
        tv.cover_image_file = None
        autofill_tv_show_from_imdb(tv, db)
        if tv.cover_image_file:
            downloaded += 1

    cartoon_query = db.query(Cartoon).join(Cartoon.media_row).filter(Media.cover_image_file.isnot(None))
    for cartoon in _collect(cartoon_query, Cartoon, "cartoon"):
        total += 1
        cartoon.cover_image_file = None
        autofill_cartoon_from_imdb(cartoon, db)
        if cartoon.cover_image_file:
            downloaded += 1

    manga_query = db.query(Manga).join(Manga.media_row).filter(Media.cover_image_file.isnot(None))
    for manga in _collect(manga_query, Manga, "manga"):
        total += 1
        manga.cover_image_file = None
        autofill_manga_from_mal(manga, force_replace_ratings=False)
        if manga.cover_image_file:
            downloaded += 1

    novel_query = db.query(Novel).join(Novel.media_row).filter(Media.cover_image_file.isnot(None))
    for novel in _collect(novel_query, Novel, "novel"):
        total += 1
        if novel.mal_link:
            novel.cover_image_file = None
            autofill_novel_from_mal(novel, force_replace_ratings=False)
            if novel.cover_image_file:
                downloaded += 1
        else:
            skipped += 1

    comic_query = db.query(Comic).join(Comic.media_row).filter(Media.cover_image_file.isnot(None))
    for comic in _collect(comic_query, Comic, "comic"):
        total += 1
        if comic.comicvine_id:
            comic.cover_image_file = None
            autofill_comic_from_comicvine(comic, db)
            if comic.cover_image_file:
                downloaded += 1
        else:
            skipped += 1

    game_query = db.query(Game).join(Game.media_row).filter(Media.cover_image_file.isnot(None))
    for game in _collect(game_query, Game, "game"):
        total += 1
        if game.igdb_id:
            game.cover_image_file = None
            autofill_game_from_igdb(game, db)
            if game.cover_image_file:
                downloaded += 1
        else:
            skipped += 1

    if total:
        db.commit()
    parts = [f"Downloaded {downloaded} of {total} missing cover images."]
    if skipped:
        parts.append(f"{skipped} skipped (no external source on the entry).")
    return {"status": "success", "message": " ".join(parts)}


# ==========================================
# COMPOSITE LOGICS
# ==========================================


def run_post_processing(db: Session) -> dict:
    animes = db.query(Anime).all()
    for anime in animes:
        anime_post_processing(anime, db)
    db.commit()

    movies = db.query(AnimeMovies).all()
    for movie in movies:
        anime_movie_post_processing(movie, db)
    db.commit()

    shows = db.query(TVShows).all()
    for show in shows:
        tv_show_post_processing(show, db)
    db.commit()

    cartoons = db.query(Cartoon).all()
    for cartoon in cartoons:
        cartoon_post_processing(cartoon, db)
    db.commit()

    manga = db.query(Manga).all()
    for manga_entry in manga:
        manga_post_processing(manga_entry, db)
    db.commit()

    return {
        "status": "success",
        "message": f"Post-processed {len(animes)} anime, {len(movies)} anime movies, {len(shows)} TV show entries, and {len(cartoons)} cartoon entries.",
    }


def run_derive_ep_previous(db: Session) -> dict:
    """Anime only: it is the one type with a franchise-wide derived field left.

    TV shows and cartoons had a step here too, but watch order was all it
    assigned, and that moved to watch_order_list where it is curated by hand.
    """
    derive_ep_previous_all_anime(db)
    return {
        "status": "success",
        "message": "Derived ep_previous for all acg franchises.",
    }


def run_sync(db: Session) -> dict:
    run_sync_anime(db)
    run_sync_anime_movie(db)
    run_sync_tv_show(db)
    run_sync_cartoon(db)
    run_sync_manga(db)
    run_sync_novel(db)
    run_sync_comic(db)
    run_sync_size_groups(db)
    return {
        "status": "success",
        "message": "All synchronization tasks completed.",
    }


def run_sync_size_groups(db: Session) -> dict:
    changed = derive_size_groups(db)
    db.commit()
    return {
        "status": "success",
        "message": f"Size groups derived for {changed} group(s).",
    }


def run_sync_cartoon(db: Session) -> dict:
    # extract_system_options is not type-filtered - it scans every
    # media_tag row - but it is called here (and from each sibling
    # run_sync_* below) to preserve the "runs on every entry save" behavior
    # these wrappers had before the six per-type extractors collapsed into
    # one: Fill and Replace call these wrappers individually per entry,
    # never the aggregate run_sync() below.
    extract_system_options(db)
    return {
        "status": "success",
        "message": "Cartoon sync completed.",
    }


def run_sync_anime(db: Session) -> dict:
    create_missing_seasonal(db)
    sync_seasonal_counts(db)
    extract_system_options(db)
    return {
        "status": "success",
        "message": "Missing seasonals created, seasonal counts synced.",
    }


def run_sync_anime_movie(db: Session) -> dict:
    extract_system_options(db)
    return {
        "status": "success",
        "message": "Anime movie sync completed.",
    }


def run_sync_tv_show(db: Session) -> dict:
    extract_system_options(db)
    return {
        "status": "success",
        "message": "TV show sync completed.",
    }


def run_sync_manga(db: Session) -> dict:
    extract_system_options(db)
    return {
        "status": "success",
        "message": "Manga sync completed.",
    }


def run_sync_novel(db: Session) -> dict:
    extract_system_options(db)
    # Re-derive from the unit rows so a Sheets restore, which writes rows
    # straight to the tables without going through the router, lands with
    # consistent totals.
    for entry in db.query(Novel).options(selectinload(Novel.units)).all():
        derive_novel_catalog(entry)
        # The reader's half only exists if they have a list row; Calculate
        # must not mint one for an entry nobody has touched.
        row = list_row(db, acting_user_id(db, None), entry.system_id)
        if row is not None:
            derive_novel_list(row, entry)
    db.commit()
    return {
        "status": "success",
        "message": "Novel sync completed.",
    }


def run_sync_comic(db: Session) -> dict:
    extract_system_options(db)
    return {
        "status": "success",
        "message": "Comic sync completed.",
    }


def run_sync_game(db: Session) -> dict:
    extract_system_options(db)
    return {
        "status": "success",
        "message": "Game sync completed.",
    }


def run_calculate_all(db: Session) -> dict:
    try:
        run_post_processing(db)
        run_derive_ep_previous(db)
        run_sync(db)
        bulk_check_cover_image(db)
        log_data_control(db, "Calculate", "Calculate All", "Manual", "Success")
        return {"status": "success", "message": "Full calculation complete."}
    except Exception as e:
        log_data_control(
            db, "Calculate", "Calculate All", "Manual", "Failed", error_message=str(e)
        )
        raise
