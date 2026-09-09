"""Game ORM model."""

import uuid

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now
from app.models.base import NameFallbackMixin


class Game(Base, NameFallbackMixin):
    """
    One purchasable: a base game, a DLC, an expansion or a bundle.

    The unit is the purchasable rather than the work, because that is how a
    game collection is actually acquired - a DLC is bought, played and
    finished separately from its base game. A DLC is a row here with a
    base_game_id, not a row in a second table: it shares nearly every column
    with a base game and differs mainly in having a parent.

    base_game_id is deliberately nullable even for a DLC. A DLC is often
    entered before its base game exists, and a link filled in later is
    friendlier than a write that fails on entry order.
    """

    __tablename__ = "games"
    __table_args__ = (
        # Pins this row to a media row of its own type: with media's
        # UNIQUE (system_id, media_type) on the other end, this table's row can
        # never attach itself to another type's media row.
        ForeignKeyConstraint(
            ["system_id", "media_type"],
            ["media.system_id", "media.media_type"],
            name="fk_games_media",
            ondelete="CASCADE",
            # Deferred because the parent row is written *after* this one: the
            # media row copies public_id, which a Sequence default does not
            # mint until this INSERT runs. Both rows land in one transaction
            # and the pairing is still checked, at COMMIT.
            deferrable=True,
            initially="DEFERRED",
        ),
        CheckConstraint("media_type = 'game'", name="ck_games_media_type"),
        CheckConstraint(
            r"release_date ~ '^\d{4}(-\d{2}(-\d{2})?)?$'",
            name="ck_games_release_date_iso",
        ),
        CheckConstraint(
            "game_type <> 'Base Game' OR base_game_id IS NULL",
            name="ck_games_base_no_parent",
        ),
        CheckConstraint(
            "base_game_id IS NULL OR base_game_id <> system_id",
            name="ck_games_not_self_parent",
        ),
    )

    _name_fields = [
        "game_name_en",
        "game_name_cn",
        "game_name_roman",
        "game_name_jp",
        "game_name_alt",
    ]

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # The discriminator half of the composite FK up to `media`. Constant per
    # table and pinned by ck_games_media_type; it exists so the FK can carry
    # the type, not because a row could ever be anything else.
    media_type = Column(String, nullable=False, server_default="game")

    game_name_en = Column(String, nullable=True)
    game_name_cn = Column(String, nullable=True)
    game_name_roman = Column(String, nullable=True)
    game_name_jp = Column(String, nullable=True)
    game_name_alt = Column(String, nullable=True)

    game_type = Column(String, nullable=True)
    # Self-reference. SET NULL rather than CASCADE: deleting a base game must
    # not silently delete the DLC rows that were bought separately.
    base_game_id = Column(
        UUID(as_uuid=True),
        ForeignKey("games.system_id", ondelete="SET NULL"),
        nullable=True,
    )

    # How deep the finish went. Independent of playing_status: "Active Playing"
    # plus "Main Story" is the ordinary state of having rolled credits and
    # still playing for achievements.
    completion_level = Column(String, nullable=True)
    # Three tristate flags, orthogonal to completion_level and to each other:
    # every ending can be seen on a main-story-only run, and a collectible
    # missed on a Completionist one.
    all_endings = Column(Boolean, nullable=True)
    # Stored, never derived from the counts below - they are often unknown
    # (no published achievement list, or the numbers not looked up yet).
    all_achievements = Column(Boolean, nullable=True)
    all_collected = Column(Boolean, nullable=True)
    # Whether Steam may write this entry's progress. Not a completion flag:
    # it is about the source, not about the game. See the migration.
    steam_progress_sync = Column(Boolean, nullable=True)
    achievements_earned = Column(Integer, nullable=True)
    achievements_total = Column(Integer, nullable=True)

    release_status = Column(String, nullable=True)
    release_date = Column(String, nullable=True)
    # What is installed, not what changed in it: "1.6.1", "Update 7".
    current_patch = Column(String, nullable=True)

    hours_played = Column(Float, nullable=True)
    # The three public time-to-beat tiers. Sourced from IGDB, not from
    # HowLongToBeat, which publishes no official API.
    hltb_main = Column(Float, nullable=True)
    hltb_main_extra = Column(Float, nullable=True)
    hltb_completionist = Column(Float, nullable=True)

    # The game's market prices. What *I* paid is per-copy, on game_copy.
    price_original_us = Column(Numeric(10, 2), nullable=True)
    price_original_jp = Column(Numeric(10, 2), nullable=True)
    price_original_tw = Column(Numeric(10, 2), nullable=True)
    price_current_us = Column(Numeric(10, 2), nullable=True)
    price_current_jp = Column(Numeric(10, 2), nullable=True)
    price_current_tw = Column(Numeric(10, 2), nullable=True)

    # Metacritic publishes two separate figures on two separate scales: the
    # critic metascore is an integer out of 100, the user score a float out of
    # 10. Neither is derived from the other, and neither is my_rating - that
    # stays my own judgement. Both are typed in for now; an IGDB
    # aggregated_rating autofill is a later change.
    metacritic_score = Column(Integer, nullable=True)
    metacritic_user_score = Column(Float, nullable=True)


    igdb_id = Column(Integer, nullable=True)
    igdb_link = Column(String, nullable=True)
    # Reserved for the deferred Steam sync so it needs no migration of its own.
    # Nothing reads or writes these yet.
    steam_appid = Column(Integer, nullable=True)
    steam_link = Column(String, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    copies = relationship(
        "GameCopy",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="GameCopy.position",
    )

    # A DLC's base game, read-only. selectin rather than the default lazy
    # load so the list endpoints batch it into one extra query instead of one
    # per DLC. Never written through - base_game_id is the column that owns
    # the link.
    base_game = relationship(
        "Game",
        remote_side="Game.system_id",
        viewonly=True,
        lazy="selectin",
    )

    @property
    def names_dict(self) -> dict:
        return {
            "en": self.game_name_en,
            "cn": self.game_name_cn,
            "roman": self.game_name_roman,
            "jp": self.game_name_jp,
            "alt": self.game_name_alt,
        }

    @property
    def display_name(self) -> str:
        sequence = [
            ("CN", self.game_name_cn),
            ("EN", self.game_name_en),
            ("Alt", self.game_name_alt),
            ("Roman", self.game_name_roman),
            ("JP", self.game_name_jp),
        ]
        return self.get_fallback_name(sequence, "CN")
