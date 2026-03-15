"""
image_manager.py
Handles downloading external images (MAL covers) and storing them persistently.
Supports Google Cloud Storage for cloud deployments and local storage for development.
"""

import os
import json
import logging
import urllib.request
from typing import Optional

# Setup basic logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Define the local fallback storage path
COVER_DIR = "static/covers"


def get_gcs_client():
    """Initializes the Google Cloud Storage client using existing credentials."""
    from google.cloud import storage
    from google.oauth2.service_account import Credentials

    creds_json_str = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if creds_json_str:
        try:
            creds_info = json.loads(creds_json_str)
            credentials = Credentials.from_service_account_info(creds_info)
            return storage.Client(
                credentials=credentials, project=creds_info.get("project_id")
            )
        except Exception as e:
            logger.error(f"Failed to parse GOOGLE_CREDENTIALS_JSON for GCS: {e}")

    # Fallback to default compute engine credentials if running directly in GCP
    return storage.Client()


def download_cover_image(image_url: str, system_id: str) -> Optional[str]:
    """
    Downloads an image from a URL using urllib to avoid namespace collisions,
    and saves it to GCS (if in Cloud Run) or Local Storage.
    """
    if not image_url:
        return None

    try:
        # 1. Download image bypassing bot-protection
        req = urllib.request.Request(
            image_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            image_bytes = response.read()

        filename = f"{system_id}.jpg"
        content_type = "image/jpeg"

        # 2. Bulletproof Cloud Detection
        # Cloud Run automatically injects 'K_SERVICE' into the environment
        is_cloud_run = os.getenv("K_SERVICE") is not None

        # Default to your specific bucket if on Cloud Run, otherwise rely on ENV or None
        bucket_name = os.getenv(
            "GCP_BUCKET_NAME", "cg1618-anime-covers" if is_cloud_run else None
        )

        if bucket_name:
            # --- CLOUD MODE: Upload to Google Cloud Storage ---
            client = get_gcs_client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(filename)

            if blob.exists():
                logger.info(f"Cover already exists in GCS for {system_id}. Skipping.")
                return filename

            # Upload from memory bytes
            blob.upload_from_string(image_bytes, content_type=content_type)
            logger.info(
                f"Successfully uploaded cover to GCS bucket '{bucket_name}': {filename}"
            )
            return filename

        else:
            # --- LOCAL MODE: Fallback for local development ---
            os.makedirs(COVER_DIR, exist_ok=True)
            filepath = os.path.join(COVER_DIR, filename)

            if os.path.exists(filepath):
                logger.info(f"Cover already exists locally for {system_id}. Skipping.")
                return filename

            with open(filepath, "wb") as f:
                f.write(image_bytes)

            logger.info(f"Successfully saved cover locally: {filename}")
            return filename

    except urllib.error.URLError as e:
        logger.error(f"Network error downloading image {image_url}: {e}")
        return None
    except Exception as e:
        logger.error(f"Unexpected error managing image for {system_id}: {e}")
        return None
