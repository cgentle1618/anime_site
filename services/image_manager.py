"""
image_manager.py
Handles the downloading and local storage of external images (like MyAnimeList covers)
to reduce reliance on external URLs and prevent hotlinking/rate-limiting issues.
"""

import os
import requests
import logging
from typing import Optional

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define the local storage path for cover images
COVER_DIR = "static/covers"


def download_cover_image(image_url: str, system_id: str) -> Optional[str]:
    """
    Downloads an image from a URL and saves it locally using the system_id.
    If the image already exists, it skips the download and returns the filename.

    Args:
        image_url (str): The external URL of the image (e.g., from Jikan API).
        system_id (str): The unique database UUID of the anime entry.

    Returns:
        Optional[str]: The local filename (e.g., 'system_id.jpg') if successful, else None.
    """
    if not image_url:
        return None

    # Ensure the target directory exists
    os.makedirs(COVER_DIR, exist_ok=True)

    # Extract extension from URL, default to .jpg if unknown
    ext = ".jpg"
    image_url_lower = image_url.lower()
    if ".png" in image_url_lower:
        ext = ".png"
    elif ".webp" in image_url_lower:
        ext = ".webp"

    # Construct the safe local filename and path
    filename = f"{system_id}{ext}"
    filepath = os.path.join(COVER_DIR, filename)

    # Optimization: Skip downloading if we already have this file saved
    if os.path.exists(filepath):
        logger.info(
            f"Cover image already exists locally for {system_id}. Skipping download."
        )
        return filename

    try:
        # Stream the image download to handle large files efficiently
        response = requests.get(image_url, stream=True, timeout=10)
        response.raise_for_status()  # Raise an exception for bad HTTP status codes

        # Save the file in binary mode
        with open(filepath, "wb") as f:
            for chunk in response.iter_content(chunk_size=1024):
                if chunk:
                    f.write(chunk)

        logger.info(f"Successfully downloaded and saved cover image: {filename}")
        return filename

    except requests.exceptions.RequestException as e:
        logger.error(
            f"Network error downloading image {image_url} for {system_id}: {e}"
        )
        return None
    except Exception as e:
        logger.error(f"Unexpected error saving image for {system_id}: {e}")
        return None
