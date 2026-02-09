import os
import logging
from google.cloud import storage

logger = logging.getLogger(__name__)

# --- Models ---
DEFAULT_TEXT_MODEL = "gemini-3-flash-preview"
DEFAULT_IMAGE_MODEL = "gemini-3-pro-image-preview"

# --- Project & Bucket Logic ---
def get_project_id():
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")
    if not project_id:
        # Hardcoded fallback as per original logic
        project_id = "qwiklabs-asl-04-f9d4ba2925b9" 
        logger.warning(f"GOOGLE_CLOUD_PROJECT not found. Using hardcoded fallback: {project_id}")
    return project_id

def get_or_create_bucket(project_id):
    # Sanitize first
    bad_bucket = "infographic-agent-pro-assets"
    if os.environ.get("GCS_BUCKET_NAME") == bad_bucket:
        logger.warning(f"Removing toxic env var GCS_BUCKET_NAME={bad_bucket}")
        del os.environ["GCS_BUCKET_NAME"]

    env_bucket = os.environ.get("GCS_BUCKET_NAME")
    storage_client = storage.Client(project=project_id)
    
    if env_bucket:
        try:
            bucket = storage_client.bucket(env_bucket)
            if bucket.exists(): return env_bucket
        except Exception: pass

    # Discovery
    try:
        buckets = list(storage_client.list_buckets())
        for b in buckets:
            if "infographic-assets" in b.name or "ipsa-assets" in b.name: 
                logger.info(f"Discovered bucket: {b.name}")
                return b.name
    except Exception as e:
        logger.warning(f"Discovery failed: {e}")

    # Fallback / Creation
    fallback = f"{project_id}-infographic-assets"
    try:
        bucket = storage_client.bucket(fallback)
        if not bucket.exists(): bucket.create(location="US")
        return fallback
    except Exception as e: 
        logger.warning(f"Creation failed for {fallback}: {e}. Returning blindly.")
        return fallback

# Initialize Settings
PROJECT_ID = get_project_id()
GCS_BUCKET_NAME = get_or_create_bucket(PROJECT_ID)

# Set Env Var for compatibility with tools that might read it
os.environ["GCS_BUCKET_NAME"] = GCS_BUCKET_NAME
