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
    """
    Initializes the Google Cloud Storage client.
    Smartly routes between Cloud Run native identity and local JSON credentials.
    """
    from google.cloud import storage
    from google.oauth2.service_account import Credentials

    # 1. If running in Cloud Run, ALWAYS use the native Compute Identity.
    # This prevents the app from accidentally using the Google Sheets JSON key,
    # which lacks the 'Storage Object Admin' role and causes a 403 Forbidden.
    if os.getenv("K_SERVICE"):
        logger.info(
            "Cloud Run environment detected. Using native IAM identity for GCS."
        )
        return storage.Client()

    # 2. If running locally, try to use the JSON credentials (if provided)
    creds_json_str = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if creds_json_str:
        try:
            creds_info = json.loads(creds_json_str)
            credentials = Credentials.from_service_account_info(creds_info)
            logger.info(
                "Local environment detected. Using GOOGLE_CREDENTIALS_JSON for GCS."
            )
            return storage.Client(
                credentials=credentials, project=creds_info.get("project_id")
            )
        except Exception as e:
            logger.error(f"Failed to parse GOOGLE_CREDENTIALS_JSON for GCS: {e}")

    # 3. Ultimate fallback
    logger.info("No explicit credentials found. Falling back to default GCS client.")
    return storage.Client()


def download_cover_image(image_url: str, system_id: str) -> Optional[str]:
    """
    Downloads an image from a URL using urllib to avoid namespace collisions,
    and saves it to GCS (if in Cloud Run) or Local Storage.
    Optimized to check existence BEFORE downloading to prevent 504 Timeouts.
    """
    if not image_url:
        return None

    filename = f"{system_id}.jpg"
    content_type = "image/jpeg"

    # Cloud Run automatically injects 'K_SERVICE' into the environment
    is_cloud_run = os.getenv("K_SERVICE") is not None

    # Default to your specific bucket if on Cloud Run, otherwise rely on ENV or None
    bucket_name = os.getenv(
        "GCP_BUCKET_NAME", "cg1618-anime-covers" if is_cloud_run else None
    )

    try:
        # ==========================================
        # STEP 1: EXISTENCE PRE-CHECK (SAVES TIME & BANDWIDTH)
        # ==========================================
        if bucket_name:
            client = get_gcs_client()
            bucket = client.bucket(bucket_name)
            blob = bucket.blob(filename)

            if blob.exists():
                logger.info(
                    f"Cover already exists in GCS for {system_id}. Skipping download."
                )
                return filename
        else:
            os.makedirs(COVER_DIR, exist_ok=True)
            filepath = os.path.join(COVER_DIR, filename)

            if os.path.exists(filepath):
                logger.info(
                    f"Cover already exists locally for {system_id}. Skipping download."
                )
                return filename

        # ==========================================
        # STEP 2: DOWNLOAD THE IMAGE
        # ==========================================
        req = urllib.request.Request(
            image_url,
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            image_bytes = response.read()

        # ==========================================
        # STEP 3: SAVE TO PERSISTENT STORAGE
        # ==========================================
        if bucket_name:
            # Upload from memory bytes
            blob.upload_from_string(image_bytes, content_type=content_type)
            logger.info(
                f"Successfully uploaded cover to GCS bucket '{bucket_name}': {filename}"
            )
            return filename
        else:
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
