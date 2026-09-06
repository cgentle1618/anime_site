from app.registry import MEDIA_REGISTRY
from app.routers._factory import make_media_router

router = make_media_router(MEDIA_REGISTRY["game"])
