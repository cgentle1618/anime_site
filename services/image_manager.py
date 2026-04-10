"""
image_manager.py
Handles the persistent storage and retrieval of anime cover images.
Acts as an abstraction layer between the local filesystem and Google Cloud Storage.
"""

import logging
import os
from typing import Optional

import requests

from utils.gcp_utils import get_active_bucket_name, get_gcs_client

logger = logging.getLogger(__name__)

COVER_DIR = "static/covers"


def download_cover_image(image_url: str, system_id: str) -> Optional[str]:
    """
    Downloads a cover image from a remote URL and saves it to the active storage provider.

    Logic Flow:
    1. Check if the image already exists (skip download if found).
    2. Download the raw bytes via HTTP.
    3. Upload to GCS (Production) or write to disk (Development).
    """
    if not image_url or not system_id:
        return None

    filename = f"{system_id}.jpg"
    content_type = "image/jpeg"
    bucket_name = get_active_bucket_name()

    try:
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

        # MAL/Jikan requires a User-Agent to prevent 403 Forbidden errors
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MediaTracker/1.0"
        }
        response = requests.get(image_url, headers=headers, timeout=15)
        response.raise_for_status()
        image_bytes = response.content

        if bucket_name:
            # Cloud Mode
            blob.upload_from_string(image_bytes, content_type=content_type)
            logger.info(f"Cover image uploaded to GCS: {filename}")
        else:
            # Local Mode
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            logger.info(f"Cover image saved locally: {filename}")

        return filename

    except requests.RequestException as e:
        logger.error(f"Network error downloading image from {image_url}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error managing cover image for {system_id}: {e}")
        return None


def delete_cover_image(system_id: str) -> None:
    """
    Permanently removes a cover image from storage.
    Typically called via BackgroundTasks during a record deletion.
    """
    if not system_id:
        return

    filename = f"{system_id}.jpg"
    bucket_name = get_active_bucket_name()

    try:
        if bucket_name:
            # Cloud Mode
            client = get_gcs_client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(filename)
            if blob.exists():
                blob.delete()
                logger.info(f"Deleted GCS cover image: {filename}")
        else:
            # Local Mode
            filepath = os.path.join(COVER_DIR, filename)
            if os.path.exists(filepath):
                os.remove(filepath)
                logger.info(f"Deleted local cover image: {filename}")

    except Exception as e:
        # Non-critical: Log the error but allow the parent transaction to continue
        logger.error(f"Maintenance Error: Failed to delete image {filename}: {e}")
