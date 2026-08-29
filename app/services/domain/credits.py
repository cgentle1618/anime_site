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
from app.utils.credit_roles import (
    CREDIT_ROLES,
    TAG_FIELDS,
    credit_roles_for,
    director_scope_for,
    sheet_column_for,
    tag_fields_for,
)
from app.utils.name_normalize import normalize_name, split_names

logger = logging.getLogger(__name__)


def _find_by_name(db: Session, model, name: str):
    """
    Find an entity whose stored name normalizes to the same key.

    Linear scan over the whole table in Python rather than a SQL filter -
    normalize_name folds width/case/whitespace in ways SQL can't express
    portably, and these tables are small enough that this stays cheap.
    """
    key = normalize_name(name)
    for row in db.query(model).all():
        if normalize_name(row.name_native) == key:
            return row
        if row.name_en and normalize_name(row.name_en) == key:
            return row
    return None


def resolve_person(
    db: Session, name: str, *, role: str, scope: Optional[str] = None
) -> models.Person:
    """Find or create the person, and make sure they hold the given role."""
    person = _find_by_name(db, models.Person, name)
    if person is None:
        person = models.Person(name_native=name.strip())
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
    """Find or create the studio."""
    studio = _find_by_name(db, models.Studio, name)
    if studio is None:
        studio = models.Studio(name_native=name.strip())
        db.add(studio)
        db.flush()
    return studio


def resolve_option(
    db: Session, category: str, value: str, *, scope: Optional[str] = None
) -> models.SystemOption:
    """Find or create the vocabulary value, and record the scope it is used in."""
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


def replace_credits(
    db: Session, media_type: str, entry_id: UUID, role: str, names: list[str]
) -> None:
    """Make the entry's credits for one role exactly `names`, in that order."""
    spec = CREDIT_ROLES[role]

    db.query(models.MediaCredit).filter_by(
        media_type=media_type, entry_id=entry_id, role=role
    ).delete(synchronize_session=False)

    for position, name in enumerate(names):
        if spec.target == "studio":
            target = resolve_studio(db, name)
            row = models.MediaCredit(
                media_type=media_type,
                entry_id=entry_id,
                role=role,
                studio_id=target.system_id,
                position=position,
            )
        else:
            scope = (
                director_scope_for(media_type)
                if spec.person_role == "director"
                else None
            )
            target = resolve_person(
                db, name, role=spec.person_role, scope=scope
            )
            row = models.MediaCredit(
                media_type=media_type,
                entry_id=entry_id,
                role=role,
                person_id=target.system_id,
                position=position,
            )
        db.add(row)
    db.flush()


def replace_tags(
    db: Session, media_type: str, entry_id: UUID, field: str, values: list[str]
) -> None:
    """Make the entry's tags for one field exactly `values`, in that order."""
    spec = TAG_FIELDS[field]

    db.query(models.MediaTag).filter_by(
        media_type=media_type, entry_id=entry_id, field=field
    ).delete(synchronize_session=False)

    for position, value in enumerate(values):
        option = resolve_option(db, spec.category, value, scope=media_type)
        db.add(
            models.MediaTag(
                media_type=media_type,
                entry_id=entry_id,
                field=field,
                option_id=option.system_id,
                position=position,
            )
        )
    db.flush()


def credit_names(
    db: Session, media_type: str, entry_id: UUID, role: str
) -> list[str]:
    """The entry's credited names for one role, in stored order."""
    rows = (
        db.query(models.MediaCredit)
        .filter_by(media_type=media_type, entry_id=entry_id, role=role)
        .order_by(models.MediaCredit.position)
        .all()
    )
    out = []
    for row in rows:
        if row.person_id:
            entity = db.get(models.Person, row.person_id)
        else:
            entity = db.get(models.Studio, row.studio_id)
        if entity is not None:
            out.append(entity.name_native)
    return out


def tag_values(
    db: Session, media_type: str, entry_id: UUID, field: str
) -> list[str]:
    """The entry's vocabulary values for one field, in stored order."""
    rows = (
        db.query(models.MediaTag)
        .filter_by(media_type=media_type, entry_id=entry_id, field=field)
        .order_by(models.MediaTag.position)
        .all()
    )
    out = []
    for row in rows:
        option = db.get(models.SystemOption, row.option_id)
        if option is not None:
            out.append(option.value)
    return out


def credits_to_sheet_value(
    db: Session, media_type: str, entry_id: UUID, role: str
) -> str:
    """Comma-joined names, the shape the entry sheet columns keep."""
    return ", ".join(credit_names(db, media_type, entry_id, role))


def tags_to_sheet_value(
    db: Session, media_type: str, entry_id: UUID, field: str
) -> str:
    """Comma-joined values, the shape the entry sheet columns keep."""
    return ", ".join(tag_values(db, media_type, entry_id, field))


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
        credits_to_sheet_value(db, media_type, entry.system_id, role.key)
        for role in credit_roles_for(media_type)
    ]
    values += [
        tags_to_sheet_value(db, media_type, entry.system_id, field.key)
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
    ("tv-show", "source_official", "tag", "source_official"),
    ("cartoon", "source_official", "tag", "source_official"),
    ("manga", "author_plot", "credit", "manga_author_plot"),
    ("manga", "author_draw", "credit", "manga_author_draw"),
    ("manga", "publisher_tw", "tag", "publisher_tw"),
    ("novel", "author", "credit", "novel_author"),
    ("novel", "illustrator", "credit", "novel_illustrator"),
    ("novel", "publisher_tw", "tag", "publisher_tw"),
    ("comic", "writer", "credit", "comic_writer"),
    ("comic", "artist", "credit", "comic_artist"),
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
        model = MEDIA_TABLES[media_type].model
        if not hasattr(model, column):
            continue

        for entry in db.query(model).all():
            raw = getattr(entry, column, None)
            if not raw:
                continue

            names = split_names(raw)
            dropped = [f for f in str(raw).split(",") if f.strip() == ""]
            if dropped:
                unplaced.append(
                    {
                        "media_type": media_type,
                        "entry_id": str(entry.system_id),
                        "column": column,
                        "raw": raw,
                        "reason": "empty fragment",
                    }
                )
            if not names:
                continue

            if kind == "credit":
                replace_credits(db, media_type, entry.system_id, key, names)
                credits_written += len(names)
            else:
                replace_tags(db, media_type, entry.system_id, key, names)
                tags_written += len(names)

    db.commit()

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
                current = credit_names(db, media_type, row.system_id, key)
            else:
                current = tag_values(db, media_type, row.system_id, key)
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
