"""
app.models package
Aggregates all SQLAlchemy ORM models. Importing this package registers every
model on Base.metadata, so string-based relationships resolve correctly.
"""
from app.database import Base, get_taipei_now
from app.models.access_mode import (
    AccessMode,
    AccessModeFieldGroup,
    AccessModeLabel,
    UserAccessMode,
    UserAccessModeDenial,
)
from app.models.anime import Anime
from app.models.anime_movie import AnimeMovies
from app.models.base import NameFallbackMixin
from app.models.cartoon import Cartoon
from app.models.character import Character, CharacterCasting
from app.models.collection import Collection
from app.models.comic import Comic
from app.models.content_label import ContentLabel, MediaContentLabel
from app.models.franchise import Franchise, Series
from app.models.game import Game
from app.models.game_copy import GameCopy
from app.models.image import Image, ImageAttachment
from app.models.manga import Manga
from app.models.media import Media
from app.models.media_credit import MediaCredit, MediaTag
from app.models.media_relation import MediaRelation
from app.models.media_source import MediaSource  # noqa: F401
from app.models.meme import Meme
from app.models.movie import Movies
from app.models.note import Note
from app.models.novel import Novel, NovelUnit
from app.models.plan_next import PlanNext
from app.models.quote import Quote
from app.models.staff import (
    Person,
    PersonRole,
    Publisher,
    PublisherScope,
    Studio,
)
from app.models.system import (
    DataControlLog,
    DeletedRecord,
    Role,
    RolePermission,
    Seasonal,
    SystemConfigs,
    SystemOption,
    SystemOptionAlias,
    SystemOptionScope,
    SystemOptionUsage,
    User,
)
from app.models.tv_show import TVShows
from app.models.user_media_list import UserMediaList
from app.models.user_novel_unit_rating import UserNovelUnitRating
from app.models.watch_order import (
    WatchOrderItem,
    WatchOrderList,
    WatchOrderSection,
)

__all__ = [
    "Base",
    "get_taipei_now",
    "NameFallbackMixin",
    "Collection",
    "Franchise",
    "Series",
    "Media",
    "UserMediaList",
    "UserNovelUnitRating",
    "Anime",
    "AnimeMovies",
    "Movies",
    "TVShows",
    "Cartoon",
    "Character",
    "CharacterCasting",
    "Manga",
    "Novel",
    "NovelUnit",
    "Comic",
    "Game",
    "GameCopy",
    "Image",
    "ImageAttachment",
    "WatchOrderList",
    "WatchOrderItem",
    "WatchOrderSection",
    "MediaRelation",
    "Person",
    "PersonRole",
    "Studio",
    "Publisher",
    "PublisherScope",
    "MediaCredit",
    "MediaTag",
    "MediaSource",
    "PlanNext",
    "Quote",
    "Meme",
    "Note",
    "SystemOption",
    "SystemOptionAlias",
    "SystemOptionScope",
    "SystemOptionUsage",
    "SystemConfigs",
    "Seasonal",
    "ContentLabel",
    "MediaContentLabel",
    "AccessMode",
    "AccessModeLabel",
    "AccessModeFieldGroup",
    "UserAccessMode",
    "UserAccessModeDenial",
    "Role",
    "RolePermission",
    "User",
    "DataControlLog",
    "DeletedRecord",
]

# ---------------------------------------------------------------------------
# `remark`, read side
# ---------------------------------------------------------------------------
# `remark` used to be a Text column on each of these ten tables, then the
# singleton `remark` row in `note` mapped back on with a scalar-subquery
# column_property. That property is GONE as of decision 12.
#
# It could not be made per-viewer. `remark` is a personal-scope section, so a
# row belongs to its author, and a class-level scalar subquery cannot know who
# is asking - it served one person's private assessment to everybody, and it
# forced ix_note_one_remark_per_owner to stay per-owner so the subquery could
# never return two rows, which in turn made the database refuse a second
# account's remark outright.
#
# The read is now per request:
#     app.services.domain.remark_field.attach_remark(db, owner_type, entries,
#                                                    user_id)
# called beside the other attach_* helpers on every read path - the nine
# detail routes and the list route in routers/_factory.py, and the three tier
# routers. One query per page, filtered by author.
#
# `remark` is therefore a PLAIN attribute, not a mapped one. It is defaulted
# to None on the class below so that every response schema can read it even on
# a path that forgot to attach it: a missing remark must serialise as null,
# never raise, and never show somebody else's. A path that forgets the call
# shows nothing rather than the wrong thing - the fail-safe direction.
#
# One consequence worth knowing: `Model.remark` is no longer a SQL expression,
# so it cannot appear in a filter or an order_by. find_all_remarks queries
# `note` directly for exactly that reason.
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import column_property  # noqa: E402

for _model in (
    Anime,
    AnimeMovies,
    Movies,
    TVShows,
    Cartoon,
    Manga,
    Novel,
    Comic,
    Game,
    Series,
    Franchise,
    Collection,
):
    _model.remark = None


# ---------------------------------------------------------------------------
# `User.role`, read side
# ---------------------------------------------------------------------------
# `role` used to be a String column on users. It is now role_id -> role.name,
# and this maps the name back on so app/routers/auth.py can keep returning it
# on login and minting it as a JWT claim, and tests/api/test_auth.py can keep
# asserting on it.
#
# Read-only by construction, like `remark` above: every write goes through
# role_id, so the two cannot disagree.
User.role = column_property(
    select(Role.name)
    .where(Role.system_id == User.role_id)
    .correlate_except(Role)
    .scalar_subquery()
)


# ---------------------------------------------------------------------------
# `media`, write side
# ---------------------------------------------------------------------------
# Every media entry has one row in `media`. The parent row is maintained by
# mapper events rather than by a router hook, because entries are written
# through the ORM directly as often as through the API. Registered here, after
# all models are imported, so the registrations sit together and no model
# module has to import Media. See app/models/media_sync.py for why.
from app.models.media_sync import register_media_sync  # noqa: E402

# (model, hyphenated MEDIA_TABLES key). Grows as each type is ported.
_MEDIA_TYPES = (
    (Anime, "anime"),
    (AnimeMovies, "anime-movie", False),  # no series: anime movies have none
    (Movies, "movie"),
    (TVShows, "tv-show"),
    (Cartoon, "cartoon"),
    (Manga, "manga"),
    (Novel, "novel"),
    (Comic, "comic"),
    (Game, "game"),
)

for _entry in _MEDIA_TYPES:
    register_media_sync(*_entry)


# ---------------------------------------------------------------------------
# `quote` and `watch_order_item`, read side
# ---------------------------------------------------------------------------
# Both tables now store a single `media_id` - a real FK up to `media` - where
# they used to carry a FK-less (media_type, entry_id) pair. The API keeps the
# pair: the SPA reads `media_type` and `entry_id` from quotes, memes, watch
# order steps and relations in 93 places, and Step 0 changes no user-visible
# behaviour. So the pair is derived here rather than stored.
#
# `entry_id` is a synonym: it IS media_id, the same uuid under the name the API
# uses, readable, writable and usable in a filter.
# `media_type` is read-only by construction, like `remark` and `User.role`
# above - the media row is the only place it lives, so the two cannot disagree.
# That is a real gain: the old pair could store media_type="manga" beside an
# anime's entry_id and nothing would object.
from sqlalchemy.orm import synonym  # noqa: E402

for _model in (Quote, WatchOrderItem):
    _model.entry_id = synonym("media_id")
    _model.media_type = column_property(
        select(Media.media_type)
        .where(Media.system_id == _model.media_id)
        .correlate_except(Media)
        .scalar_subquery()
    )
