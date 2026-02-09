import os
import io
import uuid
import logging
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
        Generates an image using Imagen 3 and saves it to GCS.
        """
        try:
            logger.info(f"Generating image with prompt: {prompt[:50]}... | Model: {model}")
            
            # Map aspect ratio string to dimensions or enum
            # Imagen 3 supports '16:9', '1:1', '4:3' etc. directly or via ratio
            # For simplicity using '1:1' as default if not matched, but Imagen handles strings well usually.
            
            response = self.client.models.generate_images(
                model=model,
                prompt=prompt,
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio=aspect_ratio,
                    safety_filter_level="block_only_high",
                    person_generation="allow_adult"
                )
            )

            if not response.generated_images:
                logger.error("No images generated.")
                return "Error: No image generated."

            image_bytes = response.generated_images[0].image.image_bytes
            
            # Post-processing (Watermark) if logo provided
            if logo_url:
                try:
                    base_image = Image.open(io.BytesIO(image_bytes))
                    # Basic watermark logic could go here
                    # For now just returning the generated image
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
                
                # Make Public
                try:
                    # Try explicit ACL first
                    # blob.make_public() 
                    # logger.info(f"✅ GCS Public Access Enabled")
                    pass # Skip explicit ACL as it often fails with Uniform Bucket Access
                except Exception as acl_err:
                    logger.warning(f"Could not set ACL: {acl_err}")

                # Return public URL
                url = f"https://storage.googleapis.com/{self.bucket_name}/{blob_path}"
                logger.info(f"✅ GCS Upload Success: {url}")
                return url
            else:
                return "Error: GCS bucket not configured."

        except Exception as e:
            logger.error(f"Generation Fatal Error: {e}")
            return f"Error: {str(e)}"
