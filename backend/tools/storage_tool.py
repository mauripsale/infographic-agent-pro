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
            # Fallback for local/memory: assume it's served via /static if it exists locally?
            # Or just return empty to signal failure.
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
        """Uploads a file to GCS via ADK bucket and returns the signed URL."""
        if not self.bucket:
            # For InMemory/Local, we assume the file is already in a place accessible via static serving
            # or we copy it to static dir? 
            # Current main.py logic handles local fallback if this returns None/Empty.
            return ""
        
        try:
            blob = self.bucket.blob(remote_path)
            blob.upload_from_filename(local_path, content_type=content_type)
            
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
        """Uploads bytes to GCS via ADK bucket and returns the signed URL."""
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