"""Missing-value checks and episode/volume/chapter math validation."""

import logging
from typing import Union

from sqlalchemy.orm import Session

from app.models import (
    Anime,
    AnimeMovies,
    Cartoon,
    Comic,
    Manga,
    Novel,
    Person,
    Publisher,
    Studio,
    TVShows,
)
from app.utils.utils import (
    ANIME_FIELDS_TO_FILL,
    ANIME_MOVIE_FIELDS_TO_FILL,
    CARTOON_MOVIE_FIELDS_TO_FILL,
    CARTOON_TV_FIELDS_TO_FILL,
    COMIC_FIELDS_TO_FILL,
    COMIC_LINK_FIELDS_TO_FILL,
    GAME_FIELDS_TO_FILL,
    MANGA_FIELDS_TO_FILL,
    MOVIE_FIELDS_TO_FILL,
    MOVIE_LINK_FIELDS_TO_FILL,
    NOVEL_FIELDS_TO_FILL,
    NOVEL_OPENLIBRARY_FIELDS_TO_FILL,
    NOVEL_OPENLIBRARY_LINK_FIELDS_TO_FILL,
    STUDIO_FIELDS_TO_FILL,
    TV_SHOW_FIELDS_TO_FILL,
    validate_ch_math,
    validate_episode_math,
    validate_vol_math,
)

logger = logging.getLogger(__name__)


def apply_validate_episode_math(entry: Union[Anime, TVShows, Cartoon]) -> bool:
    """
    Clamps ep_total to a sane value. Returns True if it changed.

    The episode count a viewer has reached used to be clamped alongside it,
    back when both lived on this row. It is on user_media_list now and belongs
    to whoever is watching, so this function - which runs inside Fill and
    Replace - may not touch it. A None second argument is what
    validate_episode_math already reads as "no progress".
    """
    ep_total = getattr(entry, "ep_total", None)
    if ep_total is None:
        return False
    safe_total, _ = validate_episode_math(ep_total, None)
    if ep_total != safe_total:
        entry.ep_total = safe_total
        return True
    return False


def apply_validate_vol_math(manga: Manga) -> bool:
    """
    Clamps vol_total to a sane value. Returns True if it changed.

    vol_fin used to be clamped alongside it, back when both lived on this row.
    It is now on user_media_list and belongs to whoever is reading, so this
    function - which runs inside Fill and Replace - may not touch it. A None
    second argument is what validate_vol_math already treats as "no progress".
    """
    safe_total, _ = validate_vol_math(manga.vol_total, None)
    if manga.vol_total != safe_total:
        manga.vol_total = safe_total
        return True
    return False


def apply_validate_ch_math(manga: Manga) -> bool:
    """Clamps ch_total. See apply_validate_vol_math for why ch_fin is gone."""
    safe_total, _ = validate_ch_math(manga.ch_total, None)
    if manga.ch_total != safe_total:
        manga.ch_total = safe_total
        return True
    return False


def has_missing_values_anime(anime: Anime) -> bool:
    """
    Evaluates an anime entry against the ANIME_FIELDS_TO_FILL list.
    Returns True if any required fields are missing, False if fully populated.

    Business Rules:
    1. If 'Not Yet Aired', ignores missing mal_rating and mal_rank.
    2. Detects missing 'ep_previous' ONLY if it meets specific Execution Conditions.
    """
    missing_fields = []

    for field in ANIME_FIELDS_TO_FILL:
        val = getattr(anime, field, None)
        if val is None or str(val).strip() == "":
            missing_fields.append(field)

    # Exception Rule: "Not Yet Aired" entries don't have ratings/ranks yet
    if anime.airing_status == "Not Yet Aired":
        missing_fields = [
            f for f in missing_fields if f not in ("mal_rating", "mal_rank")
        ]

    # Clean out ep_previous if it was caught by the general loop
    if "ep_previous" in missing_fields:
        missing_fields.remove("ep_previous")

    # Custom Execution Condition for ep_previous
    if anime.ep_previous is None:
        is_tv_or_ona = anime.airing_type in ["TV", "ONA"]
        no_ep_special = anime.ep_special is None
        has_season = bool(anime.season_part and str(anime.season_part).strip())

        if is_tv_or_ona and no_ep_special and has_season:
            missing_fields.append("ep_previous")

    return len(missing_fields) > 0


def has_missing_values_anime_movie(anime_movie: AnimeMovies) -> bool:
    """
    Returns True if any required field is blank.
    Skips mal_rating and mal_rank for 'Not Yet Aired' entries.
    """
    missing = []
    for field in ANIME_MOVIE_FIELDS_TO_FILL:
        val = getattr(anime_movie, field, None)
        if val is None or str(val).strip() == "":
            missing.append(field)

    if anime_movie.airing_status == "Not Yet Aired":
        missing = [f for f in missing if f not in ("mal_rating", "mal_rank")]

    return len(missing) > 0


def _link_missing(db, media_type, entry_id, link_fields) -> bool:
    """True if any (kind, key) link pair has no rows for this entry."""
    from app.services.domain.credits import credit_names, tag_values

    for kind, key in link_fields:
        values = (
            credit_names(db, entry_id, key)
            if kind == "credit"
            else tag_values(db, entry_id, key)
        )
        if not values:
            return True
    return False


def has_missing_values_movie(db, movie) -> bool:
    """Returns True if any required Movies column or link (director) is missing."""
    for field in MOVIE_FIELDS_TO_FILL:
        val = getattr(movie, field, None)
        if val is None or str(val).strip() == "":
            return True
    return _link_missing(db, "movie", movie.system_id, MOVIE_LINK_FIELDS_TO_FILL)


def has_missing_values_tv_show(tv_show: TVShows) -> bool:
    """Returns True if any required TVShows field is missing."""
    for field in TV_SHOW_FIELDS_TO_FILL:
        val = getattr(tv_show, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_cartoon(cartoon: Cartoon) -> bool:
    """Returns True if any required Cartoon field is missing."""
    fields = (
        CARTOON_MOVIE_FIELDS_TO_FILL
        if cartoon.airing_type == "Movie"
        else CARTOON_TV_FIELDS_TO_FILL
    )
    for field in fields:
        val = getattr(cartoon, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_manga(manga: Manga) -> bool:
    """
    Returns True if any required fill field is blank.
    Special case: vol_total and ch_total are only required when serialization_status == "完結".
    """
    for field in MANGA_FIELDS_TO_FILL:
        val = getattr(manga, field, None)
        if val is None or str(val).strip() == "":
            return True

    if manga.serialization_status == "完結":
        if manga.vol_total is None and manga.ch_total is None:
            return True

    return False


def has_missing_values_novel(novel: Novel) -> bool:
    """
    Returns True if any required fill field is blank.
    Special case: vol_total_original and ch_total are only required when serialization_status == "完結".
    Gate: if mal_link is null, returns False (skip entirely — no MAL data source available).
    """
    if novel.mal_link is None:
        return False

    for field in NOVEL_FIELDS_TO_FILL:
        val = getattr(novel, field, None)
        if val is None or str(val).strip() == "":
            return True

    if novel.serialization_status == "完結":
        if novel.vol_total_original is None and novel.ch_total is None:
            return True

    return False


def has_missing_values_novel_openlibrary(db, novel: Novel) -> bool:
    """
    Returns True if anything Open Library can supply is still blank: the
    release date, the cover, or the author credit.

    Narrower than has_missing_values_novel on purpose — see
    NOVEL_OPENLIBRARY_FIELDS_TO_FILL. There is no mal_link gate here: the
    caller decides which source an entry belongs to.
    """
    for field in NOVEL_OPENLIBRARY_FIELDS_TO_FILL:
        val = getattr(novel, field, None)
        if val is None or str(val).strip() == "":
            return True

    return _link_missing(
        db, "novel", novel.system_id, NOVEL_OPENLIBRARY_LINK_FIELDS_TO_FILL
    )


def has_missing_values_comic(db, comic: Comic) -> bool:
    """
    Returns True if any Comic Vine-fillable column or link is blank.
    Columns come from COMIC_FIELDS_TO_FILL; writer/artist and publisher
    credits from COMIC_LINK_FIELDS_TO_FILL. Imprint, continuity, era, events
    and end_date are manual classifications Comic Vine does not model and are
    never required.
    """
    for field in COMIC_FIELDS_TO_FILL:
        val = getattr(comic, field, None)
        if val is None or str(val).strip() == "":
            return True
    return _link_missing(db, "comic", comic.system_id, COMIC_LINK_FIELDS_TO_FILL)


def has_missing_values_game(game) -> bool:
    """
    Returns True if any IGDB-fillable Game column is blank.

    Columns only, and no `db` argument: the genre/theme/mode tags are excluded
    on purpose. IGDB English only lands as a tag when `system_option_alias`
    already knows the term, so a game whose genre has no alias yet would stay
    permanently "needs filling" and be re-requested on every single run.
    """
    for field in GAME_FIELDS_TO_FILL:
        val = getattr(game, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False


def has_missing_values_game_steam(entry) -> bool:
    """
    True when Steam has an appid to work with and has written nothing to this
    entry yet.

    Deliberately not folded into GAME_FIELDS_TO_FILL. A free game has no
    price, an obscure one no Metacritic score, and many have no achievements,
    so testing those columns individually would leave such entries eligible
    for ever. Testing whether Steam has landed *anything* bounds that to the
    genuinely empty case; refreshing what is already there is Replace's job.
    """
    return (
        entry.steam_appid is not None
        and entry.metacritic_score is None
        and entry.price_original_us is None
        and entry.achievements_total is None
    )


def apply_check_baha(
    db: Session, entry: Union[Anime, AnimeMovies], media_type: str
) -> None:
    """
    A Bahamut link means the entry is available on Bahamut.

    The rule is unchanged; only its storage moved. The verdict used to be the
    `source_baha` tristate beside a `baha_link` column, and is now `available`
    on the entry's Bahamut `main` access row, which carries the url itself. An
    existing verdict is never overwritten - someone said it deliberately.
    """
    from app.services.domain.sources import find_main_source
    from app.utils.source_fields import BAHAMUT_VALUE

    row = find_main_source(db, entry.system_id, "access", BAHAMUT_VALUE)
    if row is not None and row.url and row.available is None:
        row.available = True


def find_duplicate_entities(db: Session) -> list[dict]:
    """
    Entities whose names collapse to one normalization key.

    The backfill created these deliberately rather than guessing that two
    spellings meant one person. Deleting one would cascade its credits away, so
    the fix is POST /api/person/{id}/merge - this check is what makes the pairs
    findable in the first place.

    Groups on EVERY field _find_by_name (app/services/domain/credits.py)
    would check for that model - all four of name_en/name_cn/name_jp/name_alt,
    for a person as for a studio - not on one field alone:
    resolve_person/resolve_studio look a new credit up by whichever of those
    fields matches, so two rows that collide on any one of them are
    just as ambiguous to future credit resolution as two that collide on the
    "primary" field. Union-find gives the transitive closure across all of a
    model's fields (A's name_en == B's name_jp, B's name_jp == C's name_alt,
    etc. all collapse into one cluster). A person and a studio sharing a name
    are never grouped together - each table is scanned independently.

    Each result's "key" is a representative label (the first member's
    normalized display_name), not a normalization key every member is
    guaranteed to share - a cluster formed through transitivity can have no single key common to all
    of its rows.
    """
    from app.utils.clustering import cluster
    from app.utils.name_normalize import normalize_name

    def keys(row) -> set[str]:
        fields = getattr(row, "_name_fields", None) or ["name_en"]
        return {
            normalize_name(getattr(row, field))
            for field in fields
            if getattr(row, field, None)
        }

    def label(row) -> str:
        return row.display_name

    found: list[dict] = []
    for kind, model in (
        ("person", Person),
        ("studio", Studio),
        ("publisher", Publisher),
    ):
        rows = db.query(model).all()
        for members in cluster(rows, match=lambda a, b: bool(keys(a) & keys(b))):
            found.append(
                {
                    "kind": kind,
                    "key": normalize_name(label(members[0])),
                    "ids": [str(r.system_id) for r in members],
                    "names": [label(r) for r in members],
                }
            )

    return found


def has_missing_values_studio(studio: Studio) -> bool:
    """
    Returns True if any Tenrai-fillable Studio column is blank.

    The Fill pipeline pairs this with a mal_id check: a studio with no MAL id
    has no source to fill from, however empty it is.
    """
    for field in STUDIO_FIELDS_TO_FILL:
        val = getattr(studio, field, None)
        if val is None or str(val).strip() == "":
            return True
    return False
