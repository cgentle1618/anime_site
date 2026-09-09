"""
Resolve names to entities and replace an entry's link rows.

Every writer goes through here: the data migration, the credits API, Fill/Pull
and the Sheets restore. That is the point - an entity name arriving from Tenrai
must land on the same row as the one typed into the Add form, and matching on
the normalized key is what makes that true.

replace_* is a whole-set replace rather than an add: the entry forms submit
every value for a field at once, so a diff against what is stored is the only
way "the user removed one name" can be expressed.
"""

import logging
from typing import Optional
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app import models
from app.schemas.link_fields import PersonRef, PublisherRef, StudioRef
from app.utils.credit_roles import (
    CREDIT_ROLES,
    TAG_FIELDS,
    credit_label,
    credit_roles_for,
    sheet_column_for,
    tag_fields_for,
)
from app.utils.name_normalize import name_slot_for, normalize_name, split_names

logger = logging.getLogger(__name__)


class AmbiguousNameError(Exception):
    """
    One name matched more than one stored entity.

    Raised rather than resolved. _find_by_name used to return the first row an
    unordered scan happened to hit, which is arbitrary on a collision - and
    resolve_person/resolve_studio are find-or-create, reached by the credits
    API, Fill/Pull and the Sheets restore. A wrong match there silently
    attaches one entity's credits to another and leaves no signal; a raise
    becomes a per-row failure those pipelines already report, which an admin
    can act on from the duplicate entity check.
    """

    def __init__(self, model_name: str, name: str, matches: list):
        self.model_name = model_name
        self.name = name
        self.matches = matches
        super().__init__(
            f"{name!r} matches {len(matches)} {model_name} rows "
            f"({', '.join(str(m.system_id) for m in matches)}). "
            "Resolve the duplicate before this name can be credited."
        )


def _find_by_name(db: Session, model, name: str):
    """
    Find THE entity whose stored name normalizes to the same key.

    Fields come from the model's _name_fields, so an entity matches on any of
    its names - a Japanese name from Tenrai and an English one typed into the
    Add form must land on the same row, or its credits split in two.

    Linear scan over the whole table in Python rather than a SQL filter -
    normalize_name folds width/case/whitespace in ways SQL can't express
    portably, and these tables are small enough that this stays cheap.

    Returns None when nothing matches, the row when exactly one does, and
    raises AmbiguousNameError when several do. Two DIFFERENT people can hold
    the same string in different columns - A's name_cn and B's name_jp - and
    Japanese personal names collide often, so picking one silently would
    misattribute credits.

    De-duplicating by primary key is load-bearing, not tidiness: normalize_name
    strips whitespace and casefolds by design, so ONE row with
    name_en="KyoAni" and name_alt="KyoAni " matches the key through two of its
    own fields. Counting that as two would raise on every lookup and make the
    row permanently unresolvable.
    """
    key = normalize_name(name)
    if not key:
        return None

    fields = getattr(model, "_name_fields", None) or ["name_en"]
    matches = {}
    for row in db.query(model).all():
        for field in fields:
            value = getattr(row, field, None)
            if value and normalize_name(value) == key:
                matches[row.system_id] = row
                break

    if not matches:
        return None
    if len(matches) > 1:
        raise AmbiguousNameError(model.__name__, name, list(matches.values()))
    return next(iter(matches.values()))


def find_person(db: Session, name: str):
    """The existing person whose stored name normalizes to `name`, or None."""
    return _find_by_name(db, models.Person, name)


def find_studio(db: Session, name: str):
    """The existing studio whose stored name normalizes to `name`, or None."""
    return _find_by_name(db, models.Studio, name)


def find_publisher(db: Session, name: str):
    """The existing publisher whose stored name normalizes to `name`, or None."""
    return _find_by_name(db, models.Publisher, name)


def resolve_person(
    db: Session, name: str, *, role: str, scope: Optional[str] = None
) -> models.Person:
    """Find or create the person, and make sure they hold the given role."""
    person = _find_by_name(db, models.Person, name)
    if person is None:
        stripped = name.strip()
        slot = name_slot_for(stripped, role=role, scope=scope or "")
        person = models.Person(**{f"name_{slot}": stripped})
        db.add(person)
        db.flush()

    held = {(r.role, r.scope) for r in person.roles}
    if (role, scope) not in held:
        db.add(
            models.PersonRole(person_id=person.system_id, role=role, scope=scope)
        )
        db.flush()
        db.refresh(person)
    return person


def resolve_studio(db: Session, name: str) -> models.Studio:
    """Find or create the studio. A new one is created under its English name."""
    studio = _find_by_name(db, models.Studio, name)
    if studio is None:
        studio = models.Studio(name_en=name.strip())
        db.add(studio)
        db.flush()
    return studio


def resolve_publisher(
    db: Session, name: str, *, scope: Optional[str] = None
) -> models.Publisher:
    """
    Find or create the publisher, under its English name when new, and make
    sure it is offered on this media type.

    The scope half mirrors resolve_person: additive, never subtractive, so
    crediting a publisher on a manga can only widen where it is offered. Safe
    precisely because zero scope rows means "offered nowhere" - see
    PublisherScope's docstring.
    """
    publisher = _find_by_name(db, models.Publisher, name)
    if publisher is None:
        publisher = models.Publisher(name_en=name.strip())
        db.add(publisher)
        db.flush()

    if scope and scope not in {s.scope for s in publisher.scopes}:
        db.add(
            models.PublisherScope(publisher_id=publisher.system_id, scope=scope)
        )
        db.flush()
        db.refresh(publisher)
    return publisher


def resolve_option(
    db: Session, category: str, value: str, *, scope: Optional[str] = None
) -> models.SystemOption:
    """
    Find or create the vocabulary value.

    `scope` is DELIBERATE, never derived from the caller's media type: see
    `replace_tags`. It is passed only by the one-time backfill seeding and by
    an admin editing an option, so a scope row is always something someone
    chose.
    """
    key = normalize_name(value)
    option = next(
        (
            o
            for o in db.query(models.SystemOption).filter_by(category=category).all()
            if normalize_name(o.value) == key
        ),
        None,
    )
    if option is None:
        option = models.SystemOption(category=category, value=value.strip())
        db.add(option)
        db.flush()

    if scope and scope not in {s.scope for s in option.scopes}:
        db.add(
            models.SystemOptionScope(option_id=option.system_id, scope=scope)
        )
        db.flush()
        db.refresh(option)
    return option


# Target -> how a name becomes an entity, and which FK holds it. Tables
# rather than an if/else chain: the old code read `if target == "studio" ...
# else <person>`, so `else` MEANT person and a third target reaching it would
# silently mint a Person row. A fourth target is now one line in each dict.
_RESOLVERS = {
    "person": resolve_person,
    "studio": resolve_studio,
    "publisher": resolve_publisher,
}
_TARGET_COLUMNS = {
    "person": "person_id",
    "studio": "studio_id",
    "publisher": "publisher_id",
}


def replace_credits(
    db: Session, media_type: str, media_id: UUID, role: str, names: list[str]
) -> None:
    """
    Make the entry's credits for one role exactly `names`, in that order.

    media_type is still a parameter after the move to media_id, and is not
    redundant: it is the SCOPE a resolved person or publisher is registered
    under. The row itself is keyed only by media_id.
    """
    spec = CREDIT_ROLES[role]

    db.query(models.MediaCredit).filter_by(
        media_id=media_id, role=role
    ).delete(synchronize_session=False)

    for position, name in enumerate(names):
        if spec.target == "person":
            # The scope is the media type - nothing left to derive. Before the
            # collapse, director alone was scoped, anime/non_anime, by
            # director_scope_for().
            target = resolve_person(db, name, role=role, scope=media_type)
        elif spec.target == "publisher":
            # Same rule, same reason: a publisher is offered where it is used.
            target = resolve_publisher(db, name, scope=media_type)
        else:
            target = _RESOLVERS[spec.target](db, name)
        db.add(
            models.MediaCredit(
                media_id=media_id,
                role=role,
                position=position,
                **{_TARGET_COLUMNS[spec.target]: target.system_id},
            )
        )
    db.flush()


def replace_tags(
    db: Session, media_id: UUID, field: str, values: list[str]
) -> None:
    """
    Make the entry's tags for one field exactly `values`, in that order.

    No media_type parameter, unlike replace_credits: a tag registers no scope
    (Ruling R27, below), so once the row is keyed by media_id the type has
    nothing left to do here.
    """
    spec = TAG_FIELDS[field]

    db.query(models.MediaTag).filter_by(
        media_id=media_id, field=field
    ).delete(synchronize_session=False)

    for position, value in enumerate(values):
        # No scope=media_type here, and that is the point (Ruling R27).
        # Auto-scoping on write meant that assigning an UNSCOPED value to one
        # entry silently narrowed it to that entry's media type everywhere
        # else: add "Disney+" under Official Source, use it on one TV show,
        # and it vanishes from the Cartoon dropdown with no warning and no way
        # for an admin to put it back. Option scopes are admin-managed data,
        # seeded once by the backfill and editable in the Options form - the
        # same reason person `director` scope was made explicit rather than
        # derived from credits.
        option = resolve_option(db, spec.category, value)
        db.add(
            models.MediaTag(
                media_id=media_id,
                field=field,
                option_id=option.system_id,
                position=position,
            )
        )
    db.flush()


def credit_names(db: Session, media_id: UUID, role: str) -> list[str]:
    """The entry's credited names for one role, in stored order."""
    rows = (
        db.query(models.MediaCredit)
        .filter_by(media_id=media_id, role=role)
        .order_by(models.MediaCredit.position)
        .all()
    )
    out = []
    for row in rows:
        if row.person_id:
            entity = db.get(models.Person, row.person_id)
        elif row.studio_id:
            entity = db.get(models.Studio, row.studio_id)
        else:
            entity = db.get(models.Publisher, row.publisher_id)
        if entity is not None:
            # People and studios both choose their own shown name. This value
            # reaches the anime payload, the admin form and the Sheets column -
            # all three read the same string.
            out.append(entity.display_name)
    return out


def tag_values(db: Session, media_id: UUID, field: str) -> list[str]:
    """The entry's vocabulary values for one field, in stored order."""
    rows = (
        db.query(models.MediaTag)
        .filter_by(media_id=media_id, field=field)
        .order_by(models.MediaTag.position)
        .all()
    )
    out = []
    for row in rows:
        option = db.get(models.SystemOption, row.option_id)
        if option is not None:
            out.append(option.value)
    return out


def credits_to_sheet_value(db: Session, media_id: UUID, role: str) -> str:
    """Comma-joined names, the shape the entry sheet columns keep."""
    return ", ".join(credit_names(db, media_id, role))


def tags_to_sheet_value(db: Session, media_id: UUID, field: str) -> str:
    """Comma-joined values, the shape the entry sheet columns keep."""
    return ", ".join(tag_values(db, media_id, field))


def sheet_link_rows(db: Session, media_type: str, entries) -> list[list[str]]:
    """
    `sheet_link_values` for many entries at once, aligned with
    `sheet_link_headers`, in the fixed number of queries
    `link_values_for_entries` needs. Backup used the per-row form, which was
    one query per role/field per row - thousands of round trips on Anime.
    """
    entries = list(entries)
    links = link_values_for_entries(db, media_type, [e.system_id for e in entries])
    keys = [role.key for role in credit_roles_for(media_type)] + [
        field.key for field in tag_fields_for(media_type)
    ]
    return [
        [", ".join(links.get(e.system_id, {}).get(key, [])) for key in keys]
        for e in entries
    ]


def names_from_sheet_value(raw: Optional[str]) -> list[str]:
    """Split one comma-joined sheet cell back into names."""
    return split_names(raw)


def sheet_link_headers(media_type: str) -> list[str]:
    """
    The legacy sheet headers for every credit role and tag field this media
    type carries, in the same order `sheet_link_values` fills them.

    These land at the END of the entry tab, after the plain columns
    `format_model_for_sheet` already emits. That is fine: restore matches a
    sheet column by header NAME (`parse_row_to_dict`), never by position.
    """
    headers = [sheet_column_for(media_type, role.key) for role in credit_roles_for(media_type)]
    headers += [sheet_column_for(media_type, field.key) for field in tag_fields_for(media_type)]
    return headers


def sheet_link_values(db: Session, media_type: str, entry) -> list[str]:
    """Comma-joined values for every credit role and tag field, aligned with
    `sheet_link_headers`."""
    values = [
        credits_to_sheet_value(db, entry.system_id, role.key)
        for role in credit_roles_for(media_type)
    ]
    values += [
        tags_to_sheet_value(db, entry.system_id, field.key)
        for field in tag_fields_for(media_type)
    ]
    return values


# ---------------------------------------------------------------------------
# One-time backfill from the comma-joined string columns.
#
# Lives here rather than inside the Alembic revision so it can be tested with
# the normal fixtures and re-run by hand if a restore brings old data back. It
# is idempotent: replace_* is a whole-set replace, so a second run rewrites the
# same rows.
# ---------------------------------------------------------------------------

# (media_type, column, kind, key) - kind is "credit" or "tag".
# manga.anime_studio is deliberately absent: it points at the adaptation's
# studio, not at a credit of the manga. See the spec's Out of Scope section.
BACKFILL_MAP: tuple[tuple[str, str, str, str], ...] = (
    ("anime", "studio", "credit", "studio"),
    ("anime", "director", "credit", "director"),
    ("anime", "producer", "credit", "producer"),
    ("anime", "music", "credit", "composer"),
    ("anime", "distributor_tw", "tag", "publisher_tw"),
    ("anime", "genre_main", "tag", "genre_main"),
    ("anime", "genre_sub", "tag", "genre_sub"),
    ("anime-movie", "studio", "credit", "studio"),
    ("anime-movie", "director", "credit", "director"),
    ("movie", "director", "credit", "director"),
    ("tv-show", "source_official", "tag", "original_source"),
    ("cartoon", "source_official", "tag", "original_source"),
    ("manga", "author_plot", "credit", "author"),
    ("manga", "author_draw", "credit", "illustrator"),
    ("manga", "publisher_tw", "tag", "publisher_tw"),
    ("novel", "author", "credit", "author"),
    ("novel", "illustrator", "credit", "illustrator"),
    ("novel", "publisher_tw", "tag", "publisher_tw"),
    ("comic", "writer", "credit", "author"),
    ("comic", "artist", "credit", "illustrator"),
    ("comic", "publisher", "tag", "comic_publisher"),
    ("comic", "imprint", "tag", "comic_imprint"),
    ("comic", "continuity", "tag", "comic_continuity"),
    ("comic", "era", "tag", "comic_era"),
    ("comic", "events", "tag", "comic_event"),
    ("comic", "publisher_tw", "tag", "publisher_tw"),
)


def backfill_credits(db: Session) -> dict:
    """
    Fill media_credit and media_tag from the legacy string columns.

    Returns counts plus an `unplaced` list. Nothing is guessed: a fragment that
    is empty after trimming, or a value that survives normalization as an empty
    key, is reported with its owner id and original column so it can be placed
    by hand.
    """
    from app.utils.media_resolver import MEDIA_TABLES

    unplaced: list[dict] = []
    credits_written = tags_written = 0

    for media_type, column, kind, key in BACKFILL_MAP:
        table_name = MEDIA_TABLES[media_type].model.__tablename__
        # Read the legacy value from the database, never through the ORM: by
        # the time this module is importable the model classes no longer
        # define these columns (see `_legacy_column_exists`), so an attribute
        # read would make the whole backfill a silent no-op and leave the next
        # migration's drop gate with nothing to verify against.
        if not _legacy_column_exists(db, table_name, column):
            continue

        rows = db.execute(
            text(f'SELECT system_id, "{column}" AS raw FROM {table_name} '
                 f'WHERE "{column}" IS NOT NULL')
        ).fetchall()

        for row in rows:
            raw = row.raw
            if not raw:
                continue

            names = split_names(raw)
            dropped = [f for f in str(raw).split(",") if f.strip() == ""]
            if dropped:
                unplaced.append(
                    {
                        "media_type": media_type,
                        "entry_id": str(row.system_id),
                        "column": column,
                        "raw": raw,
                        "reason": "empty fragment",
                    }
                )
            if not names:
                continue

            if kind == "credit":
                replace_credits(db, media_type, row.system_id, key, names)
                credits_written += len(names)
            else:
                replace_tags(db, row.system_id, key, names)
                tags_written += len(names)

    db.commit()

    # Seed the initial option scopes from what the migrated data actually
    # uses. This is the one place a scope is derived from usage, and it is a
    # deliberate one-time pass rather than something a save does - see
    # replace_tags. Additive, so re-running it can only widen.
    from app.services.domain.options_extraction import extract_system_options

    extract_system_options(db)

    report = {
        "credits": credits_written,
        "tags": tags_written,
        "people": db.query(models.Person).count(),
        "studios": db.query(models.Studio).count(),
        "options": db.query(models.SystemOption).count(),
        "unplaced": unplaced,
    }
    logger.info(
        "backfill_credits: %s credits, %s tags, %s unplaced",
        credits_written,
        tags_written,
        len(unplaced),
    )
    return report


# The 31 vocabulary values this migration turns into entities: the 30
# "Publisher / Distributor TW" options plus the single "Comic Publisher" one.
#
# Data, not a heuristic. A script-boundary split guesses, and guesses wrong on
# "bilibili (GoodShow)"; name_normalize.py's rule for this codebase is that
# nothing is guessed, which is also why name_slot_for never returns "alt".
# Here a human asserts it - this table is the owner's own final version,
# transcribed verbatim from the spec. See the spec's Decision D and E.
#
# Round-trip note (Decision E): find_publisher matches on ANY of the four
# names, so a value whose pre-migration spelling survives in some column still
# resolves when an older sheet is pulled. "Muse木棉花" keeps that spelling in
# name_cn and is safe. "Proware普威爾" and "曼迪 Mightymedia" do NOT keep
# theirs anywhere, so a Pull from a sheet backed up before this migration will
# create a second row for those two; re-Backup right after migrating, and see
# the Risks section of the spec.
#
# A value absent from this map falls back to name_slot_for.
PUBLISHER_NAME_MAP: dict[str, dict[str, str]] = {
    "Aniplex": {"en": "Aniplex", "display": "en"},
    "ANIPLUS": {"en": "ANIPLUS", "display": "en"},
    # bilibili and Crunchyroll are tagged on no entry at all, so the conversion
    # below - which walks tag rows - would create neither. Both are wanted
    # anyway, so _SEEDED_WITHOUT_CREDITS mints them; "bilibili (GoodShow)" was
    # the third such value and is deliberately NOT here, so it retires with the
    # vocabulary. See the spec's Decision G.
    "bilibili": {"en": "bilibili", "display": "en"},
    "Crunchyroll": {"en": "Crunchyroll", "display": "en"},
    "Disney": {"en": "Disney", "display": "en"},
    "Muse木棉花": {"en": "Muse", "cn": "Muse木棉花", "display": "cn"},
    "NETFLIX": {"en": "NETFLIX", "display": "en"},
    "Proware普威爾": {"en": "Proware", "cn": "普威爾", "display": "cn"},
    "三貝多": {"cn": "三貝多", "display": "cn"},
    "六六喜喜": {"cn": "六六喜喜", "display": "cn"},
    "台灣角川": {"cn": "台灣角川", "display": "cn"},
    "回歸線娛樂": {"cn": "回歸線娛樂", "display": "cn"},
    "天光": {"cn": "天光", "display": "cn"},
    "奇幻基地": {"cn": "奇幻基地", "display": "cn"},
    "尖端": {"cn": "尖端", "display": "cn"},
    "提恩傳媒": {"cn": "提恩傳媒", "display": "cn"},
    "曼迪 Mightymedia": {"en": "Mightymedia", "cn": "曼迪", "display": "cn"},
    "杰外": {"cn": "杰外", "display": "cn"},
    "東方出版社": {"cn": "東方出版社", "display": "cn"},
    # Toei, recorded here in kanji. Placed in cn to match the TW-facing
    # vocabulary it came from; no English name is invented for it.
    "東映": {"cn": "東映", "display": "cn"},
    "東立": {"cn": "東立", "display": "cn"},
    "東販": {"cn": "東販", "display": "cn"},
    "皇冠文化": {"cn": "皇冠文化", "display": "cn"},
    "羚邦 Ani-One": {
        "en": "Ani-One", "cn": "羚邦", "alt": "羚邦", "display": "cn",
    },
    # Kadokawa and its Taiwanese arm stay two rows, as they are two options
    # today. Merging them is a judgement this migration will not make.
    "角川": {"cn": "角川", "display": "cn"},
    "車庫娛樂": {"cn": "車庫娛樂", "display": "cn"},
    "遠流": {"cn": "遠流", "display": "cn"},
    "青文": {"cn": "青文", "display": "cn"},
    "飛燕文創": {"cn": "飛燕文創", "display": "cn"},
    "Marvel Comics": {"en": "Marvel Comics", "display": "en"},
}

# The two vocabularies this migration retires, and the tag fields they backed.
_RETIRED_TAG_FIELDS = ("publisher_tw", "comic_publisher")
_RETIRED_CATEGORIES = ("Publisher / Distributor TW", "Comic Publisher")

# Values the owner wants as entities even though no entry is tagged with them.
# backfill_publishers walks TAG ROWS, so a vocabulary value with none behind it
# creates nothing - it converts data, not vocabulary. These two are the
# exception, named one by one rather than derived, because "keep every unused
# option" is exactly the judgement the owner made differently for the third
# such value ("bilibili (GoodShow)", dropped).
#
# The scope is not derivable either: with no credits there is no media type to
# read one from, and zero scope rows would mean "offered nowhere" (see
# PublisherScope), which would hide them in every picker and defeat the point
# of seeding them. Both are anime streaming distributors, so anime it is - an
# inference, and one an admin can change with the scope pills.
_SEEDED_WITHOUT_CREDITS: tuple[tuple[str, str], ...] = (
    ("bilibili", "anime"),
    ("Crunchyroll", "anime"),
)


def _publisher_from_map(db: Session, value: str) -> models.Publisher:
    """The entity for one vocabulary value, reusing an existing row on a match."""
    entry = PUBLISHER_NAME_MAP.get(value)
    names = [entry[k] for k in ("en", "cn", "jp", "alt") if entry and entry.get(k)]
    for candidate in names or [value]:
        existing = find_publisher(db, candidate)
        if existing is not None:
            return existing

    if entry is None:
        # Not in the reviewed map: fall back to the shared slot rule rather
        # than guessing a split. resolve_publisher would put it in name_en
        # unconditionally, which is wrong for a CJK name.
        slot = name_slot_for(value.strip(), role="publisher", scope="")
        publisher = models.Publisher(**{f"name_{slot}": value.strip()})
    else:
        publisher = models.Publisher(
            name_en=entry.get("en"),
            name_cn=entry.get("cn"),
            name_jp=entry.get("jp"),
            name_alt=entry.get("alt"),
            display_name_field=entry.get("display"),
        )
    db.add(publisher)
    db.flush()
    return publisher


def backfill_publishers(db: Session) -> dict:
    """
    Turn every publisher_tw / comic_publisher tag row into a publisher credit.

    Lives here rather than in the Alembic revision for the same reason
    backfill_credits does: it can be tested with the normal fixtures and re-run
    by hand when a restore brings old data back.

    Idempotent. A second run finds every entity by name, writes the same
    credits under uq_media_credit_row, and finds no tag rows left to convert.

    Nothing is guessed and nothing is silently dropped: a comic publisher_tw
    row - which does not exist in the live data, see the spec's Decision C -
    is reported in `skipped` and left where it is.
    """
    credits_written = 0
    skipped: list[dict] = []
    scoped: set[tuple] = set()
    kept_options: set[UUID] = set()

    # media_type comes from the joined media row: the link tables no longer
    # carry their own copy.
    rows = (
        db.query(models.MediaTag, models.SystemOption, models.Media.media_type)
        .join(
            models.SystemOption,
            models.MediaTag.option_id == models.SystemOption.system_id,
        )
        .join(models.Media, models.MediaTag.media_id == models.Media.system_id)
        .filter(models.MediaTag.field.in_(_RETIRED_TAG_FIELDS))
        .order_by(models.MediaTag.position)
        .all()
    )

    for tag, option, media_type in rows:
        if media_type == "comic" and tag.field == "publisher_tw":
            # Decision C: expected to be unreachable. Report, never drop.
            skipped.append(
                {
                    "media_type": media_type,
                    "entry_id": str(tag.media_id),
                    "field": tag.field,
                    "value": option.value,
                    "reason": "comic publisher_tw is retired, not migrated",
                }
            )
            # media_tag.option_id cascades on delete, so retiring the category
            # would take this row with it - the one thing "left where it is"
            # rules out. Its option survives so the tag can.
            kept_options.add(option.system_id)
            continue

        publisher = _publisher_from_map(db, option.value)
        exists = (
            db.query(models.MediaCredit)
            .filter_by(
                media_id=tag.media_id,
                role="publisher",
                publisher_id=publisher.system_id,
            )
            .first()
        )
        if exists is None:
            db.add(
                models.MediaCredit(
                    media_id=tag.media_id,
                    role="publisher",
                    publisher_id=publisher.system_id,
                    position=tag.position,
                )
            )
            credits_written += 1

        scoped.add((publisher.system_id, media_type))
        db.delete(tag)

    db.flush()

    # Seed scope from what the data actually uses - the same one-time,
    # derived-from-usage pass backfill_credits ends with for option scopes.
    # Also covers the game publishers that predate this table.
    for publisher_id, media_type in scoped | {
        (publisher_id, media_type)
        for publisher_id, media_type in db.query(
            models.MediaCredit.publisher_id, models.Media.media_type
        )
        .join(models.Media, models.MediaCredit.media_id == models.Media.system_id)
        .filter(models.MediaCredit.role == "publisher")
        .all()
    }:
        held = {
            s.scope
            for s in db.query(models.PublisherScope)
            .filter_by(publisher_id=publisher_id)
            .all()
        }
        if media_type not in held:
            db.add(
                models.PublisherScope(
                    publisher_id=publisher_id, scope=media_type
                )
            )

    # Seed the entities that no tag row would have created. Runs before the
    # retire delete only because it reads nothing from system_option; it is
    # independent of everything above.
    for value, scope in _SEEDED_WITHOUT_CREDITS:
        publisher = _publisher_from_map(db, value)
        if scope not in {s.scope for s in publisher.scopes}:
            db.add(
                models.PublisherScope(
                    publisher_id=publisher.system_id, scope=scope
                )
            )

    db.flush()
    retire = db.query(models.SystemOption).filter(
        models.SystemOption.category.in_(_RETIRED_CATEGORIES)
    )
    if kept_options:
        retire = retire.filter(
            models.SystemOption.system_id.notin_(kept_options)
        )
    retire.delete(synchronize_session=False)
    db.commit()

    report = {
        "credits": credits_written,
        "entities": db.query(models.Publisher).count(),
        "scopes": db.query(models.PublisherScope).count(),
        "skipped": skipped,
    }
    logger.info(
        "backfill_publishers: %s credits, %s entities, %s skipped",
        credits_written,
        report["entities"],
        len(skipped),
    )
    return report


def _legacy_column_exists(db: Session, table_name: str, column: str) -> bool:
    """
    Whether a legacy string column is still physically present.

    Checked via information_schema rather than the ORM model, because Task 10
    deletes the Column(...) definitions in the same commit that adds this
    check - by the time this module is imported, the model classes no longer
    expose these attributes even when the database still carries the column
    (true for every real run of the drop migration, which checks before it
    drops). A missing column is treated as nothing to verify, not a failure.
    """
    row = db.execute(
        text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name = :t AND column_name = :c"
        ),
        {"t": table_name, "c": column},
    ).first()
    return row is not None


def verify_backfill_lossless(db: Session) -> dict:
    """
    Prove the link tables already hold every name a legacy column has, before
    Task 10's migration drops that column for good.

    For each (media_type, column) in BACKFILL_MAP: read the legacy column's
    raw values straight from the database (not through the ORM - see
    `_legacy_column_exists`), rebuild what the link tables say for that
    role/field via `credit_names`/`tag_values`, and compare the two as sets of
    normalized names. Extra names on the link side are fine - a rerun or a
    manual addition can legitimately produce them. Only a name the legacy
    column had that the link tables are missing counts as a mismatch, because
    that is the one case where dropping the column would actually lose data.

    Returns {"checked": <rows with a non-empty legacy value>, "mismatches": [...]}.
    An empty `mismatches` list means the drop is provably lossless.
    """
    from app.utils.media_resolver import MEDIA_TABLES

    checked = 0
    mismatches: list[dict] = []

    for media_type, column, kind, key in BACKFILL_MAP:
        table_name = MEDIA_TABLES[media_type].model.__tablename__
        if not _legacy_column_exists(db, table_name, column):
            continue

        rows = db.execute(
            text(f'SELECT system_id, "{column}" AS raw FROM {table_name} '
                 f'WHERE "{column}" IS NOT NULL')
        ).fetchall()

        for row in rows:
            legacy_names = split_names(row.raw)
            if not legacy_names:
                continue
            checked += 1
            legacy_keys = {normalize_name(n) for n in legacy_names}

            if kind == "credit":
                current = credit_names(db, row.system_id, key)
            else:
                current = tag_values(db, row.system_id, key)
            current_keys = {normalize_name(n) for n in current}

            missing = legacy_keys - current_keys
            if missing:
                mismatches.append(
                    {
                        "media_type": media_type,
                        "entry_id": str(row.system_id),
                        "column": column,
                        "missing": sorted(missing),
                    }
                )

    logger.info(
        "verify_backfill_lossless: %s rows checked, %s mismatches",
        checked,
        len(mismatches),
    )
    return {"checked": checked, "mismatches": mismatches}


# ---------------------------------------------------------------------------
# Read path: legacy-named, comma-joined link values on the entry payload.
#
# The public pages (detail, library, statistics, cards) render an entry from
# ONE list or detail response. Before this redesign they read plain columns -
# `anime.studio`, `comic.era`. Dropping those columns silently blanked every
# one of those reads, because a missing attribute is not an error in JS.
#
# Rather than teach seventeen public pages to issue a second request per entry
# (an N+1 on a library page listing hundreds of rows), the entry payload keeps
# carrying those keys, now DERIVED from media_credit/media_tag instead of
# stored. The names are the legacy ones on purpose - `sheet_column_for` already
# owns that mapping for the Sheets export, the Add/Modify form state already
# uses them, and reusing it keeps one vocabulary at the API edge instead of two.
#
# These are READ-ONLY: they live on the *Response schemas only, never on the
# Create/Update bases, so a write that names them is still rejected rather
# than silently stored. Writes go through PUT /api/credits.
# ---------------------------------------------------------------------------


def legacy_link_fields(media_type: str) -> tuple[tuple[str, str, str], ...]:
    """
    (payload attribute, kind, role/field key) for one media type.

    kind is "credit" or "tag" - the two link tables are read separately.
    """
    out = [
        (sheet_column_for(media_type, role.key), "credit", role.key)
        for role in credit_roles_for(media_type)
    ]
    out += [
        (sheet_column_for(media_type, field.key), "tag", field.key)
        for field in tag_fields_for(media_type)
    ]
    return tuple(out)


def _link_rows_and_lookups(db: Session, media_type: str, entry_ids: list[UUID]):
    """
    One query each for the credit rows, tag rows, and the entities they
    reference (people, studios, publishers, options) for a batch of entries.

    Shared by `link_values_for_entries` and `attach_link_fields`'s
    `studio_refs` build, so having both read from the same batch costs no
    extra queries - five total regardless of how many entries are passed.
    """
    if not entry_ids:
        return [], [], {}, {}, {}, {}

    credit_rows = (
        db.query(models.MediaCredit)
        .filter(
            models.MediaCredit.media_id.in_(entry_ids),
        )
        .order_by(models.MediaCredit.position)
        .all()
    )
    tag_rows = (
        db.query(models.MediaTag)
        .filter(
            models.MediaTag.media_id.in_(entry_ids),
        )
        .order_by(models.MediaTag.position)
        .all()
    )

    person_ids = {r.person_id for r in credit_rows if r.person_id}
    studio_ids = {r.studio_id for r in credit_rows if r.studio_id}
    publisher_ids = {r.publisher_id for r in credit_rows if r.publisher_id}
    option_ids = {r.option_id for r in tag_rows}

    # The row rather than just its display name: credit_refs need public_id
    # too, and this is the only query that loads these people.
    people = (
        {
            p.system_id: p
            for p in db.query(models.Person)
            .filter(models.Person.system_id.in_(person_ids))
            .all()
        }
        if person_ids
        else {}
    )
    studios = (
        {
            s.system_id: s
            for s in db.query(models.Studio)
            .filter(models.Studio.system_id.in_(studio_ids))
            .all()
        }
        if studio_ids
        else {}
    )
    publishers = (
        {
            p.system_id: p
            for p in db.query(models.Publisher)
            .filter(models.Publisher.system_id.in_(publisher_ids))
            .all()
        }
        if publisher_ids
        else {}
    )
    options = (
        {
            o.system_id: o.value
            for o in db.query(models.SystemOption)
            .filter(models.SystemOption.system_id.in_(option_ids))
            .all()
        }
        if option_ids
        else {}
    )
    return credit_rows, tag_rows, people, studios, publishers, options


def _values_from_rows(
    entry_ids: list[UUID], credit_rows, tag_rows, people, studios, publishers,
    options,
) -> dict[UUID, dict[str, list[str]]]:
    out: dict[UUID, dict[str, list[str]]] = {eid: {} for eid in entry_ids}

    for row in credit_rows:
        if row.person_id:
            person = people.get(row.person_id)
            name = person.display_name if person else None
        elif row.studio_id:
            studio = studios.get(row.studio_id)
            name = studio.display_name if studio else None
        else:
            publisher = publishers.get(row.publisher_id)
            name = publisher.display_name if publisher else None
        if name is None or row.media_id not in out:
            continue
        out[row.media_id].setdefault(row.role, []).append(name)

    for row in tag_rows:
        value = options.get(row.option_id)
        if value is None or row.media_id not in out:
            continue
        out[row.media_id].setdefault(row.field, []).append(value)

    return out


def link_values_for_entries(
    db: Session, media_type: str, entry_ids: list[UUID]
) -> dict[UUID, dict[str, list[str]]]:
    """
    Every credit and tag for a batch of entries, in a fixed number of queries.

    Returns {entry_id: {role_or_field_key: [name, ...]}}. Five queries total
    regardless of how many entries are passed - `credit_names`/`tag_values`
    issue one query each and are fine for a single entry, but a list endpoint
    calling them per row is the N+1 this function exists to avoid.
    """
    if not entry_ids:
        return {}
    (
        credit_rows,
        tag_rows,
        people,
        studios,
        publishers,
        options,
    ) = _link_rows_and_lookups(db, media_type, entry_ids)
    return _values_from_rows(
        entry_ids, credit_rows, tag_rows, people, studios, publishers, options
    )


def attach_link_fields(db: Session, media_type: str, entries) -> None:
    """
    Set the legacy-named, comma-joined link attributes on ORM entries in place.

    Mirrors how `attach_plan_flag` decorates an entry with a value that is not
    a column of its own table; the response schema then reads it like any other
    attribute. Accepts one entry or a sequence.

    Every type also gets `credit_refs`: the same PERSON credit rows keyed by
    role, shaped as {system_id, display_name, label} so a detail page can link
    to the person - the legacy strings beside them carry no ids. Anime and
    anime-movie additionally get `studio_refs`, the studio half of the same
    idea; studio is a single role, so those need no role key.

    Both are built from the same batched `_link_rows_and_lookups` fetch as the
    rest of this function, so adding them costs no extra query - still five
    total, regardless of how many entries are passed.
    """
    if entries is None:
        return
    rows = list(entries) if isinstance(entries, (list, tuple)) else [entries]
    if not rows:
        return

    # Deliberately not `if not spec: return` any more: a media type with no
    # legacy link field of its own still has person credits to link to.
    spec = legacy_link_fields(media_type)

    entry_ids = [e.system_id for e in rows]
    (
        credit_rows,
        tag_rows,
        people,
        studios,
        publishers,
        options,
    ) = _link_rows_and_lookups(db, media_type, entry_ids)
    values = _values_from_rows(
        entry_ids, credit_rows, tag_rows, people, studios, publishers, options
    )

    credit_refs_by_entry: dict[UUID, dict[str, list[PersonRef]]] = {}
    for row in credit_rows:
        if not row.person_id:
            continue
        person = people.get(row.person_id)
        if person is None or not person.display_name:
            continue
        credit_refs_by_entry.setdefault(row.media_id, {}).setdefault(
            row.role, []
        ).append(
            PersonRef(
                system_id=row.person_id,
                public_id=person.public_id,
                display_name=person.display_name,
                label=credit_label(row.role, media_type),
            )
        )

    wants_studio_refs = media_type in ("anime", "anime-movie")
    studio_refs_by_entry: dict[UUID, list[StudioRef]] = {}
    if wants_studio_refs:
        for row in credit_rows:
            if row.role != "studio" or not row.studio_id:
                continue
            studio = studios.get(row.studio_id)
            if studio is None:
                continue
            studio_refs_by_entry.setdefault(row.media_id, []).append(
                StudioRef(
                    system_id=studio.system_id,
                    public_id=studio.public_id,
                    display_name=studio.display_name,
                )
            )

    # Same idea as studio_refs, for the third entity target. Offered to any
    # media type whose roles include a publisher, rather than to a hand-listed
    # pair, so a new type gains it by declaring the role.
    wants_publisher_refs = any(
        r.key == "publisher" for r in credit_roles_for(media_type)
    )
    publisher_refs_by_entry: dict[UUID, list[PublisherRef]] = {}
    if wants_publisher_refs:
        for row in credit_rows:
            if row.role != "publisher" or not row.publisher_id:
                continue
            publisher = publishers.get(row.publisher_id)
            if publisher is None:
                continue
            publisher_refs_by_entry.setdefault(row.media_id, []).append(
                PublisherRef(
                    system_id=publisher.system_id,
                    public_id=publisher.public_id,
                    display_name=publisher.display_name,
                    label=credit_label(row.role, media_type),
                )
            )

    for entry in rows:
        per_entry = values.get(entry.system_id, {})
        for attr, _kind, key in spec:
            names = per_entry.get(key) or []
            setattr(entry, attr, ", ".join(names) if names else None)
        entry.credit_refs = credit_refs_by_entry.get(entry.system_id, {})
        if wants_studio_refs:
            entry.studio_refs = studio_refs_by_entry.get(entry.system_id, [])
        if wants_publisher_refs:
            entry.publisher_refs = publisher_refs_by_entry.get(entry.system_id, [])
