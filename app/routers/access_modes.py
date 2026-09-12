"""
Editing the object axis.

An access mode is a named ceiling on which OBJECTS a session may reach. This
router is its admin surface, shaped on roles.py route for route so that two
pages doing the same shape of job read the same way.

Two deliberate differences from roles:

  - `/catalog` returns two labelled groups - Content Labels and Field Groups -
    rather than permission families, and lists EVERY content label including
    ones no mode carries. A label carried by no mode hides its entries from
    everybody, and the page cannot warn about what it is not told.
  - The guest default MOVES rather than raising. A partial unique index
    permits one flagged mode; letting the index enforce it would surface as a
    500, so the write clears the old flag in the same transaction.

Everything here is `admin.authz`, not `manage.catalog`: this changes who may
reach what, which is the authorization surface. A `super` manages the
catalogue and is deliberately refused.
"""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_db
from app.services.rbac import cache
from app.services.rbac.field_groups import FIELD_GROUP_KEYS, FIELD_GROUPS
from app.services.rbac.resolver import require_admin_authz
from app.services.rbac.seed_modes import MODE_UNRESTRICTED

router = APIRouter(
    prefix="/api/access-modes",
    tags=["Access Modes"],
    dependencies=[Depends(require_admin_authz)],
)


def _get_or_404(db: Session, mode_id: UUID) -> models.AccessMode:
    row = db.get(models.AccessMode, mode_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Access mode not found.")
    return row


def _label_keys(db: Session, mode_id: UUID) -> List[str]:
    return sorted(
        key
        for (key,) in db.query(models.ContentLabel.key)
        .join(
            models.AccessModeLabel,
            models.AccessModeLabel.label_id == models.ContentLabel.system_id,
        )
        .filter(models.AccessModeLabel.mode_id == mode_id)
    )


def _field_group_keys(db: Session, mode_id: UUID) -> List[str]:
    return sorted(
        key
        for (key,) in db.query(models.AccessModeFieldGroup.field_group_key).filter(
            models.AccessModeFieldGroup.mode_id == mode_id
        )
    )


def _is_unrestricted(mode: models.AccessMode) -> bool:
    return mode.key == MODE_UNRESTRICTED


def _to_response(db: Session, mode: models.AccessMode) -> schemas.AccessModeResponse:
    # `unrestricted` REPORTS what it resolves to, not what its rows say. The
    # two are the same in practice - the seed and create_label both write the
    # rows - but only the derivation is guaranteed, and a page drawing the
    # rows would show an admin an unticked box that does nothing.
    if _is_unrestricted(mode):
        label_keys = sorted(key for (key,) in db.query(models.ContentLabel.key))
        field_group_keys = sorted(FIELD_GROUP_KEYS)
    else:
        label_keys = _label_keys(db, mode.system_id)
        field_group_keys = _field_group_keys(db, mode.system_id)
    return schemas.AccessModeResponse(
        system_id=mode.system_id,
        key=mode.key,
        label=mode.label,
        description=mode.description,
        sort_order=mode.sort_order,
        is_system=mode.is_system,
        is_guest_default=mode.is_guest_default,
        label_keys=label_keys,
        field_group_keys=field_group_keys,
        user_count=db.query(models.UserAccessMode)
        .filter(models.UserAccessMode.mode_id == mode.system_id)
        .count(),
    )


def _validate_items(db: Session, items: schemas.AccessModeItems) -> None:
    """Reject a key naming nothing, rather than storing an inert row.

    The same contract role_permission.permission has: a grant that names
    nothing would be silently ignored at read time, which is indistinguishable
    from a typo doing something.
    """
    unknown_groups = set(items.field_group_keys) - set(FIELD_GROUP_KEYS)
    if unknown_groups:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown field group(s): {', '.join(sorted(unknown_groups))}.",
        )
    known_labels = {key for (key,) in db.query(models.ContentLabel.key)}
    unknown_labels = set(items.label_keys) - known_labels
    if unknown_labels:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown content label(s): {', '.join(sorted(unknown_labels))}.",
        )


def _replace_items(
    db: Session, mode: models.AccessMode, items: schemas.AccessModeItems
) -> None:
    """Replace both sets wholesale - one write, no partial states."""
    db.query(models.AccessModeLabel).filter(
        models.AccessModeLabel.mode_id == mode.system_id
    ).delete(synchronize_session=False)
    db.query(models.AccessModeFieldGroup).filter(
        models.AccessModeFieldGroup.mode_id == mode.system_id
    ).delete(synchronize_session=False)

    ids = {
        key: system_id
        for system_id, key in db.query(
            models.ContentLabel.system_id, models.ContentLabel.key
        )
    }
    for key in sorted(set(items.label_keys)):
        db.add(
            models.AccessModeLabel(mode_id=mode.system_id, label_id=ids[key])
        )
    for key in sorted(set(items.field_group_keys)):
        db.add(
            models.AccessModeFieldGroup(
                mode_id=mode.system_id, field_group_key=key
            )
        )


@router.get("/", response_model=List[schemas.AccessModeResponse])
def list_modes(db: Session = Depends(get_db)):
    modes = (
        db.query(models.AccessMode)
        .order_by(models.AccessMode.sort_order, models.AccessMode.key)
        .all()
    )
    return [_to_response(db, mode) for mode in modes]


@router.get("/catalog", response_model=List[schemas.AccessModeCatalogGroup])
def get_catalog(db: Session = Depends(get_db)):
    """Everything a mode can carry, grouped for the editor.

    EVERY content label is listed, with how many modes carry it. A count of
    zero is the case the page exists to surface: that label's entries are
    hidden from everyone, the owner included, and there is nowhere else to
    find that out.
    """
    # One row per (label, mode) pair, with a NULL link for a label no mode
    # carries - so an outer join and a count in Python, not a GROUP BY that
    # would drop the zero rows this endpoint exists to report.
    counts: dict[str, int] = {}
    labels: dict[str, models.ContentLabel] = {}
    for label, link_id in (
        db.query(models.ContentLabel, models.AccessModeLabel.system_id)
        .outerjoin(
            models.AccessModeLabel,
            models.AccessModeLabel.label_id == models.ContentLabel.system_id,
        )
        .order_by(models.ContentLabel.sort_order, models.ContentLabel.key)
        .all()
    ):
        labels.setdefault(label.key, label)
        counts[label.key] = counts.get(label.key, 0) + (1 if link_id else 0)

    group_counts: dict[str, int] = {}
    for (key,) in db.query(models.AccessModeFieldGroup.field_group_key):
        group_counts[key] = group_counts.get(key, 0) + 1

    return [
        schemas.AccessModeCatalogGroup(
            group="label",
            label="Content Labels",
            items=[
                schemas.AccessModeCatalogItem(
                    key=label.key,
                    label=label.label,
                    description=label.description,
                    mode_count=counts.get(label.key, 0),
                )
                for label in labels.values()
            ],
        ),
        schemas.AccessModeCatalogGroup(
            group="field_group",
            label="Field Groups",
            items=[
                schemas.AccessModeCatalogItem(
                    key=group.key,
                    label=group.label,
                    description=group.description,
                    mode_count=group_counts.get(group.key, 0),
                )
                for group in FIELD_GROUPS.values()
            ],
        ),
    ]


@router.get("/{mode_id}", response_model=schemas.AccessModeResponse)
def get_mode(mode_id: UUID, db: Session = Depends(get_db)):
    return _to_response(db, _get_or_404(db, mode_id))


@router.post("/", response_model=schemas.AccessModeResponse, status_code=201)
def create_mode(payload: schemas.AccessModeCreate, db: Session = Depends(get_db)):
    if db.query(models.AccessMode).filter(models.AccessMode.key == payload.key).first():
        raise HTTPException(
            status_code=409, detail="An access mode with that key exists."
        )
    _validate_items(db, payload)

    mode = models.AccessMode(
        key=payload.key,
        label=payload.label,
        description=payload.description,
        sort_order=payload.sort_order,
        # Never through the API: is_system marks the four the seeder
        # maintains, and a mode created here is not one of them.
        is_system=False,
        is_guest_default=False,
    )
    db.add(mode)
    db.flush()
    _replace_items(db, mode, payload)
    db.commit()
    cache.bump()
    return _to_response(db, mode)


@router.patch("/{mode_id}", response_model=schemas.AccessModeResponse)
def update_mode(
    mode_id: UUID, payload: schemas.AccessModeUpdate, db: Session = Depends(get_db)
):
    mode = _get_or_404(db, mode_id)
    for field in ("label", "description", "sort_order"):
        value = getattr(payload, field)
        if value is not None:
            setattr(mode, field, value)

    if payload.is_guest_default is True:
        # MOVE it rather than letting ix_one_guest_default_access_mode raise.
        # The index is the guarantee; this is the write doing what was asked
        # instead of handing the caller a 500 to interpret.
        db.query(models.AccessMode).filter(
            models.AccessMode.system_id != mode.system_id
        ).update({"is_guest_default": False}, synchronize_session=False)
        mode.is_guest_default = True
    elif payload.is_guest_default is False:
        # Clearing the last flag is allowed: the resolver falls back to the
        # EMPTY set when none is flagged, which hides everything from a guest
        # rather than publishing it. Fail-closed, so this needs no guard.
        mode.is_guest_default = False

    db.commit()
    cache.bump()
    return _to_response(db, mode)


@router.put("/{mode_id}/grants", response_model=schemas.AccessModeResponse)
def replace_grants(
    mode_id: UUID, payload: schemas.AccessModeItems, db: Session = Depends(get_db)
):
    mode = _get_or_404(db, mode_id)
    if _is_unrestricted(mode):
        # Enforced here and not only in the SPA, which draws these boxes
        # disabled. 409 rather than accepting and ignoring: an admin who sends
        # a narrower set has to be told it was not applied, or the page and
        # the database disagree silently about who can see what.
        raise HTTPException(
            status_code=409,
            detail=(
                "The Unrestricted mode carries every label and every field "
                "group by definition; its grants cannot be edited."
            ),
        )
    _validate_items(db, payload)
    _replace_items(db, mode, payload)
    db.commit()
    # Without this the change would not be felt until the process restarted -
    # _MODE_CACHE is keyed on mode_id and this is exactly what it caches.
    cache.bump()
    return _to_response(db, mode)


@router.delete("/{mode_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_mode(mode_id: UUID, db: Session = Depends(get_db)):
    mode = _get_or_404(db, mode_id)
    if mode.is_system:
        raise HTTPException(
            status_code=409, detail="A system access mode cannot be deleted."
        )
    holders = (
        db.query(models.UserAccessMode)
        .filter(models.UserAccessMode.mode_id == mode.system_id)
        .count()
    )
    if holders:
        # The FK would cascade the grants away and silently narrow those
        # accounts - possibly to nothing, if this was their only mode. Refuse
        # and make the reassignment deliberate, as roles.py does for a held
        # role.
        raise HTTPException(
            status_code=409,
            detail=f"{holders} account(s) still hold this access mode.",
        )
    db.delete(mode)
    db.commit()
    cache.bump()
    return None
