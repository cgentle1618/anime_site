"""routers/manga.py — endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.
"""
from app.routers._factory import make_media_router
from app.registry import MEDIA_REGISTRY

router = make_media_router(MEDIA_REGISTRY["manga"])
