"""routers/comic.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

Comic additionally exposes a Comic Vine volume lookup so the admin can pick a
run and store its ID rather than pasting URLs by hand.
"""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_admin
from app.registry import MEDIA_REGISTRY
from app.routers._factory import make_media_router
from app.services.integrations.comicvine import search_comicvine_volumes
from app.utils.comicvine_utils import _pick_cover_url

# Declared before the factory routes are merged in: the factory registers
# GET /{system_id}, which would otherwise swallow this literal path.
router = APIRouter(tags=["Comic"])


@router.get("/api/comic/search-comicvine")
def search_comicvine(
    q: str = Query(..., min_length=1, description="Volume name to search for"),
    limit: int = Query(10, ge=1, le=50),
    admin: dict = Depends(get_current_admin),
) -> List[Dict[str, Any]]:
    """
    Searches Comic Vine volumes by name so the admin can identify the right run.
    Returns a trimmed shape — enough to disambiguate runs sharing a title.
    """
    results = search_comicvine_volumes(q, limit=limit)

    return [
        {
            "comicvine_id": volume.get("id"),
            "name": volume.get("name"),
            "start_year": volume.get("start_year"),
            "publisher": (volume.get("publisher") or {}).get("name"),
            "issue_total": volume.get("count_of_issues"),
            "comicvine_link": volume.get("site_detail_url"),
            "cover_image_url": _pick_cover_url(volume.get("image")),
        }
        for volume in results
    ]


router.include_router(make_media_router(MEDIA_REGISTRY["comic"]))
