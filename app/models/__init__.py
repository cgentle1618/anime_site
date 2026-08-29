"""
app.models package
Aggregates all SQLAlchemy ORM models. Importing this package registers every
model on Base.metadata, so string-based relationships resolve correctly.
"""
from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin
from app.models.collection import Collection
from app.models.franchise import Franchise, Series
from app.models.anime import Anime
from app.models.anime_movie import AnimeMovies
from app.models.movie import Movies
from app.models.tv_show import TVShows
from app.models.cartoon import Cartoon
from app.models.manga import Manga
from app.models.novel import Novel
from app.models.comic import Comic
from app.models.watch_order import (
    WatchOrderList,
    WatchOrderItem,
    WatchOrderSection,
)
from app.models.media_relation import MediaRelation
from app.models.staff import Person, PersonRole, Studio
from app.models.media_credit import MediaCredit, MediaTag
from app.models.plan_next import PlanNext
from app.models.quote import Quote
from app.models.meme import Meme
from app.models.note import Note
from app.models.system import (
    SystemOption,
    SystemOptionScope,
    SystemConfigs,
    Seasonal,
    User,
    DataControlLog,
    DeletedRecord,
)

__all__ = [
    "Base",
    "get_taipei_now",
    "NameFallbackMixin",
    "Collection",
    "Franchise",
    "Series",
    "Anime",
    "AnimeMovies",
    "Movies",
    "TVShows",
    "Cartoon",
    "Manga",
    "Novel",
    "Comic",
    "WatchOrderList",
    "WatchOrderItem",
    "WatchOrderSection",
    "MediaRelation",
    "Person",
    "PersonRole",
    "Studio",
    "MediaCredit",
    "MediaTag",
    "PlanNext",
    "Quote",
    "Meme",
    "Note",
    "SystemOption",
    "SystemOptionScope",
    "SystemConfigs",
    "Seasonal",
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
