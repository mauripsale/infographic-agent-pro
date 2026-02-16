import os
import io
import uuid
import logging
import datetime
from google import genai
from google.genai import types
from PIL import Image

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ImageGenerationTool:
    def __init__(self, api_key: str = None, storage_tool = None):
        self.api_key = api_key or os.environ.get("GOOGLE_API_KEY")
        if not self.api_key:
            raise ValueError("GOOGLE_API_KEY is required for image generation.")
        
        self.client = genai.Client(api_key=self.api_key)
        self.storage_tool = storage_tool
        
        if not self.storage_tool:
            logger.warning("No StorageTool provided. Images will not be saved.")

    def generate_and_save(self, prompt: str, aspect_ratio: str = "16:9", user_id: str = None, project_id: str = None, logo_url: str = None, model: str = "gemini-3-pro-image-preview") -> dict:
        """
        Generates an image using Nano Banana (Gemini Image models) and saves it via ADK Artifact Service (StorageTool).
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

            # Upload via StorageTool (ADK Artifact Abstraction)
            if self.storage_tool:
                filename = f"{uuid.uuid4()}.png"
                
                # Use StorageTool logic for path
                if project_id and user_id:
                    remote_path = self.storage_tool.get_project_asset_path(user_id, project_id, filename)
                elif user_id:
                    remote_path = f"users/{user_id}/generated/{filename}"
                else:
                    remote_path = f"public/generated/{filename}"
                
                # Upload and get Signed URL
                url = self.storage_tool.upload_bytes(image_bytes, remote_path, content_type="image/png")
                
                logger.info(f"✅ Upload Success via ADK: {url[:50]}...")
                return {"url": url, "path": remote_path}
            else:
                return {"error": "StorageTool not configured."}

        except Exception as e:
            logger.error(f"Generation Fatal Error: {e}")
            return {"error": str(e)}
