"""
routers/form_defaults.py
Handles the admin "Form Defaults" page (/defaults).

Lets the admin configure, per media type, the initial value of every Add-form
field and which fields the "auto-fill from existing entry" feature copies.

Stored in the existing system_configs key/value table, one row per media type,
keyed as 'form_defaults:<media_type>' with a JSON blob as the value. The prefix
namespaces them away from other config keys (e.g. 'announcement:<title>',
'current_season').

Everything here is admin-only — there is no guest surface for form config.

Note on validation: `defaults` is a SPARSE override map keyed by frontend form
field names. Those names live in frontend/src/config/formFactories.js and are
not mirrored here — duplicating ~280 keys in Python would guarantee drift.
This module validates shape and size only; the frontend's resolveDefaults()
drops any stored key that no longer exists in a form factory.
"""

import json
import logging
from typing import Dict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app import models, schemas
from app.dependencies import get_current_admin, get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/form-defaults", tags=["Form Defaults"])

FORM_DEFAULTS_PREFIX = "form_defaults:"
MAX_PAYLOAD_BYTES = 32 * 1024

# Mirrors the media-type slugs in frontend/src/config/mediaRegistry.js.
VALID_MEDIA_TYPES = frozenset(
    {
        "anime",
        "anime-movie",
        "movie",
        "tv-show",
        "cartoon",
        "manga",
        "novel",
        "comic",
        "collection",
        "franchise",
        "series",
    }
)


def _to_key(media_type: str) -> str:
    """Builds the system_configs key for a media type's form defaults."""
    return f"{FORM_DEFAULTS_PREFIX}{media_type}"


def _to_media_type(config_key: str) -> str:
    """Strips the prefix off a system_configs key to recover the media type."""
    return config_key[len(FORM_DEFAULTS_PREFIX):]


def _validate_media_type(media_type: str) -> str:
    """Rejects media types that aren't one of the known form tabs."""
    if media_type not in VALID_MEDIA_TYPES:
        raise HTTPException(
            status_code=400, detail=f"Unknown media type '{media_type}'."
        )
    return media_type


def _get_row(db: Session, media_type: str):
    """Fetches the system_configs row backing a media type's defaults, or None."""
    return (
        db.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key == _to_key(media_type))
        .first()
    )


def _parse(row) -> schemas.FormDefaultsPayload:
    """Decodes a stored row, treating unreadable JSON as 'not configured'."""
    try:
        return schemas.FormDefaultsPayload(**json.loads(row.config_value))
    except Exception:
        logger.warning(
            "Ignoring unreadable form defaults in '%s'.", row.config_key, exc_info=True
        )
        return schemas.FormDefaultsPayload()


def _serialize(payload: schemas.FormDefaultsPayload) -> str:
    """Encodes a payload for storage, guarding against a runaway blob."""
    encoded = json.dumps(payload.model_dump(), ensure_ascii=False)
    if len(encoded.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Form defaults cannot exceed {MAX_PAYLOAD_BYTES // 1024} KB.",
        )
    return encoded


# ==========================================
# PROTECTED OPERATIONS (Admin Only)
# ==========================================


@router.get(
    "/",
    response_model=Dict[str, schemas.FormDefaultsResponse],
    summary="List All Form Defaults",
)
def list_form_defaults(
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Returns every configured media type's form defaults, keyed by media type.

    Unconfigured types are omitted — the frontend falls back to its built-in
    factory values for anything missing here.
    """
    rows = (
        db.query(models.SystemConfigs)
        .filter(models.SystemConfigs.config_key.like(f"{FORM_DEFAULTS_PREFIX}%"))
        .all()
    )

    result = {}
    for row in rows:
        media_type = _to_media_type(row.config_key)
        if media_type not in VALID_MEDIA_TYPES:
            continue
        payload = _parse(row)
        result[media_type] = schemas.FormDefaultsResponse(
            media_type=media_type, **payload.model_dump()
        )
    return result


@router.get(
    "/{media_type}",
    response_model=schemas.FormDefaultsResponse,
    summary="Get Form Defaults",
)
def get_form_defaults(
    media_type: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Returns one media type's form defaults.

    An unconfigured type is a normal state, not an error — it returns an empty
    payload so the client never has to branch on 404.
    """
    _validate_media_type(media_type)

    row = _get_row(db, media_type)
    payload = _parse(row) if row else schemas.FormDefaultsPayload()
    return schemas.FormDefaultsResponse(media_type=media_type, **payload.model_dump())


@router.put("/{media_type}", summary="Save Form Defaults")
def save_form_defaults(
    media_type: str,
    payload: schemas.FormDefaultsPayload,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Replaces a media type's form defaults wholesale (upsert)."""
    _validate_media_type(media_type)
    encoded = _serialize(payload)

    row = _get_row(db, media_type)
    if row:
        row.config_value = encoded
    else:
        db.add(
            models.SystemConfigs(config_key=_to_key(media_type), config_value=encoded)
        )
    db.commit()
    return {
        "message": f"Form defaults for '{media_type}' saved successfully.",
        "media_type": media_type,
    }


@router.delete("/{media_type}", summary="Reset Form Defaults")
def reset_form_defaults(
    media_type: str,
    db: Session = Depends(get_db),
    admin: dict = Depends(get_current_admin),
):
    """Deletes a media type's stored defaults, reverting it to the built-ins.

    Idempotent — resetting an already-unconfigured type is a success, since the
    end state the caller asked for is the state that already holds.
    """
    _validate_media_type(media_type)

    row = _get_row(db, media_type)
    if row:
        db.delete(row)
        db.commit()
    return {
        "message": f"Form defaults for '{media_type}' reset to built-in values.",
        "media_type": media_type,
    }
