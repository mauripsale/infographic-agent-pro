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
from google.adk.cli.fast_api import get_fast_api_app
from google.adk.runners import Runner
from google.adk.artifacts import GcsArtifactService, InMemoryArtifactService
from google.adk.sessions import InMemorySessionService
from google.adk.models.google_llm import Gemini
from google.adk.agents import Agent
from google import genai
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from google.cloud import storage
from google.cloud.exceptions import GoogleCloudError
from google.auth.exceptions import DefaultCredentialsError
import firebase_admin
from firebase_admin import credentials, firestore

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Firebase Admin SDK
# On Cloud Run, it uses Application Default Credentials automatically.
try:
    if not firebase_admin._apps:
        firebase_admin.initialize_app()
    db = firestore.client()
    logger.info("Firebase Admin initialized successfully.")
except Exception as e:
    logger.error(f"Failed to initialize Firebase Admin: {e}")
    db = None

# Initialize GCS client globally variable
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
session_service = InMemorySessionService()
SESSION_SERVICE_URI = "memory://"

# --- ADK STANDARD CONFIGURATION ---
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_URL = os.getenv("FRONTEND_URL", "https://qwiklabs-asl-04-f9d4ba2925b9.web.app")
ALLOWED_ORIGINS = [
    FRONTEND_URL, 
    "https://qwiklabs-asl-04-f9d4ba2925b9.firebaseapp.com",
    "http://localhost:3000", 
    "http://localhost:8080",
    "http://localhost:5173"
]
SERVE_WEB_INTERFACE = False

app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    session_service_uri=SESSION_SERVICE_URI,
    artifact_service_uri=ARTIFACT_SERVICE_URI,
    allow_origins=ALLOWED_ORIGINS,
    web=SERVE_WEB_INTERFACE,
)

# --- MODELS ---

class ScriptRequest(BaseModel):
    source_content: str
    slide_count: int = 5
    detail_level: str = "balanced"
    target_language: str = "English"

class JobResponse(BaseModel):
    job_id: str = Field(alias="jobId")
    status: str

    model_config = {
        "populate_by_name": True
    }

class ImageRequest(BaseModel):
    prompt: str
    model: str = "gemini-2.5-flash"
    aspect_ratio: str = "16:9"

async def get_api_key(x_api_key: Optional[str] = Header(None)) -> str:
    api_key = x_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is required. Please provide it in the X-API-Key header.")
    return api_key

# --- BACKGROUND TASKS ---

async def process_script_generation(job_id: str, request_data: ScriptRequest, api_key: str):
    """
    Background task that generates the script and updates Firestore.
    """
    logger.info(f"Starting background job {job_id}...")
    
    if not db:
        logger.error("Firestore DB not initialized. Cannot process job.")
        return

    doc_ref = db.collection('jobs').document(job_id)

    try:
        # Update status to processing
        doc_ref.set({
            'status': 'processing',
            'createdAt': firestore.SERVER_TIMESTAMP,
            'request': request_data.model_dump()
        }, merge=True)

        # --- ADK GENERATION LOGIC ---
        user_genai_client = genai.Client(api_key=api_key)
        user_model = Gemini(model="gemini-2.5-flash")
        user_model.api_client = user_genai_client

        local_agent = Agent(
            name="InfographicScriptDesigner",
            model=user_model,
            instruction=textwrap.dedent(f"""
                You are an expert Infographic Script Designer. 
                Transform the provided content into a structured infographic script.
                
                LANGUAGE RULE: The body and title of the slides MUST be in {request_data.target_language}.
                If the source content is in a different language, TRANSLATE it to {request_data.target_language}.
                
                TECHNICAL FORMAT RULE (CRITICAL): 
                Each slide MUST start with the exact header format: "#### Slide X/Y: [Title]".
                Do NOT translate the word "Slide". Do NOT use "Infografica", "Diapositiva" or other terms.
                Always use "#### Slide" followed by the number.
                
                Mandatory format for each slide:
                #### Slide X/Y: [Title]
                - Layout: [Visual description]
                - Body: [Main text]
                - Details: [Style, colors]""")
        )

        runner = Runner(
            agent=local_agent,
            app_name="infographic-agent-pro",
            session_service=session_service,
            artifact_service=artifact_service
        )

        prompt = (
            f"Generate a script of {request_data.slide_count} slides with detail level {request_data.detail_level} "
            "based strictly on the USER CONTENT provided below.\n\n"
            f"USER CONTENT:\n{request_data.source_content}"
        )
        
        session_id = str(uuid.uuid4())
        user_id = "default_user" # We could use the Firebase User ID if available

        # Run the generation
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
        
        final_script = "\n".join(text_parts)

        # --- UPDATE FIRESTORE ---
        doc_ref.update({
            'status': 'completed',
            'result': {
                'script': final_script
            },
            'completedAt': firestore.SERVER_TIMESTAMP
        })
        logger.info(f"Job {job_id} completed successfully.")

    except Exception as e:
        logger.exception(f"Job {job_id} failed: {e}")
        doc_ref.update({
            'status': 'failed',
            'error': str(e),
            'completedAt': firestore.SERVER_TIMESTAMP
        })

# --- ENDPOINTS ---

@app.post("/api/generate-script", response_model=JobResponse)
async def generate_script(
    request: ScriptRequest, 
    background_tasks: BackgroundTasks,
    api_key: str = Depends(get_api_key)
):
    """
    Starts an asynchronous script generation job.
    Returns a Job ID immediately.
    """
    if not db:
        raise HTTPException(status_code=503, detail="Firestore service unavailable")

    job_id = str(uuid.uuid4())
    logger.info(f"Queueing job {job_id} for input of {len(request.source_content)} chars")

    # Create initial document
    db.collection('jobs').document(job_id).set({
        'status': 'pending',
        'createdAt': firestore.SERVER_TIMESTAMP
    })

    # Add task to background queue
    background_tasks.add_task(process_script_generation, job_id, request, api_key)

    return {"jobId": job_id, "status": "pending"}

@app.post("/api/generate-image")
async def generate_image(
    request: ImageRequest, 
    api_key: str = Depends(get_api_key)
):
    logger.info(f"Generating image using model: {request.model}...")
    # Image generation is usually fast enough for sync calls (10-20s), 
    # but could be async too. Keeping sync for now to minimize changes.
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
                    mime_type = part.inline_data.mime_type or "image/png"
                    extension = mimetypes.guess_extension(mime_type) or ".png"
                    artifact_name = f"images/{uuid.uuid4()}{extension}"
                    
                    # Generate a temp session ID for this artifact save operation
                    temp_session_id = str(uuid.uuid4())
                    logger.info(f"Attempting to save artifact '{artifact_name}' with session_id='{temp_session_id}'")
                    
                    try:
                        # Use correct ADK save_artifact method with session_id
                        await artifact_service.save_artifact(
                            app_name="infographic-agent-pro",
                            user_id="default_user",
                            session_id=temp_session_id,
                            filename=artifact_name,
                            artifact=genai.types.Part(
                                inline_data=genai.types.Blob(
                                    mime_type=mime_type,
                                    data=part.inline_data.data
                                )
                            )
                        )
                        if ARTIFACT_BUCKET:
                            bucket = storage_client.bucket(ARTIFACT_BUCKET)
                            # ADK GCS implementation likely adds prefixes, but if we construct path manually:
                            # Let's trust ADK pathing logic or manual blob access if we knew the path.
                            # ADK uses: {app_name}/{user_id}/{session_id}/{filename}
                            # So we must replicate that path to find the blob.
                            storage_path = f"infographic-agent-pro/default_user/{temp_session_id}/{artifact_name}"
                            
                            blob = bucket.blob(storage_path)
                            signed_url = blob.generate_signed_url(
                                version="v4",
                                expiration=timedelta(hours=1),
                                method="GET"
                            )
                            return {"image_url": signed_url, "mime_type": mime_type}
                    except GoogleCloudError as gce:
                        logger.error(f"GCS operation failed: {gce}")
                    except Exception as e:
                        logger.error(f"Artifact save failed: {e}")

                    image_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                    return {"image_data": image_b64, "mime_type": mime_type}
        
        raise Exception("No image data returned from model.")

    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail="Internal image generation error.")

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run(app, host="0.0.0.0", port=port)
