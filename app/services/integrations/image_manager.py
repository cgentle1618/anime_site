"""
image_manager.py
Handles the persistent storage and retrieval of cover images and portraits.
Images live on the local filesystem; this module is the only place that knows
where.

Layout: every image lives at `<owner_type>/<system_id>.jpg`, under
`static/covers/`. The owner type is the table the id belongs to - a bare
system_id does not identify a file, since each table has its own id space.
`cover_key` is the only place the layout is spelled out; callers pass the owner
type and store the returned key verbatim in `cover_image_file` / `photo_file`.
"""

import logging
import os
from typing import Optional

import requests

from app.utils.media_resolver import MEDIA_TYPE_KEYS

logger = logging.getLogger(__name__)

COVER_DIR = "static/covers"

# Every table whose rows own an image. The media types come from
# media_resolver so the two never drift; the rest are the entity tables that
# have always shared this storage - staff and character portraits, publisher
# and studio logos.
COVER_OWNERS: frozenset[str] = frozenset(MEDIA_TYPE_KEYS) | frozenset(
    {"staff", "character", "publisher", "studio"}
)


def cover_key(owner_type: str, system_id: str) -> str:
    """
    The storage key for one image: `<owner_type>/<system_id>.jpg`.

    Rejects an unknown owner type rather than creating a stray folder, which
    would silently hide the image from every listing and orphan check.
    """
    if owner_type not in COVER_OWNERS:
        raise ValueError(
            f"Unknown cover owner type {owner_type!r}; expected one of "
            f"{sorted(COVER_OWNERS)}"
        )
    return f"{owner_type}/{system_id}.jpg"


def _local_path(key: str) -> str:
    return os.path.join(COVER_DIR, *key.split("/"))


def list_all_cover_images(owner_type: Optional[str] = None) -> list[str]:
    """
    All image keys currently in storage, optionally just one owner's.

    Returns keys (`anime/<id>.jpg`), not bare filenames. Files left at the root
    by an un-migrated installation are deliberately skipped: they belong to no
    owner, so no row can reference them.
    """
    owners = [owner_type] if owner_type else sorted(COVER_OWNERS)
    try:
        keys: list[str] = []
        for owner in owners:
            folder = os.path.join(COVER_DIR, owner)
            if not os.path.isdir(folder):
                continue
            keys.extend(
                f"{owner}/{f}" for f in os.listdir(folder) if f.endswith(".jpg")
            )
        return sorted(keys)
    except Exception as e:
        logger.error(f"Error listing cover images: {e}")
        return []


def cover_image_exists(owner_type: str, system_id: str) -> bool:
    """Returns True if the image is present on disk."""
    key = cover_key(owner_type, str(system_id))
    try:
        return os.path.exists(_local_path(key))
    except Exception as e:
        logger.error(f"Error checking cover image for {key}: {e}")
        return False


def download_cover_image(
    image_url: str, owner_type: str, system_id: str
) -> Optional[str]:
    """
    Downloads an image from a remote URL and saves it to disk, returning the
    storage key to record on the row.

    Logic Flow:
    1. Check if the image already exists (skip download if found).
    2. Download the raw bytes via HTTP.
    3. Write it into the owner's folder.
    """
    if not image_url or not system_id:
        return None

    key = cover_key(owner_type, str(system_id))

    try:
        filepath = _local_path(key)
        os.makedirs(os.path.dirname(filepath), exist_ok=True)
        if os.path.exists(filepath):
            return key

        # MAL's image CDN requires a User-Agent to prevent 403 Forbidden errors
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
        }
        response = requests.get(image_url, headers=headers, timeout=15)
        response.raise_for_status()

        with open(filepath, "wb") as f:
            f.write(response.content)
        logger.info(f"Cover image saved: {key}")

        return key

    except requests.RequestException as e:
        logger.error(f"Network error downloading image from {image_url}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error managing cover image for {key}: {e}")
        return None


def delete_cover_image(owner_type: str, system_id: str) -> None:
    """
    Permanently removes an image from storage.
    Typically called via BackgroundTasks during a record deletion.
    """
    if not system_id:
        return

    key = cover_key(owner_type, str(system_id))

    try:
        filepath = _local_path(key)
        if os.path.exists(filepath):
            os.remove(filepath)
            logger.info(f"Deleted cover image: {key}")

    except Exception as e:
        # Non-critical: Log the error but allow the parent transaction to continue
        logger.error(f"Maintenance Error: Failed to delete image {key}: {e}")
