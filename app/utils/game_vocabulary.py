"""
The Chinese game vocabulary, and the helper that seeds it.

The data lives here rather than inside the migration for two reasons. The
suite never runs Alembic (tests/api/conftest.py builds the schema with
create_all), so a seed buried in a revision file could not be tested at all;
and the same rows have to exist in every database that was created by
create_all rather than by upgrade.

Values are Chinese, because that is what the pickers show. An external API's
English is a wire format and lives in `system_option_alias` - see
app/models/system.py. Genre, theme and mode mirror IGDB's own three fields and
so carry aliases; Combat Mode is not an IGDB field and carries none.

Every row is scoped to `game`. That is the load-bearing part: a system_option
with NO scope rows is offered in EVERY media type's picker, so an unscoped
角色扮演 would silently appear in anime's genre dropdown.
"""

from typing import Optional

from sqlalchemy.orm import Session

from app import models

# category -> ((chinese_value, (igdb_aliases, ...)), ...)
GAME_VOCABULARY: dict[str, tuple[tuple[str, tuple[str, ...]], ...]] = {
    "Game Genre": (
        ("角色扮演", ("Role-playing (RPG)",)),
        ("動作", ("Hack and slash/Beat 'em up",)),
        ("射擊", ("Shooter",)),
        ("平台", ("Platform",)),
        ("解謎", ("Puzzle",)),
        ("策略", ("Strategy",)),
        ("回合制策略", ("Turn-based strategy (TBS)",)),
        ("即時戰略", ("Real Time Strategy (RTS)",)),
        ("戰術", ("Tactical",)),
        ("冒險", ("Adventure",)),
        ("模擬", ("Simulator",)),
        ("競速", ("Racing",)),
        ("運動", ("Sport",)),
        ("格鬥", ("Fighting",)),
        ("音樂", ("Music",)),
        ("益智問答", ("Quiz/Trivia",)),
        ("卡牌與桌遊", ("Card & Board Game",)),
        ("視覺小說", ("Visual Novel",)),
        ("大逃殺", ("Battle Royale",)),
        ("街機", ("Arcade",)),
        ("獨立", ("Indie",)),
        ("點擊冒險", ("Point-and-click",)),
        ("MOBA", ("MOBA",)),
    ),
    "Game Theme": (
        ("動作", ("Action",)),
        ("奇幻", ("Fantasy",)),
        ("科幻", ("Science fiction",)),
        ("恐怖", ("Horror",)),
        ("生存", ("Survival",)),
        ("歷史", ("Historical",)),
        ("潛行", ("Stealth",)),
        ("喜劇", ("Comedy",)),
        ("商業", ("Business",)),
        ("劇情", ("Drama",)),
        ("非虛構", ("Non-fiction",)),
        ("沙盒", ("Sandbox",)),
        ("教育", ("Educational",)),
        ("兒童", ("Kids",)),
        ("開放世界", ("Open world",)),
        ("戰爭", ("Warfare",)),
        ("派對", ("Party",)),
        ("4X", ("4X (explore, expand, exploit, and exterminate)",)),
        ("神秘", ("Mystery",)),
        ("浪漫", ("Romance",)),
    ),
    "Game Mode": (
        ("單人", ("Single player",)),
        ("多人", ("Multiplayer",)),
        ("合作", ("Co-operative",)),
        ("分割畫面", ("Split screen",)),
        ("大型多人線上", ("Massively Multiplayer Online (MMO)",)),
    ),
    # PvE/PvP is not an IGDB field, so these are hand-entered and alias-free.
    "Combat Mode": (
        ("PvE", ()),
        ("PvP", ()),
    ),
}

# Two vocabularies that already exist gain game-scoped values, so the Sources
# card has something to offer on a game.
#
# The documented rule is that a link a pipeline fetches on is a column
# (games.igdb_link, games.steam_link) and a link that is only ever displayed is
# a media_source reference row - which is what these are.
GAME_REFERENCE_SOURCES: tuple[str, ...] = (
    "SteamDB",
    "Bahamut",
    "HowLongToBeat",
    "Official",
    "Wiki",
    "Fandom",
)

# Where a game can be PLAYED. Deliberately not storefronts: which copies were
# bought lives in game_copy. Each needs a `watch` usage row, or it reaches the
# origin tag fields only and never the access picker.
GAME_ACCESS_PLATFORMS: tuple[str, ...] = (
    "Game Pass",
    "PlayStation Plus",
    "GeForce Now",
    "Browser",
)

_ACCESS_USAGE = "watch"


def _option(
    db: Session, category: str, value: str
) -> Optional["models.SystemOption"]:
    return (
        db.query(models.SystemOption)
        .filter_by(category=category, value=value)
        .first()
    )


def _ensure_scope(db: Session, option, scope: str, created: bool) -> None:
    """
    Give this option a `game` scope - unless doing so would take one away.

    A system_option with NO scope rows is offered in EVERY media type's picker.
    So for a value this seed did not create and that carries no scopes yet
    (Bahamut, Official, Wiki - already shared vocabulary), adding one would
    NARROW it to games alone. Leave those exactly as they are: they already
    reach games.
    """
    if not created and not option.scopes:
        return
    exists = (
        db.query(models.SystemOptionScope)
        .filter_by(option_id=option.system_id, scope=scope)
        .first()
    )
    if exists is None:
        db.add(models.SystemOptionScope(option_id=option.system_id, scope=scope))


def _ensure_usage(db: Session, option, usage: str, created: bool) -> None:
    """The usage analogue of _ensure_scope, and narrowing the same way."""
    if not created and not option.usages:
        return
    exists = (
        db.query(models.SystemOptionUsage)
        .filter_by(option_id=option.system_id, usage=usage)
        .first()
    )
    if exists is None:
        db.add(models.SystemOptionUsage(option_id=option.system_id, usage=usage))


def _ensure_alias(db: Session, option, source: str, value: str) -> None:
    exists = (
        db.query(models.SystemOptionAlias)
        .filter_by(option_id=option.system_id, source=source, value=value)
        .first()
    )
    if exists is None:
        db.add(
            models.SystemOptionAlias(
                option_id=option.system_id, source=source, value=value
            )
        )


def seed_game_vocabulary(db: Session) -> None:
    """
    Insert the game vocabulary, its `game` scopes and its IGDB aliases.

    Idempotent on every row: uq_system_option_value would fail a whole Pull on
    a second 角色扮演, and the migration is not the only caller - the test
    fixture and any create_all database run it too.
    """
    for category, values in GAME_VOCABULARY.items():
        for sort_order, (value, aliases) in enumerate(values):
            option = _option(db, category, value)
            created = option is None
            if created:
                option = models.SystemOption(
                    category=category, value=value, sort_order=sort_order
                )
                db.add(option)
                db.flush()
            _ensure_scope(db, option, "game", created)
            for alias in aliases:
                _ensure_alias(db, option, "igdb", alias)

    for sort_order, value in enumerate(GAME_REFERENCE_SOURCES):
        option = _option(db, "Reference Source", value)
        created = option is None
        if created:
            option = models.SystemOption(
                category="Reference Source", value=value, sort_order=sort_order
            )
            db.add(option)
            db.flush()
        _ensure_scope(db, option, "game", created)

    for sort_order, value in enumerate(GAME_ACCESS_PLATFORMS):
        option = _option(db, "Platform", value)
        created = option is None
        if created:
            option = models.SystemOption(
                category="Platform", value=value, sort_order=sort_order
            )
            db.add(option)
            db.flush()
        _ensure_scope(db, option, "game", created)
        _ensure_usage(db, option, _ACCESS_USAGE, created)

    db.flush()
