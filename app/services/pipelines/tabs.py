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


def _plan_scope(row: Any, db: Session) -> Optional[str]:
    """The owner kind, for the sheet's human reader. See models/plan_next.py."""
    return row.scope or None


def _plan_target_id(row: Any, db: Session) -> Optional[object]:
    """The owner's id, whichever of the three columns holds it."""
    return row.target_id


def _option_category(row: Any, db: Session) -> Optional[str]:
    option = _resolved_option(row, db)
    return option.category if option else None


def _option_value(row: Any, db: Session) -> Optional[str]:
    option = _resolved_option(row, db)
    return option.value if option else None


def _media_display_name(row: Any, db: Session) -> str:
    """
    The entry's name as `media` stores it, for the human reading the sheet.

    The nine entry tabs lose their cover, parents and public_id to `media` in
    Phase C, which makes their rows hard to identify by eye. This appends the
    one derived column that names the row. It is written on Backup and dropped
    on Pull (drop_non_columns in pull.py) - display_name is not a column of any
    entry model.
    """
    media = db.get(models.Media, row.system_id)
    return media.display_name if media else ""


# media_type is the constant discriminator half of each entry table's FK up to
# `media` (app/models/media_sync.py). It is the same value for every row on the
# tab and is re-supplied by the column's server_default on restore, so it would
# only add a column of noise for the human reading the sheet.
def _list_row_media(row: Any, db: Session) -> Optional["models.Media"]:
    return db.get(models.Media, row.media_id)


def _list_row_media_type(row: Any, db: Session) -> Optional[str]:
    media = _list_row_media(row, db)
    return media.media_type if media else None


def _list_row_public_id(row: Any, db: Session) -> Optional[int]:
    media = _list_row_media(row, db)
    return media.public_id if media else None


def _list_row_username(row: Any, db: Session) -> Optional[str]:
    user = db.get(models.User, row.user_id)
    return user.username if user else None


MEDIA_TYPE_ONLY: tuple[str, ...] = ("media_type",)


DISPLAY_NAME_EXTRA: tuple[tuple[str, Callable[[Any, Session], Any]], ...] = (
    ("display_name", _media_display_name),
)


SHEET_TABS: tuple[SheetTab, ...] = (
    # Vocabulary first; scopes point at options via option_id.
    SheetTab("System Options", models.SystemOption, f.parse_system_option_from_sheet),
    SheetTab("System Option Scope", models.SystemOptionScope, f.parse_system_option_scope_from_sheet),
    SheetTab("System Option Usage", models.SystemOptionUsage, f.parse_system_option_usage_from_sheet),
    SheetTab("System Option Alias", models.SystemOptionAlias, f.parse_system_option_alias_from_sheet),
    # Restriction labels. A vocabulary like the options above, but the one
    # whose absence fails OPEN: with no tab, a Pull restored every entry
    # unlabelled and therefore visible. Deliberately NOT system_option - see
    # models/content_label.py.
    SheetTab("Content Label", models.ContentLabel, f.parse_content_label_from_sheet),
    # People and studios before every media tab: credits resolve against them.
    SheetTab("Person", models.Person, f.parse_person_from_sheet),
    SheetTab("Person Role", models.PersonRole, f.parse_person_role_from_sheet),
    SheetTab("Studio", models.Studio, f.parse_studio_from_sheet),
    SheetTab("Publisher", models.Publisher, f.parse_publisher_from_sheet),
    # After Publisher (real FK) and before every media tab: zero scope rows
    # means a publisher is offered NOWHERE, so a scope that fails to restore
    # hides the publisher from every picker. Credits re-add a scope additively
    # on the entry tabs, but only for a publisher that is actually credited -
    # this tab is what carries the ones that are not.
    SheetTab("Publisher Scope", models.PublisherScope, f.parse_publisher_scope_from_sheet),
    # Also before every media tab: Character Casting rows point at characters.
    SheetTab("Character", models.Character, f.parse_character_from_sheet),
    # Key/value rows (announcements, form defaults) nothing else references.
    SheetTab("System Configs", models.SystemConfigs, f.parse_system_config_from_sheet),
    # Grouping tiers, parent first.
    SheetTab("Collection", models.Collection, f.parse_collection_from_sheet),
    SheetTab("Franchise", models.Franchise, f.parse_franchise_from_sheet),
    SheetTab("Series", models.Series, f.parse_series_from_sheet),
    # Before every media tab: each entry table FKs (system_id, media_type) up
    # to `media`. The constraint is deferred, but Pull commits tab by tab, so
    # an entry tab restored before Media would fail at its own commit. This tab
    # is also the only home of an entry's cover, parents and public_id once
    # Phase C of the media supertable plan drops them from the entry tables.
    SheetTab("Media", models.Media, f.parse_media_from_sheet),
    # Media entries. The sheet tab for anime_movies is named "Anime Movie".
    SheetTab("Anime", models.Anime, f.parse_anime_from_sheet, "anime", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    SheetTab("Anime Movie", models.AnimeMovies, f.parse_anime_movie_from_sheet, "anime-movie", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    SheetTab("Movies", models.Movies, f.parse_movie_from_sheet, "movie", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    SheetTab("TV Shows", models.TVShows, f.parse_tv_show_from_sheet, "tv-show", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    SheetTab("Cartoons", models.Cartoon, f.parse_cartoon_from_sheet, "cartoon", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    SheetTab("Manga", models.Manga, f.parse_manga_from_sheet, "manga", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    SheetTab("Novel", models.Novel, f.parse_novel_from_sheet, "novel", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    # After Novel: novel_id is a real FK, so the parent rows must exist first.
    SheetTab("Novel Unit", models.NovelUnit, f.parse_novel_unit_from_sheet),
    SheetTab("Comic", models.Comic, f.parse_comic_from_sheet, "comic", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    SheetTab("Game", models.Game, f.parse_game_from_sheet, "game", drop_columns=MEDIA_TYPE_ONLY, extra_columns=DISPLAY_NAME_EXTRA),
    # After Game: game_id is a real FK, so the parent rows must exist first.
    SheetTab("Game Copy", models.GameCopy, f.parse_game_copy_from_sheet),
    # Personal list rows. After every media tab: media_id resolves through
    # media_type + public_id, and user_id through username, so both must
    # already be restored. Backup drops the three database-local ids and
    # writes the natural key in their place.
    SheetTab(
        "User Media List",
        models.UserMediaList,
        f.parse_user_media_list_from_sheet,
        drop_columns=("system_id", "user_id", "media_id"),
        extra_columns=(
            ("media_type", _list_row_media_type),
            ("public_id", _list_row_public_id),
            ("username", _list_row_username),
        ),
    ),
    # Lists -> Sections -> Items (FK chain), all after the media rows they cite.
    SheetTab("Watch Order List", models.WatchOrderList, f.parse_watch_order_list_from_sheet),
    SheetTab("Watch Order Section", models.WatchOrderSection, f.parse_watch_order_section_from_sheet),
    SheetTab("Watch Order Item", models.WatchOrderItem, f.parse_watch_order_item_from_sheet),
    # FK-less (media_type, id) pairs: both endpoints must already exist.
    SheetTab("Media Relation", models.MediaRelation, f.parse_media_relation_from_sheet),
    # The sheet keeps the (scope, target_id) pair a human reads during an
    # environment switch; the table stores three foreign keys. user_id is
    # dropped because the sheet has no user column until Step 4 - Pull stamps
    # the restore owner (_restore_owner_id in pull.py).
    SheetTab(
        "Plan Next",
        models.PlanNext,
        f.parse_plan_next_from_sheet,
        drop_columns=("user_id", "media_id", "franchise_id", "series_id"),
        extra_columns=(("scope", _plan_scope), ("target_id", _plan_target_id)),
    ),
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
    # After Content Label and after every media tab: cites a label by uuid
    # (translated in pull.py, the label's own uuid being database-local) and an
    # entry by the FK-less (media_type, entry_id) pair.
    SheetTab(
        "Media Content Label",
        models.MediaContentLabel,
        f.parse_media_content_label_from_sheet,
    ),
    # user_id is dropped for the same reason the Plan Next tab drops it: the
    # sheet has no user column until Step 4, and Pull stamps the restore
    # owner (_restore_owner_id in pull.py).
    SheetTab(
        "Seasonal",
        models.Seasonal,
        f.parse_seasonal_from_sheet,
        drop_columns=("user_id",),
    ),
)

TAB_BY_NAME: dict[str, SheetTab] = {tab.name: tab for tab in SHEET_TABS}
TAB_NAMES: list[str] = [tab.name for tab in SHEET_TABS]
TAB_MODELS: dict[str, type] = {tab.name: tab.model for tab in SHEET_TABS}
TAB_PARSERS: dict[str, Callable] = {tab.name: tab.parser for tab in SHEET_TABS}
MEDIA_TYPE_FOR_TAB: dict[str, str] = {
    tab.name: tab.media_type for tab in SHEET_TABS if tab.media_type
}

assert len(TAB_BY_NAME) == len(SHEET_TABS), "duplicate sheet tab name"
