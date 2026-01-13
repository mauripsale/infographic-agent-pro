import datetime
import io
import logging
import os
import time
import uuid
from pathlib import Path

from google import genai
from PIL import Image

try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

# Constants for better maintainability
_SIGNED_URL_EXPIRATION = datetime.timedelta(hours=1)
_MAX_RETRIES = 3

class ImageGenerationTool:
    def __init__(self, api_key: str = None, bucket_name: str = None):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        self.bucket_name = bucket_name or os.environ.get("GCS_BUCKET_NAME")
        
        if GCS_AVAILABLE and self.bucket_name:
            try:
                self.storage_client = storage.Client()
                self.bucket = self.storage_client.bucket(self.bucket_name)
            except Exception as e:
                logger.error(f"GCS Init Failed: {e}")
                self.bucket = None
        else:
            self.bucket = None

    def generate_and_save(self, prompt: str, aspect_ratio: str = "16:9", user_id: str = "anonymous") -> str:
        """
        Generates an image and saves it to GCS (preferred) or local static dir.
        Returns a Signed URL (GCS) or absolute URL (Local).
        """
        try:
            if not self.api_key:
                return "Error: Missing Google API Key."

            client = genai.Client(api_key=self.api_key)
            
            # Safeguard: ensure an image-capable model is used
            model_id = model_context.get()
            if "image" not in model_id:
                model_id = "gemini-2.5-flash-image"
            
            logger.info(f"🎨 Drawing for {user_id} using {model_id}: {prompt[:40]}...")

            image_bytes = None
            
            # Resilient retry mechanism with exponential backoff
            for attempt in range(_MAX_RETRIES):
                try:
                    response = client.models.generate_content(
                        model=model_id,
                        contents=f"Generate a professional infographic image. Style: {prompt}. Aspect Ratio: {aspect_ratio}"
                    )
                    if response.candidates and response.candidates[0].content.parts:
                        for part in response.candidates[0].content.parts:
                            if part.inline_data:
                                image_bytes = part.inline_data.data
                                break
                            elif hasattr(part, 'data') and part.data:
                                image_bytes = part.data
                                break
                    if image_bytes: break
                except Exception as api_err:
                    logger.warning(f"Attempt {attempt+1}/{_MAX_RETRIES} API Error: {api_err}")
                    if attempt < _MAX_RETRIES - 1:
                        time.sleep(2 ** attempt)

            if not image_bytes:
                return f"Error: Model {model_id} failed to generate image after {_MAX_RETRIES} attempts."

            # Convert/Sanitize to PNG with specific PIL exception handling
            try:
                img = Image.open(io.BytesIO(image_bytes))
                if img.mode != 'RGB': 
                    img = img.convert('RGB')
                output_buffer = io.BytesIO()
                img.save(output_buffer, format="PNG")
                image_bytes = output_buffer.getvalue()
            except (Image.UnidentifiedImageError, IOError) as pil_err:
                logger.error(f"PIL Conversion Error: {pil_err}")
                return f"Error processing image data: {str(pil_err)}"
            except Exception as e:
                logger.error(f"Unexpected image processing error: {e}")
                return f"Unexpected error during image processing: {str(e)}"

            filename = f"img_{uuid.uuid4().hex}.png"

            # 1. GCS Upload (Primary)
            if self.bucket:
                try:
                    blob_path = f"users/{user_id}/generated/{filename}"
                    blob = self.bucket.blob(blob_path)
                    blob.upload_from_string(image_bytes, content_type="image/png")
                    
                    # Generate Signed URL
                    url = blob.generate_signed_url(
                        version="v4",
                        expiration=_SIGNED_URL_EXPIRATION,
                        method="GET"
                    )
                    return url
                except Exception as gcs_err:
                    logger.error(f"GCS Upload failed: {gcs_err}. Falling back to local.")

            # 2. Local Fallback
            filepath = STATIC_DIR / filename
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            
            backend_url = os.environ.get("BACKEND_URL", "http://localhost:8080")
            return f"{backend_url}/static/{filename}"

        except Exception as e:
            logger.error(f"Generation Fatal Error: {e}")
            return f"Error: {str(e)}"
