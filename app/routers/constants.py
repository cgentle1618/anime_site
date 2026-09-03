"""
Read-only endpoint for Tier 1 closed enums.

These are the values business logic branches on - "Not Yet Aired" makes Fill
skip mal_rating, "完結" gates the novel volume checks - so they live in code and
are never editable rows. The endpoint exists so the frontend stops keeping a
second copy of each list; see docs/options.md for the canonical documentation.
"""

from fastapi import APIRouter

from app.services.domain.watch_order import ITEM_IMPORTANCE
from app.utils import constants as c
from app.utils.credit_roles import (
    OPTION_CATEGORIES,
    PERSON_ROLES,
    TAG_CATEGORIES,
)
from app.utils.media_resolver import MEDIA_TYPE_KEYS

router = APIRouter(prefix="/api/constants", tags=["Constants"])


def _values(enum_cls) -> list[str]:
    return [member.value for member in enum_cls]


@router.get("", summary="Get All Closed Enums")
@router.get("/", include_in_schema=False)
def get_constants() -> dict[str, list[str]]:
    """Every Tier 1 enum, keyed by snake_case field name."""
    return {
        "watching_status": _values(c.WatchStatus),
        "reading_status": _values(c.ReadStatus),
        "airing_status": _values(c.AiringStatus),
        # Served from the FRANCHISE_TYPES / ANIME_AIRING_TYPES tuples, not the
        # enum, because the frontend dropdown has diverged from the Enum
        # class. See the comment above those tuples in app/utils/constants.py
        # (Ruling R10) before "fixing" this back to _values(c.AnimeAiringType).
        "anime_airing_type": list(c.ANIME_AIRING_TYPES),
        "cartoon_airing_type": list(c.CARTOON_AIRING_TYPES),
        # Served from the FRANCHISE_TYPES tuple, not the enum, because the
        # frontend dropdown has diverged from the Enum class. See the comment
        # above that tuple in app/utils/constants.py (Ruling R10) before
        # "fixing" this back to _values(c.FranchiseType).
        "franchise_type": list(c.FRANCHISE_TYPES),
        "franchise_expectation": list(c.FRANCHISE_EXPECTATIONS),
        "my_rating": list(c.MY_RATINGS),
        "is_main": list(c.IS_MAIN),
        "movie_type": list(c.MOVIE_TYPES),
        "tv_region": list(c.TV_REGIONS),
        "manga_region": list(c.MANGA_REGIONS),
        "novel_region": list(c.NOVEL_REGIONS),
        "novel_type": list(c.NOVEL_TYPES),
        "comic_type": list(c.COMIC_TYPES),
        "manga_serialization_status": list(c.MANGA_SERIALIZATION_STATUSES),
        "novel_serialization_status": list(c.NOVEL_SERIALIZATION_STATUSES),
        "day_of_week": list(c.WEEKDAYS),
        "music_status": list(c.MUSIC_STATUSES),
        "seiyuu_status": list(c.SEIYUU_STATUSES),
        "watch_order_importance": list(ITEM_IMPORTANCE),
        # Two closed vocabularies the ADMIN forms need. person_role was
        # hand-duplicated in OptionsAddTab.jsx with nothing enforcing the
        # match; media_type is what the Options form's scope picker offers.
        # Both are derived, never literals - see app/utils/credit_roles.py
        # and app/utils/media_resolver.py.
        "person_role": list(PERSON_ROLES),
        # Hyphenated media-type keys - NOT person-role scopes, which are the
        # coarser anime / non_anime split.
        "media_type": list(MEDIA_TYPE_KEYS),
        # Tier 2 CATEGORY NAMES, not their values: the vocabularies a tag
        # field reads, declared in TAG_FIELDS. Served because the Options
        # form otherwise derives its category list from the options already
        # stored, which cannot offer a category that has no values yet - the
        # state every new tag field starts in. The values themselves stay on
        # GET /api/options, where an admin edits them.
        "option_categories": list(OPTION_CATEGORIES),
        # The subset of the above that the admin pages group under "Tags".
        # Navigation only: both sub-tabs write the same system_option rows.
        "tag_categories": list(TAG_CATEGORIES),
    }
