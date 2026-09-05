"""
The one registry of Google Sheets tabs.

Backup writes tabs and Pull restores them from this list, so the tab name,
the model, the parser and the restore order are declared exactly once. They
used to live in three hand-maintained places (Backup's 26 blocks, Pull's
MODEL_MAP/PARSER_MAP, Pull's order list) that had already drifted.

Order is the RESTORE order and is strict: a parent tab must precede every tab
that points at it, whether through a real FK (Collection -> Franchise ->
Series -> entries; Watch Order List -> Section -> Item) or a FK-less
(media_type, entry_id) pair (relations, plan-next, quotes, memes, notes).
"""

from dataclasses import dataclass
from typing import Any, Callable, Optional

from sqlalchemy.orm import Session

from app import models
from app.utils import formatter as f


@dataclass(frozen=True)
class SheetTab:
    name: str
    model: type
    parser: Callable
    # Hyphenated media_type key (app/utils/media_resolver.MEDIA_TABLES) for
    # entry tabs; they carry credit/tag link columns after the plain columns.
    media_type: Optional[str] = None
    # Columns to drop from the derived header/value list (backup.py), and
    # (header, fn) pairs to append after them. fn receives (row_instance, db)
    # and returns a raw Python value, formatted the same way a plain column
    # would be. Used by Media Source: option_id is database-local (see
    # DERIVED_IDENTITY_KEYS in pull.py), so it is dropped and the option's
    # (category, value) - resolved by db - travel in its place.
    drop_columns: tuple[str, ...] = ()
    extra_columns: tuple[tuple[str, Callable[[Any, Session], Any]], ...] = ()


def _resolved_option(row: Any, db: Session) -> Optional["models.SystemOption"]:
    """The system_option a Media Source row's option_id points at, if any."""
    if row.option_id is None:
        return None
    return db.get(models.SystemOption, row.option_id)


def _option_category(row: Any, db: Session) -> Optional[str]:
    option = _resolved_option(row, db)
    return option.category if option else None


def _option_value(row: Any, db: Session) -> Optional[str]:
    option = _resolved_option(row, db)
    return option.value if option else None


SHEET_TABS: tuple[SheetTab, ...] = (
    # Vocabulary first; scopes point at options via option_id.
    SheetTab("System Options", models.SystemOption, f.parse_system_option_from_sheet),
    SheetTab("System Option Scope", models.SystemOptionScope, f.parse_system_option_scope_from_sheet),
    # People and studios before every media tab: credits resolve against them.
    SheetTab("Person", models.Person, f.parse_person_from_sheet),
    SheetTab("Person Role", models.PersonRole, f.parse_person_role_from_sheet),
    SheetTab("Studio", models.Studio, f.parse_studio_from_sheet),
    # Also before every media tab: Character Casting rows point at characters.
    SheetTab("Character", models.Character, f.parse_character_from_sheet),
    # Key/value rows (announcements, form defaults) nothing else references.
    SheetTab("System Configs", models.SystemConfigs, f.parse_system_config_from_sheet),
    # Grouping tiers, parent first.
    SheetTab("Collection", models.Collection, f.parse_collection_from_sheet),
    SheetTab("Franchise", models.Franchise, f.parse_franchise_from_sheet),
    SheetTab("Series", models.Series, f.parse_series_from_sheet),
    # Media entries. The sheet tab for anime_movies is named "Anime Movie".
    SheetTab("Anime", models.Anime, f.parse_anime_from_sheet, "anime"),
    SheetTab("Anime Movie", models.AnimeMovies, f.parse_anime_movie_from_sheet, "anime-movie"),
    SheetTab("Movies", models.Movies, f.parse_movie_from_sheet, "movie"),
    SheetTab("TV Shows", models.TVShows, f.parse_tv_show_from_sheet, "tv-show"),
    SheetTab("Cartoons", models.Cartoon, f.parse_cartoon_from_sheet, "cartoon"),
    SheetTab("Manga", models.Manga, f.parse_manga_from_sheet, "manga"),
    SheetTab("Novel", models.Novel, f.parse_novel_from_sheet, "novel"),
    # After Novel: novel_id is a real FK, so the parent rows must exist first.
    SheetTab("Novel Unit", models.NovelUnit, f.parse_novel_unit_from_sheet),
    SheetTab("Comic", models.Comic, f.parse_comic_from_sheet, "comic"),
    # Lists -> Sections -> Items (FK chain), all after the media rows they cite.
    SheetTab("Watch Order List", models.WatchOrderList, f.parse_watch_order_list_from_sheet),
    SheetTab("Watch Order Section", models.WatchOrderSection, f.parse_watch_order_section_from_sheet),
    SheetTab("Watch Order Item", models.WatchOrderItem, f.parse_watch_order_item_from_sheet),
    # FK-less (media_type, id) pairs: both endpoints must already exist.
    SheetTab("Media Relation", models.MediaRelation, f.parse_media_relation_from_sheet),
    SheetTab("Plan Next", models.PlanNext, f.parse_plan_next_from_sheet),
    SheetTab("Quote", models.Quote, f.parse_quote_from_sheet),
    # After every media tab: a casting reaches its entry by the FK-less
    # (media_type, entry_id) pair, so each entry must already exist.
    SheetTab(
        "Character Casting",
        models.CharacterCasting,
        f.parse_character_casting_from_sheet,
    ),
    # Memes name quotes, so after them.
    SheetTab("Meme", models.Meme, f.parse_meme_from_sheet),
    SheetTab("Note", models.Note, f.parse_note_from_sheet),
    # After every media tab and after System Options: cites an entry by id and
    # an option by (category, value) rather than by option_id, which is
    # database-local (see pull.py's DERIVED_IDENTITY_KEYS).
    SheetTab(
        "Media Source",
        models.MediaSource,
        f.parse_media_source_from_sheet,
        drop_columns=("option_id",),
        extra_columns=(
            ("option_category", _option_category),
            ("option_value", _option_value),
        ),
    ),
    SheetTab("Seasonal", models.Seasonal, f.parse_seasonal_from_sheet),
)

TAB_BY_NAME: dict[str, SheetTab] = {tab.name: tab for tab in SHEET_TABS}
TAB_NAMES: list[str] = [tab.name for tab in SHEET_TABS]
TAB_MODELS: dict[str, type] = {tab.name: tab.model for tab in SHEET_TABS}
TAB_PARSERS: dict[str, Callable] = {tab.name: tab.parser for tab in SHEET_TABS}
MEDIA_TYPE_FOR_TAB: dict[str, str] = {
    tab.name: tab.media_type for tab in SHEET_TABS if tab.media_type
}

assert len(TAB_BY_NAME) == len(SHEET_TABS), "duplicate sheet tab name"
