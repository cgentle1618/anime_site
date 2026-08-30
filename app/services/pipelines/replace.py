"""
Replace pipeline: overwrite metadata for single entries and in bulk.

The loop lives in runner.py and the per-type differences in specs.py. The
`execute_replace_single_*` names are the registry's write hooks (called after
every create/update); `execute_replace_*` back the bulk SSE routes.
"""

from functools import partial

from fastapi import Request
from sqlalchemy.orm import Session

from app.services.pipelines.runner import run_all, run_replace, run_replace_single
from app.services.pipelines.specs import PIPELINES, REPLACE_ALL


def _single(key: str):
    fn = partial(run_replace_single, PIPELINES[key])
    fn.__doc__ = f"Re-fetch one {PIPELINES[key].label} entry; returns a status dict."
    return fn


def _bulk(key: str):
    fn = partial(run_replace, PIPELINES[key])
    fn.__doc__ = f"SSE generator for 'Replace {PIPELINES[key].label}'."
    return fn


execute_replace_single_anime = _single("anime")
execute_replace_single_anime_movie = _single("anime-movie")
execute_replace_single_movie = _single("movie")
execute_replace_single_tv_show = _single("tv-show")
execute_replace_single_cartoon = _single("cartoon")
execute_replace_single_manga = _single("manga")
execute_replace_single_novel = _single("novel")
# Comics fetch nothing on the write hook: the spec has no `replace`, so this
# only re-syncs system options and logs the write like every other type.
execute_replace_single_comic = _single("comic")

execute_replace_anime = _bulk("anime")
execute_replace_anime_movie = _bulk("anime-movie")
execute_replace_movie = _bulk("movie")
execute_replace_tv_show = _bulk("tv-show")
execute_replace_cartoon = _bulk("cartoon")
execute_replace_manga = _bulk("manga")
execute_replace_novel = _bulk("novel")


async def execute_replace_all(db: Session, request: Request, action_type: str = "Manual"):
    """Replace every type in REPLACE_ALL, then Backup, logging one master row."""
    async for message in run_all("Replace", REPLACE_ALL, db, request, action_type):
        yield message
