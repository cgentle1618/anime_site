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
from app.models.watch_order import WatchOrderList, WatchOrderItem
from app.models.quote import Quote
from app.models.system import (
    SystemOption,
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
    "WatchOrderList",
    "WatchOrderItem",
    "Quote",
    "SystemOption",
    "SystemConfigs",
    "Seasonal",
    "User",
    "DataControlLog",
    "DeletedRecord",
]
