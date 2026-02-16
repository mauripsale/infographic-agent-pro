import os
import io
import uuid
import logging
import datetime  # Added for Signed URL expiration
from datetime import timedelta # Added for Signed URL expiration
import requests
from google import genai
from google.genai import types
from PIL import Image
from google.cloud import storage

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ImageGenerationTool:
    def __init__(self, api_key: str = None, bucket_name: str = None):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY is required for image generation.")
        
        self.client = genai.Client(api_key=self.api_key)
        self.bucket_name = bucket_name or os.environ.get("GCS_BUCKET_NAME")
        
        if self.bucket_name:
            try:
                self.storage_client = storage.Client()
                self.bucket = self.storage_client.bucket(self.bucket_name)
            except Exception as e:
                logger.error(f"Failed to initialize GCS client: {e}")
                self.bucket = None
        else:
            logger.warning("No GCS_BUCKET_NAME provided. Images will not be saved to GCS.")
            self.bucket = None

    def generate_and_save(self, prompt: str, aspect_ratio: str = "16:9", user_id: str = None, project_id: str = None, logo_url: str = None, model: str = "gemini-3-pro-image-preview"):
        """
        Generates an image using Nano Banana (Gemini Image models) and saves it to GCS.
        Returns a Signed URL valid for 7 days.
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
                return "Error: No image generated."
            
            # Post-processing (Watermark) placeholder
            if logo_url:
                try:
                    pass 
                except Exception as e:
                    logger.warning(f"Watermarking failed: {e}")

            # Upload to GCS
            if self.bucket:
                filename = f"{uuid.uuid4()}.png"
                if project_id:
                    blob_path = f"users/{user_id}/projects/{project_id}/assets/{filename}"
                else:
                    blob_path = f"users/{user_id}/generated/{filename}"
                    
                blob = self.bucket.blob(blob_path)
                blob.upload_from_string(image_bytes, content_type="image/png")
                
                # Generate Signed URL (Valid for 7 days)
                try:
                    url = blob.generate_signed_url(
                        version="v4",
                        expiration=datetime.timedelta(days=7),
                        method="GET"
                    )
                    logger.info(f"✅ GCS Signed URL Generated: {url[:50]}...")
                    return url
                except Exception as sign_err:
                    logger.error(f"Failed to generate signed URL: {sign_err}")
                    # Fallback to public URL format (might still be 403, but better than crashing)
                    return f"https://storage.googleapis.com/{self.bucket_name}/{blob_path}"
            else:
                return "Error: GCS bucket not configured."

        except Exception as e:
            logger.error(f"Generation Fatal Error: {e}")
            return f"Error: {str(e)}"
