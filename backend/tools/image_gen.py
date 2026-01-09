import os
import uuid
import logging
from pathlib import Path
from google import genai
from google.genai import types
try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Fallback for local dev
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

class ImageGenerationTool:
    def __init__(self, api_key: str = None, bucket_name: str = None):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        self.bucket_name = bucket_name or os.environ.get("GCS_BUCKET_NAME")
        
    def generate_and_save(self, prompt: str, aspect_ratio: str = "16:9", model: str = "imagen-3.0-generate-001") -> str:
        """
        Generates an image using Imagen 3 and saves it to GCS or local static folder.
        """
        try:
            if not self.api_key:
                return "Error: Missing Google API Key."

            client = genai.Client(api_key=self.api_key)
            logger.info(f"🎨 Generating with {model}: {prompt[:40]}...")

            response = client.models.generate_images(
                model=model,
                prompt=f"Professional infographic, vector style: {prompt}",
                config=types.GenerateImagesConfig(
                    number_of_images=1,
                    aspect_ratio=aspect_ratio
                )
            )

            if not response.generated_images:
                return "Error: No image generated from API."

            image_bytes = response.generated_images[0].image.image_bytes
            filename = f"infographic_{uuid.uuid4().hex}.png"

            # 1. Try GCS Upload
            if GCS_AVAILABLE and self.bucket_name:
                try:
                    storage_client = storage.Client()
                    bucket = storage_client.bucket(self.bucket_name)
                    blob = bucket.blob(f"generated/{filename}")
                    blob.upload_from_string(image_bytes, content_type="image/png")
                    # Make public if needed, or return signed URL (keeping simple public URL for now if bucket is public)
                    return blob.public_url
                except Exception as gcs_err:
                    logger.warning(f"GCS Upload failed: {gcs_err}. Falling back to local storage.")

            # 2. Local Fallback
            filepath = STATIC_DIR / filename
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            
            # Return relative path for frontend
            return f"/static/{filename}"

        except Exception as e:
            logger.error(f"Generation Error: {e}")
            return f"Error: {str(e)}"
