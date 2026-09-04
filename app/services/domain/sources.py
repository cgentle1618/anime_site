"""
Reading and writing media_source rows.

Modelled on services.domain.credits: the read path is batched (one query for
rows, one for the options they cite) because attach runs on every list
endpoint, and the write path is a whole-set replace that does not commit -
the caller owns the transaction.
"""

from uuid import UUID

from sqlalchemy.orm import Session

from app import models
from app.schemas.sources import SourceRef
from app.utils.source_fields import FREE_FORM_BUCKETS, category_for_kind


def _option_lookup(db: Session, option_ids: set[UUID]) -> dict[UUID, str]:
    if not option_ids:
        return {}
    rows = (
        db.query(models.SystemOption.system_id, models.SystemOption.value)
        .filter(models.SystemOption.system_id.in_(option_ids))
        .all()
    )
    return {system_id: value for system_id, value in rows}


def attach_sources(
    db: Session, media_type: str, entries, viewer=None
) -> None:
    """
    Set `entry.sources` on ORM entries in place.

    Rows in a bucket the viewer is not granted are dropped here rather than in
    field_gate.gate(), because the filtering is partial: a viewer may hold
    `other` and not `restricted`, so the attribute cannot simply be blanked.
    """
    # Imported here: field_groups imports credits, and credits must not import
    # rbac back at module scope.
    from app.services.rbac.field_gate import gated_source_buckets

    if entries is None:
        return
    rows_in = list(entries) if isinstance(entries, (list, tuple)) else [entries]
    if not rows_in:
        return

    withheld = set(gated_source_buckets(viewer))
    entry_ids = [e.system_id for e in rows_in]

    query = db.query(models.MediaSource).filter(
        models.MediaSource.media_type == media_type,
        models.MediaSource.entry_id.in_(entry_ids),
    )
    if withheld:
        query = query.filter(models.MediaSource.bucket.notin_(withheld))
    source_rows = query.order_by(models.MediaSource.position).all()

    options = _option_lookup(
        db, {r.option_id for r in source_rows if r.option_id}
    )

    by_entry: dict[UUID, list[SourceRef]] = {}
    for row in source_rows:
        name = row.name if row.option_id is None else options.get(row.option_id)
        if not name:
            # The option was deleted out from under the row. Skip rather than
            # render a nameless link.
            continue
        by_entry.setdefault(row.entry_id, []).append(
            SourceRef(
                system_id=row.system_id,
                kind=row.kind,
                bucket=row.bucket,
                name=name,
                available=row.available,
                url=row.url,
                position=row.position,
            )
        )

    for entry in rows_in:
        entry.sources = by_entry.get(entry.system_id, [])


def replace_sources(
    db: Session, media_type: str, entry_id: UUID, payload: list[dict]
) -> None:
    """
    Make the entry's sources exactly `payload`, in that order.

    A row is a dict of kind, bucket, name, and optionally url and available.
    `name` is resolved against the vocabulary for `main` rows and stored as
    typed text for the free-form buckets. Does not commit.
    """
    from app.services.domain.credits import resolve_option

    db.query(models.MediaSource).filter_by(
        media_type=media_type, entry_id=entry_id
    ).delete(synchronize_session=False)

    for position, item in enumerate(payload or []):
        name = (item.get("name") or "").strip()
        if not name:
            continue
        kind = item.get("kind") or "access"
        bucket = item.get("bucket") or "other"

        option_id = None
        stored_name = name
        if bucket not in FREE_FORM_BUCKETS:
            option = resolve_option(db, category_for_kind(kind), name)
            option_id = option.system_id
            stored_name = None

        db.add(
            models.MediaSource(
                media_type=media_type,
                entry_id=entry_id,
                kind=kind,
                bucket=bucket,
                option_id=option_id,
                name=stored_name,
                available=item.get("available"),
                url=(item.get("url") or None),
                position=position,
            )
        )
    db.flush()


def delete_sources_for(db: Session, media_type: str, entry_id: UUID) -> int:
    """Remove every source row for one entry. Nothing cascades - no FK."""
    return (
        db.query(models.MediaSource)
        .filter_by(media_type=media_type, entry_id=entry_id)
        .delete(synchronize_session=False)
    )


def media_sources_writer(media_type: str):
    """
    Build the `nested_collections` adapter for one media type.

    A factory rather than a plain function because entries do not carry their
    own media type - the registry knows it, so it is closed over at spec
    declaration time. See app/routers/_factory.py:83-96.
    """

    def write(db: Session, entry, value) -> None:
        replace_sources(db, media_type, entry.system_id, value or [])

    return write
