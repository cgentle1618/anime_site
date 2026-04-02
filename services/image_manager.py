"""
image_manager.py
Handles downloading external images (e.g., from MAL) and storing them persistently.
Strictly an I/O service: Contains zero database logic.
Supports Google Cloud Storage (for production) and local file system (for development).
"""

import os
import logging
import requests
from typing import Optional
from utils.gcp_utils import get_active_bucket_name, get_gcs_client

# Setup basic logging
logger = logging.getLogger(__name__)

# Define the local fallback storage path
COVER_DIR = "static/covers"


def download_cover_image(image_url: str, system_id: str) -> Optional[str]:
    """
    Downloads an image from a URL and saves it to GCS or Local Storage.
    Returns the saved filename (e.g., 'uuid.jpg') to be stored in the database.
    """
    if not image_url or not system_id:
        return None

    filename = f"{system_id}.jpg"
    content_type = "image/jpeg"
    bucket_name = get_active_bucket_name()

    try:
        # ==========================================
        # STEP 1: EXISTENCE PRE-CHECK
        # ==========================================
        if bucket_name:
            client = get_gcs_client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(filename)

            if blob.exists():
                return filename
        else:
            os.makedirs(COVER_DIR, exist_ok=True)
            filepath = os.path.join(COVER_DIR, filename)

            if os.path.exists(filepath):
                return filename

        # ==========================================
        # STEP 2: DOWNLOAD THE IMAGE
        # ==========================================
        response = requests.get(
            image_url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AnimeTracker/2.0"
            },
            timeout=10,
        )
        response.raise_for_status()
        image_bytes = response.content

        # ==========================================
        # STEP 3: SAVE TO PERSISTENT STORAGE
        # ==========================================
        if bucket_name:
            blob.upload_from_string(image_bytes, content_type=content_type)
            logger.info(f"Successfully uploaded cover to GCS: {filename}")
            return filename
        else:
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            logger.info(f"Successfully saved cover locally: {filename}")
            return filename

    except requests.RequestException as e:
        logger.error(f"Network error downloading image {image_url}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error managing image for {system_id}: {e}")
        return None


def delete_cover_image(system_id: str) -> None:
    """
    Deletes the cover image associated with a system_id from storage.
    Triggered when an entry is permanently deleted from the database.
    """
    if not system_id:
        return

    filename = f"{system_id}.jpg"
    bucket_name = get_active_bucket_name()

    try:
        if bucket_name:
            # --- CLOUD MODE ---
            client = get_gcs_client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(filename)

            if blob.exists():
                blob.delete()
                logger.info(f"Deleted image from GCS: {filename}")
        else:
            # --- LOCAL MODE ---
            filepath = os.path.join(COVER_DIR, filename)
            if os.path.exists(filepath):
                os.remove(filepath)
                logger.info(f"Deleted local image: {filename}")

    except Exception as e:
        # We catch and log, but don't crash the parent DB deletion process
        logger.error(f"Failed to delete image {filename}: {e}")
