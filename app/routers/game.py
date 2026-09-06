"""routers/game.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.

Game additionally exposes an IGDB search so the admin can pick the right entry
and store its ID, which is Fill's only handle on the game.
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends, Query

from app.dependencies import get_current_admin
from app.registry import MEDIA_REGISTRY
from app.routers._factory import make_media_router
from app.services.integrations.igdb import search_igdb_games

# Declared before the factory routes are merged in: the factory registers
# GET /{system_id}, which would otherwise swallow this literal path.
router = APIRouter(tags=["Game"])


@router.get("/api/game/search-igdb")
def search_igdb(
    q: str = Query(..., min_length=1, description="Game name to search for"),
    limit: int = Query(10, ge=1, le=50),
    admin: dict = Depends(get_current_admin),
) -> List[Dict[str, Any]]:
    """Searches IGDB games by name so the admin can identify the right entry."""
    return search_igdb_games(q, limit)


router.include_router(make_media_router(MEDIA_REGISTRY["game"]))
