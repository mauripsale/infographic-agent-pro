import os
import logging
from pathlib import Path
from google.cloud import storage
from datetime import timedelta

logger = logging.getLogger(__name__)

class StorageTool:
    def __init__(self, bucket_name: str = None):
        self.bucket_name = bucket_name or os.environ.get("GCS_BUCKET_NAME")
        if not self.bucket_name:
            logger.warning("GCS_BUCKET_NAME not set. Storage features will be disabled.")
            self.client = None
            self.bucket = None
        else:
            self.client = storage.Client()
            self.bucket = self.client.bucket(self.bucket_name)

    def get_signed_url(self, remote_path: str, expiration_hours: int = 24) -> str:
        """Generates a signed URL for a GCS path."""
        if not self.bucket:
            return ""
        
        try:
            blob = self.bucket.blob(remote_path)
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(hours=expiration_hours),
                method="GET",
            )
            return url
        except Exception as e:
            logger.error(f"Error generating signed URL for {remote_path}: {e}")
            return ""

    def upload_file(self, local_path: str, remote_path: str, content_type: str = None) -> str:
        """Uploads a file to GCS and returns the public or signed URL."""
        if not self.bucket:
            return ""
        
        try:
            blob = self.bucket.blob(remote_path)
            blob.upload_from_filename(local_path, content_type=content_type)
            
            # For this project, we might want signed URLs if the bucket isn't public
            # or just return the gs:// path if it's for internal use.
            # Returning a signed URL valid for 7 days.
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(days=7),
                method="GET",
            )
            return url
        except Exception as e:
            logger.error(f"GCS Upload Error: {e}")
            return ""

    def upload_bytes(self, data: bytes, remote_path: str, content_type: str = None) -> str:
        """Uploads bytes to GCS and returns the signed URL."""
        if not self.bucket:
            return ""
        
        try:
            blob = self.bucket.blob(remote_path)
            blob.upload_from_string(data, content_type=content_type)
            
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(days=7),
                method="GET",
            )
            return url
        except Exception as e:
            logger.error(f"GCS Upload Error (bytes): {e}")
            return ""

    def get_user_upload_path(self, user_id: str, filename: str) -> str:
        return f"users/{user_id}/uploads/{filename}"

    def get_project_asset_path(self, user_id: str, project_id: str, filename: str) -> str:
        return f"users/{user_id}/projects/{project_id}/assets/{filename}"
