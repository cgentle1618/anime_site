"""
app.models package
Aggregates all SQLAlchemy ORM models. Importing this package registers every
model on Base.metadata, so string-based relationships resolve correctly.
"""
from app.database import Base, get_taipei_now
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
    "Role",
    "RolePermission",
    "User",
    "DataControlLog",
    "DeletedRecord",
]

# ---------------------------------------------------------------------------
# `remark`, read side
# ---------------------------------------------------------------------------
# `remark` used to be a Text column on each of these ten tables. It is now the
# singleton `remark` row in `note`, and this maps it back onto every owner so
# the response schemas, the ten detail pages, Delete.jsx's previews and
# find_all_remarks keep reading a plain attribute.
#
# Read-only by construction: assigning to it raises, which is deliberate. Every
# write goes through app.services.domain.remark_field.upsert_remark. Attached
# here, after all models are imported, so the ten declarations sit together and
# no model module has to import Note.
#
# LIMITATION, deliberate and recorded. `remark` is a personal-scope section
# (app/utils/note_sections.py), but this property is class-level: a scalar
# subquery cannot know which viewer is asking, so it cannot filter by
# note.author_id. The partial unique index ix_note_one_remark_per_owner is
# therefore still per-OWNER rather than per-owner-per-author, which means a
# second user's remark on the same owner is refused by the database rather
# than shown to the first user. Replacing this property with a per-viewer read
# is part of the deferred authorization redesign; until then, do not relax
# that index.
from sqlalchemy import select  # noqa: E402
from sqlalchemy.orm import column_property  # noqa: E402

_REMARK_OWNERS = (
    (Anime, "anime"),
    (AnimeMovies, "anime-movie"),
    (Movies, "movie"),
    (TVShows, "tv-show"),
    (Cartoon, "cartoon"),
    (Manga, "manga"),
    (Novel, "novel"),
    (Comic, "comic"),
    (Game, "game"),
    (Series, "series"),
    (Franchise, "franchise"),
    (Collection, "collection"),
)

for _model, _owner_type in _REMARK_OWNERS:
    _model.remark = column_property(
        select(Note.content)
        .where(
            Note.owner_type == _owner_type,
            Note.owner_id == _model.system_id,
            Note.section == "remark",
        )
        .correlate_except(Note)
        .scalar_subquery()
    )


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
