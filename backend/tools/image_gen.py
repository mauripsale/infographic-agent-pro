import os
import uuid
import logging
import json
import time
import io
from pathlib import Path
from PIL import Image
from google import genai
from google.genai import types

try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

try:
    from google.cloud import storage
    GCS_AVAILABLE = True
except ImportError:
    GCS_AVAILABLE = False

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

class ImageGenerationTool:
    def __init__(self, api_key: str = None, bucket_name: str = None):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        self.bucket_name = bucket_name or os.environ.get("GCS_BUCKET_NAME")
        
    def generate_and_save(self, prompt: str, aspect_ratio: str = "16:9") -> str:
        """
        Generates an image using Nano Banana (Gemini Image) models.
        """
        try:
            if not self.api_key:
                return "Error: Missing Google API Key."

            client = genai.Client(api_key=self.api_key)
            
            model_id = model_context.get()
            if "image" not in model_id:
                model_id = "gemini-2.5-flash-image"

            logger.info(f"🎨 Nano Banana [Model: {model_id}] is drawing: {prompt[:40]}...")

            image_bytes = None
            max_retries = 3
            
            for attempt in range(max_retries):
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
                    
                    if image_bytes:
                        break # Success!
                    else:
                        logger.warning(f"Attempt {attempt+1}/{max_retries} failed: No image data returned.")
                except Exception as api_err:
                    logger.warning(f"Attempt {attempt+1}/{max_retries} API Error: {api_err}")
                    time.sleep(2 ** attempt) # Exponential Backoff (1, 2, 4 seconds)

            if not image_bytes:
                return f"Error: Model {model_id} failed after {max_retries} attempts."

            # --- FORCE VALID PNG CONVERSION ---
            try:
                # Open bytes as image
                img = Image.open(io.BytesIO(image_bytes))
                # Convert to RGB (strips alpha channel for PDF compatibility)
                if img.mode != 'RGB':
                    img = img.convert('RGB')
                
                # Save to new bytes buffer as pure PNG
                output_buffer = io.BytesIO()
                img.save(output_buffer, format="PNG")
                image_bytes = output_buffer.getvalue()
            except (Image.UnidentifiedImageError, IOError) as pil_err:
                logger.error(f"PIL Conversion Error: {pil_err}")
                return f"Error processing image data: {str(pil_err)}"
            except Exception as e:
                logger.error(f"Unexpected image processing error: {e}")
                return f"Unexpected error during image processing: {str(e)}"
            # ----------------------------------

            filename = f"infographic_{uuid.uuid4().hex}.png"

            # 1. GCS Upload
            if GCS_AVAILABLE and self.bucket_name:
                try:
                    storage_client = storage.Client()
                    bucket = storage_client.bucket(self.bucket_name)
                    blob = bucket.blob(f"generated/{filename}")
                    blob.upload_from_string(image_bytes, content_type="image/png")
                    return blob.public_url
                except Exception as gcs_err:
                    logger.warning(f"GCS Upload failed: {gcs_err}")

            # 2. Local Fallback
            filepath = STATIC_DIR / filename
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            
            # Return absolute URL for the separate frontend
            backend_url = "https://infographic-agent-backend-218788847170.us-central1.run.app"
            return f"{backend_url}/static/{filename}"

        except Exception as e:
            logger.error(f"Generation Error: {e}")
            return f"Error: {str(e)}"