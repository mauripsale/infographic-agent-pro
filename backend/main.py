import os
import asyncio
import logging
import base64
import uuid
import mimetypes
import json
import textwrap
from datetime import timedelta
from pathlib import Path
from dotenv import load_dotenv
import uvicorn
from fastapi import FastAPI, HTTPException, Header, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types as genai_types
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError
from google.auth.exceptions import DefaultCredentialsError
import firebase_admin
from firebase_admin import credentials, firestore

# Load environment variables at the very beginning
load_dotenv()

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()
    logger.info("Firebase Admin initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize Firebase Admin: {e}")
    db = None

# Initialize GCS client
storage_client = None
ARTIFACT_BUCKET = os.getenv("ARTIFACT_BUCKET")
if ARTIFACT_BUCKET:
    try:
        storage_client = storage.Client()
        logger.info(f"GCS client initialized for bucket: {ARTIFACT_BUCKET}")
    except (DefaultCredentialsError, GoogleCloudError) as e:
        logger.error(f"Failed to initialize GCS client: {e}")

# --- FastAPI App Initialization ---
app = FastAPI()

# CORS Configuration
env_origins_str = os.getenv("ALLOWED_ORIGINS", "")
ALLOWED_ORIGINS = [url.strip() for url in env_origins_str.split(",") if url.strip()]
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = ["http://localhost:3000", "http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models ---
class ScriptRequest(BaseModel):
    source_content: str
    slide_count: int = 5
    detail_level: str = "balanced"
    target_language: str = "English"
    model: str = "gemini-1.5-flash-latest"

class ImageRequest(BaseModel):
    prompt: str
    model: str = "gemini-1.5-flash-latest"
    aspect_ratio: str = "16:9"

async def get_api_key(x_api_key: Optional[str] = Header(None)) -> str:
    api_key = x_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is required.")
    return api_key

# --- API Endpoints ---
@app.post("/api/generate-script")
async def generate_script(request: ScriptRequest, api_key: str = Depends(get_api_key)):
    logger.info(f"Generating script with model: {request.model}...")
    try:
        client = genai.Client(api_key=api_key)

        prompt = (
            f"Generate a script of {request.slide_count} slides with detail level {request.detail_level} "
            f"based strictly on the USER CONTENT provided below. The output must be in {request.target_language}.\n\n"
            "Each slide MUST start with the exact header format: '#### Slide X/Y: [Title]'.\n\n"
            f"USER CONTENT:\n{request.source_content}"
        )

        response = await client.models.generate_content_async(
            model=request.model, 
            contents=prompt
        )
        
        if not response.parts:
            finish_reason = response.candidates[0].finish_reason if response.candidates else 'UNKNOWN'
            logger.error(f"Script generation blocked. Finish Reason: {finish_reason}")
            raise HTTPException(status_code=500, detail=f"Script generation failed with reason: {finish_reason}")
            
        return {"text": response.text}
    except Exception as e:
        logger.exception("Script generation failed")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Internal script generation error.")

@app.post("/api/generate-image")
async def generate_image(request: ImageRequest, api_key: str = Depends(get_api_key)):
    logger.info(f"Generating image using model: {request.model}...")
    try:
        client = genai.Client(api_key=api_key)

        system_instruction = (
            "Create a high-quality professional infographic image based on the user-provided segment below. "
            f"Style: professional, clean, aesthetic. Ratio: {request.aspect_ratio}"
        )
        full_prompt = f"{system_instruction}\n\nUSER SEGMENT: {request.prompt}"
        
        response = await client.models.generate_content_async(
            model=request.model,
            contents=full_prompt,
            generation_config=genai_types.GenerationConfig(response_mime_type="image/png")
        )
        
        if not response.parts:
            finish_reason = response.candidates[0].finish_reason if response.candidates else 'UNKNOWN'
            safety_ratings = response.candidates[0].safety_ratings if response.candidates else []
            logger.error(
                f"Image generation blocked. Finish Reason: {finish_reason}. "
                f"Safety Ratings: {safety_ratings}"
            )
            if finish_reason == 'SAFETY':
                details = ", ".join([f"{r.category.name}={r.probability.name}" for r in safety_ratings])
                raise HTTPException(status_code=400, detail=f"Image generation blocked. Details: {details}")
            else:
                raise HTTPException(status_code=500, detail=f"Image generation failed with reason: {finish_reason}")
            
        part = response.parts[0]
        if not part.inline_data:
             raise HTTPException(status_code=500, detail="No image data in response.")

        mime_type = part.inline_data.mime_type
        image_data = part.inline_data.data

        if storage_client and ARTIFACT_BUCKET:
            bucket = storage_client.bucket(ARTIFACT_BUCKET)
            extension = mimetypes.guess_extension(mime_type) or ".png"
            blob_name = f"images/{uuid.uuid4()}{extension}"
            blob = bucket.blob(blob_name)
            
            blob.upload_from_string(image_data, content_type=mime_type)
            
            url_expiration_hours = int(os.getenv("SIGNED_URL_EXPIRATION_HOURS", 1))
            signed_url = blob.generate_signed_url(version="v4", expiration=timedelta(hours=url_expiration_hours))
            
            return {"image_url": signed_url, "mime_type": mime_type}
        
        image_b64 = base64.b64encode(image_data).decode('utf-8')
        return {"image_data": image_b64, "mime_type": mime_type}

    except Exception as e:
        logger.exception("Image generation failed")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail="Internal image generation error.")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)