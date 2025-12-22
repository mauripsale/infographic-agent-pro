import os
import asyncio
import logging
import base64
import uuid
import mimetypes
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv
import uvicorn
from fastapi import FastAPI, HTTPException, Header, Depends
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.runners import Runner
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService
from google.adk.sessions import InMemorySessionService
from google import genai
from typing import Optional
from pydantic import BaseModel
from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError
from google.auth.exceptions import DefaultCredentialsError

# Import our agents factory
from script_agent.agent import create_script_agent

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize GCS client globally variable (will be set if bucket is configured)
storage_client = None

# Load environment variables
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).resolve().parent / '.env.local'
load_dotenv(dotenv_path=env_path)

# --- ADK ARTIFACT SERVICE INITIALIZATION ---
ARTIFACT_BUCKET = os.getenv("ARTIFACT_BUCKET")
if ARTIFACT_BUCKET:
    try:
        logger.info(f"Configuring GCS Artifact Service with bucket: {ARTIFACT_BUCKET}")
        storage_client = storage.Client()
        artifact_service = GcsArtifactService(bucket_name=ARTIFACT_BUCKET)
        ARTIFACT_SERVICE_URI = f"gs://{ARTIFACT_BUCKET}"
    except (DefaultCredentialsError, GoogleCloudError) as e:
        logger.error(f"Failed to initialize GCS client: {e}")
        storage_client = None
        artifact_service = InMemoryArtifactService()
        ARTIFACT_SERVICE_URI = "memory://"
        ARTIFACT_BUCKET = None
    except Exception as e:
        logger.exception(f"Unexpected error during GCS initialization: {e}")
        storage_client = None
        artifact_service = InMemoryArtifactService()
        ARTIFACT_SERVICE_URI = "memory://"
        ARTIFACT_BUCKET = None
else:
    logger.info("Using In-Memory Artifact Service (No ARTIFACT_BUCKET configured)")
    artifact_service = InMemoryArtifactService()
    ARTIFACT_SERVICE_URI = "memory://"

# --- ADK SESSION SERVICE INITIALIZATION ---
# Using InMemorySessionService by default for production stability on Cloud Run (stateless)
session_service = InMemorySessionService()
SESSION_SERVICE_URI = "memory://"

# --- ADK STANDARD CONFIGURATION ---
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))

# Use environment variable for frontend URL, fallback to local
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
ALLOWED_ORIGINS = [FRONTEND_URL, "http://localhost:8080"]
SERVE_WEB_INTERFACE = False

# Initialize ADK FastAPI App using the configured services
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

# Global lock to protect os.environ access
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

    runner = None
    try:
        # We use a lock to ensure thread safety during the critical section where
        # environment variables are modified for Agent/Client initialization AND execution.
        async with env_lock:
            keys_to_set = ("GOOGLE_API_KEY", "GEMINI_API_KEY")
            original_keys = {key: os.getenv(key) for key in keys_to_set}
            
            try:
                for key in keys_to_set:
                    os.environ[key] = api_key
                
                # Instantiate a fresh agent for this request
                local_agent = create_script_agent()

                runner = Runner(
                    agent=local_agent,
                    app_name="infographic-agent-pro",
                    session_service=session_service,
                    artifact_service=artifact_service
                )

                # Generate IDs for this request
                prompt = (
                    f"Generate a script of {request.slide_count} slides with detail level {request.detail_level} "
                    "based strictly on the USER CONTENT provided below.\n\n"
                    f"USER CONTENT:\n{request.source_content}"
                )
                
                session_id = str(uuid.uuid4())
                user_id = "default_user" 
                
                # Use run_debug to simplify session management.
                # Must be called INSIDE the lock to ensure env vars are present for lazy clients.
                events = await runner.run_debug(
                    user_messages=prompt,
                    session_id=session_id,
                    user_id=user_id,
                    quiet=True
                )
                
                text_parts = [
                    part.text
                    for event in events
                    if (content := getattr(event, "content", None))
                    for part in getattr(content, "parts", [])
                    if getattr(part, "text", None)
                ]
                
                return {"script": "\n".join(text_parts)}

            finally:
                # Restore original state
                for key, val in original_keys.items():
                    if val is not None:
                        os.environ[key] = val
                    else:
                        os.environ.pop(key, None)
            
    except Exception as e:
        logger.exception("Script generation failed")
        raise HTTPException(status_code=500, detail="Internal script generation error.")

@app.post("/api/generate-image")
async def generate_image(
    request: ImageRequest, 
    api_key: str = Depends(get_api_key)
):
    logger.info(f"Generating image using model: {request.model}...")

    try:
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
                    # USE ADK ARTIFACT SERVICE natively
                    mime_type = part.inline_data.mime_type or "image/png"
                    extension = mimetypes.guess_extension(mime_type) or ".png"
                    artifact_name = f"images/{uuid.uuid4()}{extension}"
                    
                    try:
                        # Save using ADK abstraction
                        await artifact_service.save(
                            name=artifact_name,
                            data=part.inline_data.data,
                            mime_type=mime_type
                        )
                        
                        if ARTIFACT_BUCKET:
                            bucket = storage_client.bucket(ARTIFACT_BUCKET)
                            blob = bucket.blob(artifact_name)
                            signed_url = blob.generate_signed_url(
                                version="v4",
                                expiration=timedelta(hours=1),
                                method="GET"
                            )
                            return {
                                "image_url": signed_url,
                                "mime_type": mime_type
                            }
                    except GoogleCloudError as cloud_error:
                        logger.error(f"GCS operation failed: {cloud_error}")
                    except Exception as artifact_error:
                        logger.error(f"Unexpected error in artifact service: {artifact_error}")

                    # Fallback to base64
                    image_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                    return {
                        "image_data": image_b64,
                        "mime_type": mime_type
                    }
        
        raise Exception("No image data returned from model.")

    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail="Internal image generation error.")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
