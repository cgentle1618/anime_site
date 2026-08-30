"""routers/anime_movie.py - endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.
Anime movies have no series (`has_series=False`) and no write hook.
"""
from app.registry import MEDIA_REGISTRY
from app.routers._factory import make_media_router

router = make_media_router(MEDIA_REGISTRY["anime_movie"])
