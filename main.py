import os
import asyncio
import logging
import base64
import uuid
from pathlib import Path
from dotenv import load_dotenv
import uvicorn
from fastapi import FastAPI, HTTPException, Header, Depends
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.runners import InMemoryRunner
from google import genai
from typing import Optional
from pydantic import BaseModel
from google.cloud import storage

# Import our agents to ensure they are available (though get_fast_api_app does discovery)
from script_agent import root_agent as script_agent

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize GCS client globally for reuse (thread-safe)
storage_client = storage.Client()

# Load environment variables
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).resolve().parent / '.env.local'
load_dotenv(dotenv_path=env_path)

# --- ADK STANDARD CONFIGURATION ---
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
# Use aiosqlite for async database session support
SESSION_SERVICE_URI = "sqlite+aiosqlite:///./sessions.db"
# Configure GCS Artifact Service if bucket provided
ARTIFACT_BUCKET = os.getenv("ARTIFACT_BUCKET")
ARTIFACT_SERVICE_URI = f"gs://{ARTIFACT_BUCKET}" if ARTIFACT_BUCKET else "memory://"

# Use environment variable for frontend URL, fallback to local
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ALLOWED_ORIGINS = [FRONTEND_URL, "http://localhost:8080"]
SERVE_WEB_INTERFACE = False # We have our own React frontend

# Initialize ADK FastAPI App
app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    session_service_uri=SESSION_SERVICE_URI,
    artifact_service_uri=ARTIFACT_SERVICE_URI,
    allow_origins=ALLOWED_ORIGINS,
    web=SERVE_WEB_INTERFACE,
)

# --- CUSTOM INFOGRAPHIC LOGIC ---

class ScriptRequest(BaseModel):
    source_content: str
    slide_count: int = 5
    detail_level: str = "balanced"

class ImageRequest(BaseModel):
    prompt: str
    model: str = "gemini-2.0-flash"
    aspect_ratio: str = "16:9"

env_lock = asyncio.Lock()

async def get_api_key(x_api_key: Optional[str] = Header(None)) -> str:
    api_key = x_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is required. Please provide it in the X-API-Key header.")
    return api_key

@app.post("/api/generate-script")
async def generate_script(
    request: ScriptRequest, 
    api_key: str = Depends(get_api_key)
):
    logger.info(f"Generating script for input of {len(request.source_content)} chars")

    # Lock to prevent race conditions as google-adk may read env vars lazily.
    async with env_lock:
        original_google_key = os.getenv("GOOGLE_API_KEY")
        original_gemini_key = os.getenv("GEMINI_API_KEY")
        
        try:
            os.environ["GOOGLE_API_KEY"] = api_key
            os.environ["GEMINI_API_KEY"] = api_key
            
            # Execute generation using the discovered script_agent
            runner = InMemoryRunner(agent=script_agent)
            
            prompt = (
                f"Generate a script of {request.slide_count} slides with detail level {request.detail_level} "
                "based strictly on the USER CONTENT provided below.\n\n"
                f"USER CONTENT:\n{request.source_content}"
            )
            
            events = await runner.run_debug(prompt)
            
            text_parts = [
                part.text
                for event in events
                if (content := getattr(event, "content", None))
                for part in getattr(content, "parts", [])
                if getattr(part, "text", None)
            ]
            
            return {"script": "\n".join(text_parts)}
            
        except Exception as e:
            logger.exception("Script generation failed")
            raise HTTPException(status_code=500, detail="Internal script generation error.")
        finally:
            if original_google_key:
                os.environ["GOOGLE_API_KEY"] = original_google_key
            else:
                os.environ.pop("GOOGLE_API_KEY", None)
            if original_gemini_key:
                os.environ["GEMINI_API_KEY"] = original_gemini_key
            else:
                os.environ.pop("GEMINI_API_KEY", None)

@app.post("/api/generate-image")
async def generate_image(
    request: ImageRequest, 
    api_key: str = Depends(get_api_key)
):
    logger.info(f"Generating image using model: {request.model}...")

    try:
        # The genai.Client accepts the API key directly, no lock needed here.
        client = genai.Client(api_key=api_key)
        
        system_instruction = (
            "Create a high-quality professional infographic image based on the user-provided segment below. "
            f"Style: professional, clean, aesthetic. Ratio: {request.aspect_ratio}"
        )
        full_prompt = f"{system_instruction}\n\nUSER SEGMENT: {request.prompt}"

        response = client.models.generate_content(
            model=request.model,
            contents=full_prompt
        )

        for candidate in response.candidates:
            for part in candidate.content.parts:
                if part.inline_data:
                    # If ARTIFACT_BUCKET is set, upload to GCS
                    if ARTIFACT_BUCKET:
                        try:
                            storage_client = storage.Client()
                            bucket = storage_client.bucket(ARTIFACT_BUCKET)
                            blob_name = f"images/{uuid.uuid4()}.png"
                            blob = bucket.blob(blob_name)
                            
                            blob.upload_from_string(
                                part.inline_data.data,
                                content_type=part.inline_data.mime_type or "image/png"
                            )
                            
                            # Use public URL assumption for simplicity, or signed URL
                            url = f"https://storage.googleapis.com/{ARTIFACT_BUCKET}/{blob_name}"
                            
                            return {
                                "image_url": url,
                                "mime_type": part.inline_data.mime_type or "image/png"
                            }
                        except Exception as upload_error:
                            logger.error(f"Failed to upload to GCS: {upload_error}")
                            # Fallback to base64 if upload fails

                    image_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                    return {
                        "image_data": image_b64,
                        "mime_type": part.inline_data.mime_type or "image/png"
                    }
        
        raise Exception("No image data returned from model.")

    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail="Internal image generation error.")

if __name__ == "__main__":
    # Use the PORT environment variable provided by Cloud Run, defaulting to 8080
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)