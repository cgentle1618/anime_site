"""
The one Fill / Replace runner.

Every media type used to carry its own ~100-line copy of the same SSE loop
(seven Fill copies, seven bulk-Replace copies, eight single-Replace copies, and
two "run them all" orchestrators). The copies had already drifted: different
sleeps, one re-raising CancelledError, sub-pipelines double-logging under
"Fill All". Everything that varies per type is declared in `specs.py`; the
shape of a run is declared here, once.

External fetches are synchronous (`requests` + rate-limiter sleeps), so they
run in a worker thread: an `await` on the event loop while Tenrai/TMDB is
being waited on keeps the SSE stream and every other request alive.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from typing import Any, Callable, Optional

from fastapi import Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from app.utils.data_control_utils import log_data_control

logger = logging.getLogger(__name__)

Step = tuple[str, Callable[[Session], None]]


@dataclass(frozen=True)
class PipelineSpec:
    key: str                     # hyphenated media type, e.g. "anime-movie"
    label: str                   # "Anime Movie" -> "Fill Anime Movie"
    model: type
    # ---- Fill -------------------------------------------------------------
    extract_id: Optional[Callable[[Any], None]]         # per entry, before queueing
    fill_eligible: Callable[[Session, Any], bool]
    fill: Callable[[Session, Any], None]                # external fetch + write
    fill_sleep: float = 0
    post_process: Optional[Callable[[Any, Session], None]] = None  # every entry, after the queue
    fill_after: tuple[Step, ...] = ()                   # (progress message, fn(db))
    budget: Optional[Callable[[], bool]] = None         # False -> stop, report the rest
    in_fill_all: bool = True
    # True for a type Fill is the whole story for - no Replace routes at
    # all, bulk or single. Studio is the first: a MAL producer record
    # carries no score or rank that drifts, so a re-fetch would only
    # rewrite what Fill already wrote.
    fill_only: bool = False
    # ---- Replace ----------------------------------------------------------
    replace_select: Optional[Callable[[Session], list]] = None   # None: no bulk Replace
    replace: Optional[Callable[[Session, Any, bool], None]] = None  # (db, entry, bulk)
    replace_sleep: float = 0
    replace_after: tuple[Step, ...] = ()
    single_after: tuple[Callable[[Session], None], ...] = field(default_factory=tuple)
    in_replace_all: bool = True


def _sse(**payload) -> str:
    return f"data: {json.dumps(payload)}\n\n"


def _progress(entry: str, processed: int, total: int) -> str:
    return _sse(status="processing", current_entry=entry, processed=processed, total=total)


async def _check_alive(request: Request) -> None:
    if await request.is_disconnected():
        raise asyncio.CancelledError()


def _log(db, kind, action_specific, action_type, status, log_action, **extra):
    # One row per pipeline the user actually started: sub-pipelines under
    # "Fill All" / "Replace All" pass log_action=False and the orchestrator
    # writes the single master row.
    if log_action:
        log_data_control(db, kind, action_specific, action_type, status, **extra)


async def _run_steps(db: Session, request: Request, steps: tuple[Step, ...], done: int, total: int):
    for message, fn in steps:
        await _check_alive(request)
        yield _progress(message, done, total)
        fn(db)


# ---------------------------------------------------------------------------
# Fill
# ---------------------------------------------------------------------------


async def run_fill(
    spec: PipelineSpec,
    db: Session,
    request: Request,
    action_specific: Optional[str] = None,
    action_type: str = "Manual",
    log_action: bool = True,
):
    """SSE generator: fill every eligible entry of one type, then post-process."""
    action_specific = action_specific or f"Fill {spec.label}"
    logger.info("Starting %s pipeline", action_specific)
    processed = 0
    total = 0
    left_for_next_run = 0

    try:
        entries = db.query(spec.model).all()
        if spec.extract_id:
            for entry in entries:
                spec.extract_id(entry)
            db.commit()

        queue = [e for e in entries if spec.fill_eligible(db, e)]
        total = len(queue)

        if not queue:
            yield _progress("No entries need filling.", 0, 0)
        for index, entry in enumerate(queue, start=1):
            await _check_alive(request)
            if spec.budget and not spec.budget():
                left_for_next_run = total - index + 1
                logger.warning(
                    "%s: external budget exhausted, %d entries left for the next run.",
                    action_specific, left_for_next_run,
                )
                break

            name = entry.display_name or f"Unknown {spec.label}"
            yield _progress(name, index, total)
            try:
                await run_in_threadpool(spec.fill, db, entry)
                db.commit()
                processed += 1
            except Exception as e:  # one bad entry must not end the run
                db.rollback()
                logger.error("%s: autofill failed for %s: %s", action_specific, name, e)
            if spec.fill_sleep:
                await asyncio.sleep(spec.fill_sleep)

        if spec.post_process:
            yield _progress("Running post-processing...", total, total)
            for entry in entries:
                await _check_alive(request)
                try:
                    spec.post_process(entry, db)
                except Exception as e:
                    logger.warning("Post-processing failed for %s: %s", entry.display_name, e)
            db.commit()

        async for message in _run_steps(db, request, spec.fill_after, total, total):
            yield message

        _log(db, "Fill", action_specific, action_type, "Success", log_action, rows_updated=processed)
        message = f"{action_specific} complete."
        if left_for_next_run:
            message += (
                f" {left_for_next_run} entries skipped - the external API's budget was"
                " reached. Run again later to finish."
            )
        yield _sse(status="success", message=message, total=total, processed=processed)

    except asyncio.CancelledError:
        db.rollback()
        logger.info("Client disconnected. Aborting %s.", action_specific)
        _log(db, "Fill", action_specific, action_type, "Aborted", log_action, rows_updated=processed)
        return
    except Exception as e:
        db.rollback()
        logger.exception("%s crashed", action_specific)
        _log(db, "Fill", action_specific, action_type, "Failed", log_action,
             rows_updated=processed, error_message=str(e))
        yield _sse(status="error", message=str(e))


# ---------------------------------------------------------------------------
# Replace
# ---------------------------------------------------------------------------


async def run_replace(
    spec: PipelineSpec,
    db: Session,
    request: Request,
    action_specific: Optional[str] = None,
    action_type: str = "Manual",
    log_action: bool = True,
):
    """SSE generator: re-fetch every linked entry of one type, overwriting."""
    action_specific = action_specific or f"Replace {spec.label}"
    if spec.replace_select is None or spec.replace is None:
        raise ValueError(f"{spec.label} has no bulk Replace pipeline")
    logger.info("Starting %s pipeline", action_specific)
    processed = 0
    total = 0

    try:
        entries = spec.replace_select(db)
        total = len(entries)
        if total == 0:
            _log(db, "Replace", action_specific, action_type, "Success", log_action, rows_updated=0)
            yield _sse(status="info", message=f"No {spec.label.lower()} entries found to replace",
                       total=0, processed=0)
            return

        for index, entry in enumerate(entries, start=1):
            await _check_alive(request)
            name = entry.display_name or f"Unknown {spec.label}"
            yield _progress(name, index, total)
            try:
                await run_in_threadpool(spec.replace, db, entry, True)
                db.commit()
                processed += 1
            except Exception as e:
                db.rollback()
                logger.error("%s: failed to replace %s: %s", action_specific, name, e)
            if spec.replace_sleep:
                await asyncio.sleep(spec.replace_sleep)

        async for message in _run_steps(db, request, spec.replace_after, total, total):
            yield message

        _log(db, "Replace", action_specific, action_type, "Success", log_action, rows_updated=processed)
        yield _sse(status="success", message=f"{action_specific} complete", total=total, processed=processed)

    except asyncio.CancelledError:
        db.rollback()
        logger.info("Client disconnected. Aborting %s.", action_specific)
        _log(db, "Replace", action_specific, action_type, "Aborted", log_action, rows_updated=processed)
        return
    except Exception as e:
        db.rollback()
        logger.exception("%s crashed", action_specific)
        _log(db, "Replace", action_specific, action_type, "Failed", log_action,
             rows_updated=processed, error_message=str(e))
        yield _sse(status="error", message=str(e))


async def run_replace_single(
    spec: PipelineSpec,
    db: Session,
    entry_id: str,
    action_type: str = "Manual",
    log_action: bool = True,
) -> dict:
    """Re-fetch one entry (the write hook behind create/update). Returns a
    status dict rather than raising: the factory logs a failure, it never
    500s a row that is already committed."""
    action_specific = f"Replace for single {spec.label.lower()} entry"
    try:
        entry = db.query(spec.model).filter(spec.model.system_id == entry_id).first()
        if not entry:
            _log(db, "Replace", action_specific, action_type, "Failed", log_action,
                 error_message=f"{spec.label} not found 404")
            return {"status": "error", "message": f"{spec.label} entry not found", "status_code": 404}

        if spec.replace:
            await run_in_threadpool(spec.replace, db, entry, False)
        db.commit()
        for fn in spec.single_after:
            fn(db)

        _log(db, "Replace", action_specific, action_type, "Success", log_action, rows_updated=1)
        return {"status": "success", "message": f"Successfully updated {entry.display_name}."}
    except Exception as e:
        db.rollback()
        logger.exception("Single replace failed for %s %s", spec.label, entry_id)
        _log(db, "Replace", action_specific, action_type, "Failed", log_action, error_message=str(e))
        return {"status": "error", "message": str(e), "status_code": 500}


# ---------------------------------------------------------------------------
# Fill All / Replace All
# ---------------------------------------------------------------------------


async def run_all(
    kind: str,
    specs: list[PipelineSpec],
    db: Session,
    request: Request,
    action_type: str = "Manual",
):
    """Run every spec's pipeline in order, then Backup, logging one master row."""
    action_specific = f"{kind} All"
    logger.info("Starting %s pipeline", action_specific)
    total_processed = 0
    sub_errors: list[str] = []
    runner = run_fill if kind == "Fill" else run_replace

    try:
        for spec in specs:
            sub_name = f"{kind} {spec.label}"
            async for message in runner(
                spec, db, request, action_specific=sub_name, action_type=action_type, log_action=False
            ):
                if message.startswith("data: "):
                    data = json.loads(message[6:])
                    if data.get("status") == "success":
                        total_processed += data.get("processed", 0)
                    elif data.get("status") == "error":
                        sub_errors.append(data.get("message", f"{sub_name} failed"))
                yield message
            await _check_alive(request)

        if sub_errors:
            summary = "; ".join(sub_errors)
            log_data_control(db, kind, action_specific, action_type, "Failed",
                             rows_updated=total_processed, error_message=summary)
            yield _sse(status="error", message=f"{action_specific} completed with errors: {summary}",
                       total=1, processed=total_processed)
            return

        # Local import: backup imports nothing from here, but keeping the
        # pipelines package free of import-order coupling is cheap.
        from app.services.pipelines.backup import execute_backup

        yield _progress("Synchronizing to Google Sheets...", 1, 1)
        execute_backup(db, action_type="Auto")

        log_data_control(db, kind, action_specific, action_type, "Success", rows_updated=total_processed)
        yield _sse(status="success", message=f"{action_specific} and Backup completed.", total=1, processed=1)

    except asyncio.CancelledError:
        log_data_control(db, kind, action_specific, action_type, "Aborted", rows_updated=total_processed)
        return
    except Exception as e:
        logger.exception("%s crashed", action_specific)
        log_data_control(db, kind, action_specific, action_type, "Failed",
                         rows_updated=total_processed, error_message=str(e))
        yield _sse(status="error", message=str(e))
