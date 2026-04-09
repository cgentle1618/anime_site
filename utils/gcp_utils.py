"""
gcp_utils.py
Contains domain-agnostic utility functions for interacting with Google Cloud Platform (GCP).
Handles authentication and client initialization for services like Google Cloud Storage.
"""

import os
import json
import logging
from typing import Optional
from google.cloud import storage
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)


def get_active_bucket_name() -> Optional[str]:
    """
    Determines the active Google Cloud Storage bucket.
    Returns the bucket name if running in Cloud Run, otherwise None (Local Mode).
    """
    is_cloud_run = os.getenv("K_SERVICE") is not None
    return os.getenv("GCP_BUCKET_NAME", "cg1618-anime-covers" if is_cloud_run else None)


def get_gcs_client() -> storage.Client:
    """
    Initializes the Google Cloud Storage client.
    Smartly routes between Cloud Run native IAM identity and local JSON credentials.
    """
    # 1. If running in Cloud Run, ALWAYS use the native Compute Identity.
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
            return storage.Client(
                credentials=credentials, project=creds_info.get("project_id")
            )
        except Exception as e:
            logger.error(f"Failed to parse GOOGLE_CREDENTIALS_JSON for GCS: {e}")

    # 3. Ultimate fallback
    logger.info("No explicit credentials found. Falling back to default GCS client.")
    return storage.Client()
