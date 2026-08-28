"""Watch Order ORM models — named, ordered, cross-media-type viewing guides."""

import uuid
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, get_taipei_now


class WatchOrderList(Base):
    """
    One named viewing order belonging to exactly one Franchise or Collection.

    Distinct from the per-entry `watch_order` Float column on anime/tv_show/
    cartoon/movie/manga: that field numbers entries within a single table and
    still drives prequel/sequel derivation and the sort dropdowns. This table
    exists because that field cannot span media types, cannot hold more than
    one order per franchise, and cannot express a guide that splits an entry
    (A ep 1-10 -> B -> A ep 11-12).
    """

    __tablename__ = "watch_order_list"
    __table_args__ = (
        # Exactly one owner. An ownerless order has nothing to be an order of,
        # and a doubly-owned one would show up in two places with no rule for
        # which entries are eligible.
        CheckConstraint(
            "(CASE WHEN franchise_id IS NULL THEN 0 ELSE 1 END"
            " + CASE WHEN collection_id IS NULL THEN 0 ELSE 1 END"
            " + CASE WHEN series_id IS NULL THEN 0 ELSE 1 END) = 1",
            name="ck_watch_order_list_single_owner",
        ),
    )

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    # CASCADE, not SET NULL as Collection uses: the single-owner check
    # constraint means a nulled owner would leave an unsavable orphan row.
    franchise_id = Column(
        UUID(as_uuid=True),
        ForeignKey("franchise.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    collection_id = Column(
        UUID(as_uuid=True),
        ForeignKey("collection.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    # The middle tier. Note anime_movies carries no series_id, so a
    # series-owned cross-type order cannot contain anime movies.
    series_id = Column(
        UUID(as_uuid=True),
        ForeignKey("series.system_id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )

    list_name = Column(String, nullable=True)
    list_type = Column(String, default="Custom", nullable=True)
    is_default = Column(Boolean, default=False, nullable=True)
    # Separate from is_default on purpose. Several lists can be recommended
    # (list_type == "Recommended"); this marks the single one to follow, and
    # it need not be the one that opens first.
    is_most_recommended = Column(Boolean, default=False, nullable=True)
    # NULL for an ordinary list. "release" means the steps are generated from
    # the entries' release dates on every read - there are no watch_order_item
    # rows behind them, and the item endpoints refuse to write to such a list.
    auto_source = Column(String, nullable=True)
    sort_index = Column(Float, nullable=True)
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    items = relationship(
        "WatchOrderItem",
        back_populates="parent_list",
        cascade="all, delete-orphan",
        order_by="WatchOrderItem.position",
    )
    sections = relationship(
        "WatchOrderSection",
        back_populates="parent_list",
        cascade="all, delete-orphan",
        order_by="WatchOrderSection.position",
    )
    franchise = relationship("Franchise", foreign_keys=[franchise_id])
    collection = relationship("Collection", foreign_keys=[collection_id])
    series = relationship("Series", foreign_keys=[series_id])

    @property
    def display_name(self) -> str:
        return self.list_name or "Untitled Order"


class WatchOrderItem(Base):
    """
    One step in a WatchOrderList.

    `entry_id` is deliberately FK-less: it points at whichever of the seven
    media tables `media_type` names, and no single foreign key can span them.
    A deleted entry therefore leaves a dangling item, which the read-time
    resolver flags as missing rather than silently dropping.

    The same entry may appear in several items of one list - that is how a
    split run (A ep 1-10 -> B -> A ep 11-12) is expressed.
    """

    __tablename__ = "watch_order_item"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    list_id = Column(
        UUID(as_uuid=True),
        ForeignKey("watch_order_list.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Float, matching the existing watch_order convention, so an item can be
    # slotted between two others without renumbering the whole list.
    position = Column(Float, nullable=True)

    media_type = Column(String, nullable=True)
    entry_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    # The optional grouping tier this step belongs to. SET NULL, not CASCADE:
    # deleting a section must leave its steps in the list and simply
    # unsectioned, exactly as a deleted Collection leaves its franchises
    # uncollected. A step with no section is not an error - it is the state
    # every step in every list was in before sections existed, and an unfiled
    # step may sit anywhere: before, between or after parts.
    section_id = Column(
        UUID(as_uuid=True),
        ForeignKey("watch_order_section.system_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Both null = the whole entry.
    ep_start = Column(Integer, nullable=True)
    ep_end = Column(Integer, nullable=True)

    # Exactly one of "Essential" / "Recommended" / "Normal" / "Optional" - a
    # step sits on one rung of the ladder, never two, which is why this is one
    # column and not a set of booleans. Replaces the older is_optional flag;
    # "Optional" carries that meaning forward unchanged.
    importance = Column(String, default="Normal", nullable=True)
    note = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    parent_list = relationship("WatchOrderList", back_populates="items")
    section = relationship("WatchOrderSection", back_populates="items")


class WatchOrderSection(Base):
    """
    Optional grouping tier between a WatchOrderList and its items.

    Stands to WatchOrderItem as Collection stands to Franchise: a tier with its
    own identity, name and ordering - not a label carried on the step. A long
    guide is authored in parts ("Part 3 - X of Swords"), and those parts are
    the unit an admin reorders, renames and annotates.

    Ownership differs from Collection in one way, on purpose. A Collection is
    standalone and a Franchise may belong to none; a section has no meaning
    outside its list, so `list_id` is CASCADE - deleting the order deletes its
    parts with it. The item side keeps the Collection semantics: SET NULL, so
    dropping a part leaves its steps behind rather than taking them with it.

    ORDERING. A section does not sort the guide. Reading order is the item's
    own `position` and nothing else; a part is drawn around whichever run of
    adjacent items shares a `section_id`, so a part reads wherever its steps
    read. That is what lets an unfiled step sit between two parts - under the
    older rule, which ranked items by section and read every unfiled item
    first, that position could not be expressed at all.

    CONTIGUITY. A part owns one unbroken run: its steps are always adjacent, so
    one part is always one box on the page and "move this part" always has a
    single block to move. The reorder endpoint refuses an order that would
    split one.

    `position` therefore matters only while a part has no steps yet. It anchors
    the empty part in the item stream - measured against the items, not the
    other sections - so a part created and not yet filled still appears where
    the admin made it.
    """

    __tablename__ = "watch_order_section"

    system_id = Column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    list_id = Column(
        UUID(as_uuid=True),
        ForeignKey("watch_order_list.system_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Float, matching the item convention, so a part can be slotted between two
    # others without renumbering the whole guide.
    position = Column(Float, nullable=True)

    section_name = Column(String, nullable=True)
    # The part's own commentary - what the guide prints under its heading,
    # separate from any one step's note.
    remark = Column(Text, nullable=True)

    created_at = Column(DateTime, default=get_taipei_now)
    updated_at = Column(DateTime, default=get_taipei_now, onupdate=get_taipei_now)

    # Relationships
    parent_list = relationship("WatchOrderList", back_populates="sections")
    items = relationship(
        "WatchOrderItem",
        back_populates="section",
        order_by="WatchOrderItem.position",
    )

    @property
    def display_name(self) -> str:
        return self.section_name or "Untitled Section"
