"""
Fill pipeline: populate missing metadata from external sources.

The loop itself lives in runner.py and what varies per media type in
specs.py; the names below are the stable entry points the data-control router
and Fill All use. Each is `run_fill` bound to one spec.
"""

from functools import partial

from fastapi import Request
from sqlalchemy.orm import Session

from app.services.pipelines.runner import run_all, run_fill
from app.services.pipelines.specs import FILL_ALL, PIPELINES


def _bind(key: str):
    fn = partial(run_fill, PIPELINES[key])
    fn.__doc__ = f"SSE generator for 'Fill {PIPELINES[key].label}'."
    return fn


execute_fill_anime = _bind("anime")
execute_fill_anime_movie = _bind("anime-movie")
execute_fill_movie = _bind("movie")
execute_fill_tv_show = _bind("tv-show")
execute_fill_cartoon = _bind("cartoon")
execute_fill_manga = _bind("manga")
execute_fill_novel = _bind("novel")
execute_fill_comic = _bind("comic")


async def execute_fill_all(db: Session, request: Request, action_type: str = "Manual"):
    """Fill every type in FILL_ALL (Comic excluded: its API budget is hourly),
    then Backup, logging one master row."""
    async for message in run_all("Fill", FILL_ALL, db, request, action_type):
        yield message
