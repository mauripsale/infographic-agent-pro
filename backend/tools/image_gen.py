import os
import io
import uuid
import logging
import datetime
from datetime import timedelta
import requests
import google.auth
from google.auth.transport import requests as google_requests
from google import genai
from google.genai import types
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ImageGenerationTool:
    def __init__(self, api_key: str = None, artifact_service = None):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY is required for image generation.")
        
        self.client = genai.Client(api_key=self.api_key)
        self.artifact_service = artifact_service
        
        if not self.artifact_service:
            logger.warning("No ArtifactService provided. Images will not be saved.")

    def generate_and_save(self, prompt: str, aspect_ratio: str = "16:9", user_id: str = None, project_id: str = None, logo_url: str = None, model: str = "gemini-3-pro-image-preview") -> dict:
        """
        Generates an image using Nano Banana (Gemini Image models) and saves it via ADK Artifact Service.
        Returns a dict: {"url": str, "path": str} or {"error": str}.
        """
        try:
            logger.info(f"Generating image with prompt: {prompt[:50]}... | Model: {model}")
            
            # Nano Banana uses generate_content, NOT generate_images
            try:
                response = self.client.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE"],
                        image_config=types.ImageConfig(
                            aspect_ratio=aspect_ratio,
                            image_size="2K" # Default to high quality
                        ),
                        safety_settings=[
                            types.SafetySetting(
                                category="HARM_CATEGORY_DANGEROUS_CONTENT",
                                threshold="BLOCK_ONLY_HIGH"
                            )
                        ]
                    )
                )
            except Exception as e:
                if "404" in str(e) or "NOT_FOUND" in str(e):
                    logger.warning(f"⚠️ Model '{model}' not found. Falling back to 'gemini-2.5-flash-image'...")
                    response = self.client.models.generate_content(
                        model="gemini-2.5-flash-image",
                        contents=prompt,
                        config=types.GenerateContentConfig(
                            response_modalities=["IMAGE"],
                            image_config=types.ImageConfig(
                                aspect_ratio=aspect_ratio
                            )
                        )
                    )
                else:
                    raise e

            # Extract image from response parts
            image_bytes = None
            if response.parts:
                for part in response.parts:
                    if part.inline_data:
                        image_bytes = part.inline_data.data
                        break
            
            if not image_bytes:
                logger.error("No image data found in response.")
                return {"error": "No image generated."}
            
            # Post-processing (Watermark) placeholder
            if logo_url:
                try:
                    pass 
                except Exception as e:
                    logger.warning(f"Watermarking failed: {e}")

            # Upload via ArtifactService (ADK Native)
            if self.artifact_service:
                filename = f"{uuid.uuid4()}.png"
                
                # Construct path
                if project_id and user_id:
                    remote_path = f"users/{user_id}/projects/{project_id}/assets/{filename}"
                elif user_id:
                    remote_path = f"users/{user_id}/generated/{filename}"
                else:
                    remote_path = f"public/generated/{filename}"
                
                # Upload and get Signed URL
                blob = self.artifact_service.bucket.blob(remote_path)
                blob.upload_from_string(image_bytes, content_type="image/png")
                
                try:
                    # Cloud Run Signing Logic: Use IAM API if private key is missing
                    credentials, _ = google.auth.default()
                    
                    # Refresh credentials to ensure we have a token
                    if not credentials.valid:
                        request = google_requests.Request()
                        credentials.refresh(request)
                    
                    # If we have a service account email (typical in Cloud Run), use it
                    service_account_email = getattr(credentials, "service_account_email", None)
                    
                    if service_account_email:
                        logger.info(f"Signing URL using Service Account: {service_account_email}")
                        url = blob.generate_signed_url(
                            version="v4",
                            expiration=datetime.timedelta(days=7),
                            method="GET",
                            service_account_email=service_account_email,
                            access_token=credentials.token
                        )
                    else:
                        # Fallback for local dev with key file
                        url = blob.generate_signed_url(
                            version="v4",
                            expiration=datetime.timedelta(days=7),
                            method="GET"
                        )
                    
                    logger.info(f"✅ Upload Success via ADK: {url[:50]}...")
                    return {"url": url, "path": remote_path}
                    
                except Exception as sign_err:
                    logger.error(f"❌ Failed to sign URL. Ensure Service Account has 'Token Creator' role. Error: {sign_err}")
                    return {"error": f"Signing Error: {str(sign_err)}"}
            else:
                return {"error": "ArtifactService not configured."}

        except Exception as e:
            logger.error(f"Generation Fatal Error: {e}")
            return {"error": str(e)}
