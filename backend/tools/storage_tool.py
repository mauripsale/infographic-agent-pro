import os
import logging
from pathlib import Path
from datetime import timedelta
from typing import Optional, Union

# Import ADK services
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService

logger = logging.getLogger(__name__)

class StorageTool:
    def __init__(self, artifact_service: Union[GcsArtifactService, InMemoryArtifactService]):
        self.artifact_service = artifact_service
        self.bucket = None
        
        if isinstance(self.artifact_service, GcsArtifactService):
            self.bucket = self.artifact_service.bucket
            logger.info("StorageTool initialized with GcsArtifactService")
        else:
            logger.warning("StorageTool initialized with InMemoryArtifactService. Cloud features disabled.")

    def get_signed_url(self, remote_path: str, expiration_hours: int = 24) -> str:
        """Generates a signed URL for a GCS path using the ADK service's bucket."""
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
            logger.warning(f"Could not generate signed URL for {remote_path} (likely missing private key): {e}")
            return f"https://storage.cloud.google.com/{self.bucket.name}/{remote_path}"

    def _get_blob_url(self, blob, remote_path: str) -> str:
        """Tries to generate a signed URL, falling back to an authenticated URL."""
        try:
            url = blob.generate_signed_url(
                version="v4",
                expiration=timedelta(days=7),
                method="GET",
            )
            return url
        except Exception as sign_err:
            logger.warning(f"GCS Signing Failed (missing key?), returning authenticated URL: {sign_err}")
            return f"https://storage.cloud.google.com/{self.bucket.name}/{remote_path}"

    def upload_file(self, local_path: str, remote_path: str, content_type: str = None) -> str:
        """Uploads a file to GCS via ADK bucket and returns a URL (signed or authenticated)."""
        if not self.bucket:
            return ""
        
        try:
            blob = self.bucket.blob(remote_path)
            blob.upload_from_filename(local_path, content_type=content_type)
            return self._get_blob_url(blob, remote_path)

        except Exception as e:
            logger.error(f"GCS Upload Error: {e}")
            return ""

    def upload_bytes(self, data: bytes, remote_path: str, content_type: str = None) -> str:
        """Uploads bytes to GCS via ADK bucket and returns a URL (signed or authenticated)."""
        if not self.bucket:
            return ""
        
        try:
            blob = self.bucket.blob(remote_path)
            blob.upload_from_string(data, content_type=content_type)
            return self._get_blob_url(blob, remote_path)

        except Exception as e:
            logger.error(f"GCS Upload Error (bytes): {e}")
            return ""

    def get_user_upload_path(self, user_id: str, filename: str) -> str:
        return f"users/{user_id}/uploads/{filename}"

    def get_project_asset_path(self, user_id: str, project_id: str, filename: str) -> str:
        return f"users/{user_id}/projects/{project_id}/assets/{filename}"