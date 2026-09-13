"""
Hand-maintained exchange rates, used to convert game spend on /statistics.

Two endpoints rather than the pair in system.py, and the reason is the gate.
Every route in system.py sits behind require_manage_pipelines, but /statistics
only asks for self.list - so a signed-in member who can see the spend block
cannot read a rate served from there, and the converted totals would silently
vanish for everyone but an admin. The read is therefore open and only the
write is gated.

The rates are typed by hand and stored, never fetched. That is deliberate:
a personal collection's spend does not need live FX, and a stored rate with
an `as_of` date beside it is honest in a way a stale cached fetch is not.
They live in system_configs, which is a backed-up sheet tab, so a rate
entered on one machine reaches the other by Backup / Pull All.
"""

import json
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from app import schemas
from app.dependencies import get_db
from app.services.rbac.resolver import require_manage_pipelines

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/fx-rates", tags=["FX Rates"])

CONFIG_KEY = "fx_rates"


@router.get("", response_model=schemas.FxRatesResponse, summary="Get FX Rates")
@router.get("/", response_model=schemas.FxRatesResponse, include_in_schema=False)
def get_fx_rates(db: Session = Depends(get_db)):
    """
    The stored rates, or an empty set when none have been entered.

    Unset is a normal state, not an error: the page renders per-currency
    subtotals and prints no converted total at all. Same answer for a row
    that will not parse - a half-read rate table is worse than none, because
    the number it produces looks exactly like a real one.
    """
    row = db.execute(
        text("SELECT config_value FROM system_configs WHERE config_key = :key"),
        {"key": CONFIG_KEY},
    ).fetchone()
    if not row:
        return schemas.FxRatesResponse()

    try:
        stored = json.loads(row[0])
        return schemas.FxRatesResponse(**stored)
    except (ValueError, TypeError):
        logger.warning("system_configs['%s'] is not readable; serving no rates.", CONFIG_KEY)
        return schemas.FxRatesResponse()


@router.put(
    "",
    response_model=schemas.FxRatesResponse,
    dependencies=[Depends(require_manage_pipelines)],
    summary="Set FX Rates",
)
@router.put(
    "/",
    response_model=schemas.FxRatesResponse,
    dependencies=[Depends(require_manage_pipelines)],
    include_in_schema=False,
)
def set_fx_rates(payload: schemas.FxRatesUpdate, db: Session = Depends(get_db)):
    """Upserts the whole rate table - it is one config row, so it moves whole."""
    # The base has to be convertible to itself or every total through it is
    # wrong by whatever the caller happened to put there.
    rates = {**payload.rates, payload.base: 1.0}
    stored = {"base": payload.base, "as_of": payload.as_of, "rates": rates}

    db.execute(
        text(
            """
            INSERT INTO system_configs (config_key, config_value)
            VALUES (:key, :val)
            ON CONFLICT (config_key)
            DO UPDATE SET config_value = EXCLUDED.config_value
            """
        ),
        {"key": CONFIG_KEY, "val": json.dumps(stored)},
    )
    db.commit()
    return schemas.FxRatesResponse(**stored)
