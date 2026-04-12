"""
gcp_utils.py
Contains domain-agnostic utility functions for interacting with Google Cloud Platform.
Handles environment-aware authentication and client initialization for Cloud Storage.
"""

import json
import logging
import os
from typing import Optional

from google.cloud import storage
from google.oauth2.service_account import Credentials

logger = logging.getLogger(__name__)


def get_active_bucket_name() -> Optional[str]:
    """
    Determines the target Google Cloud Storage bucket name based on the environment.
    Defaults to the internal production bucket if running on Cloud Run.
    """
    is_cloud_run = os.getenv("K_SERVICE") is not None

    return os.getenv("GCP_BUCKET_NAME", "cg1618-anime-covers" if is_cloud_run else None)


def get_gcs_client() -> storage.Client:
    """
    Initializes and returns a Google Cloud Storage client.
    Smartly routes between Cloud Run native IAM identity and local JSON credentials.
    """
    # 1. PRODUCTION MODE: If running in Cloud Run, use the native Compute Identity (IAM).
    if os.getenv("K_SERVICE"):
        logger.info(
            "Cloud Run detected. Initializing GCS client with native IAM identity."
        )
        return storage.Client()

    # 2. LOCAL MODE: Attempt to use the GOOGLE_CREDENTIALS_JSON environment variable.
    creds_json_str = os.getenv("GOOGLE_CREDENTIALS_JSON")
    if creds_json_str:
        try:
            creds_info = json.loads(creds_json_str)
            credentials = Credentials.from_service_account_info(creds_info)

            logger.info(
                "Initializing GCS client with provided Service Account credentials."
            )
            return storage.Client(
                credentials=credentials, project=creds_info.get("project_id")
            )
        except json.JSONDecodeError as e:
            logger.error(f"Malformed GOOGLE_CREDENTIALS_JSON detected: {e}")
        except Exception as e:
            logger.error(f"Failed to initialize GCS client with local credentials: {e}")

    # 3. FALLBACK: Attempt initialization with default environment discovery.
    logger.info(
        "No explicit credentials found. Falling back to default GCS environment discovery."
    )
    return storage.Client()
