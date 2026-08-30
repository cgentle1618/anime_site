"""routers/anime.py - endpoints built from the shared media-router factory.
Per-type config lives in app/registry.py; endpoint logic in app/routers/_factory.py.
Anime's synchronous autofill + ep_previous derivation on write is its
`pre_commit_hook` (app/services/domain/anime_write.py).
"""
from app.registry import MEDIA_REGISTRY
from app.routers._factory import make_media_router

router = make_media_router(MEDIA_REGISTRY["anime"])
