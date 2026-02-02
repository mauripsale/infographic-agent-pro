import os
import logging
import json
import asyncio
import re
import tempfile
import uuid
from typing import Optional
from pathlib import Path

from fastapi import FastAPI, Request, UploadFile, File, Depends, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import firebase_admin
from firebase_admin import auth as firebase_auth, firestore
from google.cloud import storage

# --- ENV SANITIZATION (CRITICAL: Must run before Tool Initialization) ---
def sanitize_env():
    bad_bucket = "infographic-agent-pro-assets"
    if os.environ.get("GCS_BUCKET_NAME") == bad_bucket:
        logging.warning(f"Removing toxic env var GCS_BUCKET_NAME={bad_bucket}")
        del os.environ["GCS_BUCKET_NAME"]
sanitize_env()

# ADK Core
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.artifacts import InMemoryArtifactService, GcsArtifactService
from google.genai import types
from google import genai

# Project Components
try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

from agents.infographic_agent.agent import create_refiner_agent
from agents.infographic_agent.team import create_infographic_team
from tools.image_gen import ImageGenerationTool
from tools.export_tool import ExportTool
from tools.security_tool import security_service
from tools.slides_tool import GoogleSlidesTool
from tools.storage_tool import StorageTool
from services.firestore_session import FirestoreSessionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- INITIALIZATION ---

def get_or_create_bucket():
    """Robustly determines the GCS bucket to use."""
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")
    env_bucket = os.environ.get("GCS_BUCKET_NAME") # sanitized above
    
    storage_client = storage.Client(project=project_id)
    
    # 1. Try Configured Bucket
    if env_bucket:
        try:
            bucket = storage_client.bucket(env_bucket)
            if bucket.exists():
                return env_bucket
        except Exception as e:
            logger.warning(f"Bucket check failed: {e}")

    # 2. Try Discovery
    if project_id:
        try:
            buckets = list(storage_client.list_buckets())
            for b in buckets:
                if "infographic-assets" in b.name or "ipsa-assets" in b.name:
                    return b.name
        except Exception as e:
            logger.warning(f"Discovery failed: {e}")

    # 3. Best Guess Fallback
    if project_id:
        return f"{project_id}-infographic-assets"
    
    return None

gcs_bucket = get_or_create_bucket()

if gcs_bucket:
    os.environ["GCS_BUCKET_NAME"] = gcs_bucket 
    artifact_service = GcsArtifactService(bucket_name=gcs_bucket)
    logger.info(f"Using GCS bucket: {gcs_bucket}")
else:
    artifact_service = InMemoryArtifactService()
    logger.warning("Using InMemory storage (stateless).")

storage_tool = StorageTool(artifact_service)

# Firebase
try:
    firebase_admin.initialize_app()
except ValueError:
    pass
db = firestore.client() if firebase_admin._apps else None
session_service = FirestoreSessionService(db) if db else InMemorySessionService()

app = FastAPI()

# --- HELPER FUNCTIONS ---

async def get_user_id(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        decoded_token = firebase_auth.verify_id_token(auth_header.split("Bearer ")[1])
        return decoded_token['uid']
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_api_key(request: Request, user_id: str = Depends(get_user_id)) -> str:
    api_key = request.headers.get("x-goog-api-key")
    if not api_key and db:
        doc = db.collection("users").document(user_id).get()
        if doc.exists:
            encrypted_key = doc.to_dict().get("gemini_api_key")
            if encrypted_key:
                api_key = security_service.decrypt_data(encrypted_key)
    if not api_key:
        raise HTTPException(status_code=401, detail="Missing Gemini API Key")
    return api_key

# --- MIDDLEWARE ---
class ModelSelectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS": return await call_next(request)
        token = model_context.set(request.headers.get("X-GenAI-Model", "gemini-2.5-flash-image"))
        try: return await call_next(request)
        finally: model_context.reset(token)

app.add_middleware(ModelSelectionMiddleware)
app.add_middleware(
    CORSMiddleware, 
    allow_origins=os.environ.get("ALLOWED_CORS_ORIGINS", "*").split(","),
    allow_credentials=True, 
    allow_methods=["*"], 
    allow_headers=["*"]
)

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# --- ENDPOINTS ---

@app.get("/user/projects")
async def list_projects(user_id: str = Depends(get_user_id)):
    if not db: return []
    docs = db.collection("users").document(user_id).collection("projects").order_by("created_at", direction=firestore.Query.DESCENDING).limit(50).stream()
    return [{**d.to_dict(), "id": d.id} for d in docs]

@app.get("/user/projects/{project_id}")
async def get_project(project_id: str, user_id: str = Depends(get_user_id)):
    if not db: raise HTTPException(status_code=500)
    doc = db.collection("users").document(user_id).collection("projects").document(project_id).get()
    if not doc.exists: raise HTTPException(status_code=404)
    return doc.to_dict()

@app.post("/agent/stream")
async def agent_stream(request: Request, user_id: str = Depends(get_user_id), api_key: str = Depends(get_api_key)):
    try:
        data = await request.json()
        phase = data.get("phase", "script")
        project_id = data.get("project_id") or uuid.uuid4().hex
        surface_id = "infographic_workspace"

        async def event_generator():
            yield json.dumps({"createSurface": {"surfaceId": surface_id, "catalogId": "https://a2ui.dev/specification/0.9/standard_catalog_definition.json"}}) + "\n"

            if phase == "script":
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "status", "component": "Text", "text": "🧠 Planning content..."}]}}) + "\n"
                agent = create_infographic_team(api_key=api_key)
                runner = Runner(agent=agent, app_name="infographic-pro", session_service=session_service)
                session = await runner.session_service.create_session(app_name="infographic-pro", user_id=user_id, session_id=f"{user_id}_{project_id}")
                
                agent_output = ""
                async for event in runner.run_async(session_id=session.id, user_id=user_id, new_message=types.Content(role="user", parts=[types.Part(text=data.get("query", ""))])):
                    if await request.is_disconnected(): break
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text:
                                agent_output += part.text
                                # yield log for feedback
                                yield json.dumps({"log": part.text[:100] + "..."}) + "\n"

                # Extract JSON from agent_output (robust)
                match = re.search(r'(\{.*\})', agent_output.replace("\n", " "), re.DOTALL)
                if match:
                    script_data = json.loads(match.group(1))
                    if db:
                        db.collection("users").document(user_id).collection("projects").document(project_id).set({
                            "query": data.get("query"), "script": script_data, "status": "script_ready", "created_at": firestore.SERVER_TIMESTAMP
                        }, merge=True)
                    yield json.dumps({"updateDataModel": {"surfaceId": surface_id, "path": "/", "op": "replace", "value": {"script": script_data, "project_id": project_id}}}) + "\n"
                else:
                    yield json.dumps({"log": "Error: Agent failed to produce valid plan."}) + "\n"

            elif phase == "graphics":
                script = data.get("script", {})
                slides = script.get("slides", [])
                ar = script.get("global_settings", {}).get("aspect_ratio", "16:9")
                logo_url = await get_project_logo(user_id, project_id) if db else None
                img_tool = ImageGenerationTool(api_key=api_key, bucket_name=gcs_bucket)
                
                batch_updates = {}
                for slide in slides:
                    if await request.is_disconnected(): break
                    sid = slide['id']
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Text", "text": "🎨 Generating image...", "status": "generating"}]}}) + "\n"
                    
                    # Direct tool call for reliability (reverting problematic nested agent)
                    img_url = await asyncio.to_thread(img_tool.generate_and_save, slide['image_prompt'], aspect_ratio=ar, user_id=user_id, project_id=project_id, logo_url=logo_url)
                    
                    if "http" in img_url:
                        batch_updates[sid] = img_url
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Column", "children": [f"t_{sid}", f"i_{sid}"], "status": "success"}, {"id": f"t_{sid}", "component": "Text", "text": slide['title']}, {"id": f"i_{sid}", "component": "Image", "src": img_url}]}}) + "\n"
                    else:
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Text", "text": f"⚠️ {img_url}", "status": "error"}]}}) + "\n"

                if db and project_id and batch_updates:
                    doc = db.collection("users").document(user_id).collection("projects").document(project_id).get()
                    if doc.exists:
                        full_script = doc.to_dict().get("script", {})
                        for s in full_script.get("slides", []):
                            if s['id'] in batch_updates: s['image_url'] = batch_updates[s['id']]
                        db.collection("users").document(user_id).collection("projects").document(project_id).update({"script": full_script, "status": "completed"})
                
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "status", "component": "Text", "text": "✨ All images ready!"}]}}) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")
    except Exception as e:
        logger.error(f"Stream Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

async def get_project_logo(user_id: str, project_id: str):
    return None # Placeholder

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
