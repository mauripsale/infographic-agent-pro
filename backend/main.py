import os
import logging
import json
import asyncio
import re
import tempfile
import uuid
from pathlib import Path

from fastapi import FastAPI, Request, UploadFile, File, Depends, HTTPException, Body
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import firebase_admin
from firebase_admin import auth as firebase_auth, firestore

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

from agents.infographic_agent.agent import create_infographic_agent
from tools.image_gen import ImageGenerationTool
from tools.export_tool import ExportTool
from tools.security_tool import security_service
from tools.slides_tool import GoogleSlidesTool
from tools.storage_tool import StorageTool
from services.firestore_session import FirestoreSessionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- INITIALIZATION ---

# 1. Artifact Service
gcs_bucket = os.environ.get("GCS_BUCKET_NAME")
if gcs_bucket:
    artifact_service = GcsArtifactService(bucket_name=gcs_bucket)
    logger.info(f"Initialized GcsArtifactService with bucket: {gcs_bucket}")
else:
    artifact_service = InMemoryArtifactService()
    logger.warning("GCS_BUCKET_NAME not set. Using InMemoryArtifactService (artifacts will be lost on restart).")

# 2. Storage Tool
storage_tool = StorageTool(artifact_service)

# 3. Firebase & Firestore
try:
    firebase_admin.initialize_app()
except ValueError:
    pass

try:
    db = firestore.client()
except Exception as e:
    logger.warning(f"Firestore init failed: {e}")
    db = None

# 4. Session Service
if db:
    session_service = FirestoreSessionService(db)
    logger.info("Initialized FirestoreSessionService")
else:
    session_service = InMemorySessionService()
    logger.warning("Firestore unavailable. Using InMemorySessionService (sessions lost on restart).")


app = FastAPI()

# --- HELPER FUNCTIONS (Must be defined before Endpoints) ---

async def get_user_id(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authentication token")
    
    token = auth_header.split("Bearer ")[1]
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token['uid']
    except (firebase_auth.InvalidIdTokenError, ValueError) as e:
        logger.error(f"Auth Error: {e}")
        raise HTTPException(status_code=401, detail="Invalid token")

def get_decrypted_api_key(user_id: str) -> str:
    """Retrieves and decrypts the user's API key from Firestore."""
    if not db: return ""
    try:
        doc = db.collection("users").document(user_id).get()
        if doc.exists:
            data = doc.to_dict()
            encrypted_key = data.get("gemini_api_key")
            if encrypted_key:
                val = security_service.decrypt_data(encrypted_key)
                return val if val else ""
    except Exception as e:
        logger.error(f"Firestore Read Error for {user_id}: {e}")
    return ""

async def get_api_key(request: Request, user_id: str = Depends(get_user_id)) -> str:
    """Dependency to get API key with strict fallback: Header -> Firestore. NO SYSTEM DEFAULT."""
    # Check header first (explicit override for dev/debug)
    api_key = request.headers.get("x-goog-api-key")
    
    # Then Firestore (user settings)
    if not api_key:
        api_key = get_decrypted_api_key(user_id)
        
    if not api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing Gemini API Key. Please go to Settings to configure it.",
        )
    return api_key

# --- MIDDLEWARE ---
class ModelSelectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS": return await call_next(request)
        token = model_context.set(request.headers.get("X-GenAI-Model", "gemini-2.5-flash-image"))
        try: return await call_next(request)
        finally: model_context.reset(token)

app.add_middleware(ModelSelectionMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# --- ENDPOINTS ---

@app.get("/user/settings")
async def get_settings(user_id: str = Depends(get_user_id)):
    """Check if user has a configured API Key."""
    api_key = get_decrypted_api_key(user_id)
    return {
        "has_api_key": bool(api_key),
        "masked_key": f"sk-....{api_key[-4:]}" if api_key else None
    }

@app.post("/user/settings")
async def save_settings(payload: dict = Body(...), user_id: str = Depends(get_user_id)):
    """Encrypts and saves the API key provided by the user."""
    raw_key = payload.get("api_key")
    if not raw_key or not raw_key.startswith("AIza"):
        raise HTTPException(status_code=400, detail="Invalid API Key format. Must start with AIza.")
    
    try:
        encrypted = security_service.encrypt_data(raw_key)
        if db:
            db.collection("users").document(user_id).set({
                "gemini_api_key": encrypted,
                "updated_at": firestore.SERVER_TIMESTAMP
            }, merge=True)
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Save Settings Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to save settings")

@app.get("/user/projects")
async def list_projects(user_id: str = Depends(get_user_id)):
    """Lists all infographic projects for a user."""
    if not db: return []
    try:
        docs = db.collection("users").document(user_id).collection("projects").order_by("created_at", direction=firestore.Query.DESCENDING).limit(50).stream()
        projects = []
        for d in docs:
            p = d.to_dict()
            p["id"] = d.id
            projects.append(p)
        return projects
    except Exception as e:
        logger.error(f"List Projects Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list projects")

@app.get("/user/projects/{project_id}")
async def get_project(project_id: str, user_id: str = Depends(get_user_id)):
    """Retrieves a specific project."""
    if not db: raise HTTPException(status_code=500, detail="Database unavailable")
    try:
        doc = db.collection("users").document(user_id).collection("projects").document(project_id).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Project not found")
        return doc.to_dict()
    except Exception as e:
        logger.error(f"Get Project Error: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve project")

@app.post("/agent/export_slides")
async def export_slides_endpoint(request: Request, user_id: str = Depends(get_user_id)):
    data = await request.json()
    google_token = data.get("google_token")
    if not google_token:
        raise HTTPException(status_code=401, detail="Missing Google OAuth Token")
    
    try:
        slides_data = data.get("slides", [])
        title = data.get("title", "Infographic Presentation")
        
        tool = GoogleSlidesTool(access_token=google_token)
        url = await asyncio.to_thread(tool.create_presentation, title, slides_data)
        
        return {"url": url}
    except Exception as e:
        logger.error(f"Slides Export Failed: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/export")
async def export_assets(request: Request, user_id: str = Depends(get_user_id)):
    try:
        data = await request.json()
        images = data.get("images", [])
        fmt = data.get("format", "zip")
        project_id = data.get("project_id")
        
        tool = ExportTool()
        relative_url = await asyncio.to_thread(tool.create_pdf, images) if fmt == "pdf" else await asyncio.to_thread(tool.create_zip, images)
        
        if not relative_url: 
            return JSONResponse(status_code=500, content={"error": "Export failed"})
            
        local_path = Path(".") / relative_url.lstrip("/")
        gcs_url = None
        
        try:
            filename = local_path.name
            remote_path = f"users/{user_id}/exports/{filename}"
            if project_id:
                remote_path = storage_tool.get_project_asset_path(user_id, project_id, filename)
                
            gcs_url = await asyncio.to_thread(storage_tool.upload_file, str(local_path), remote_path)
        except Exception as upload_err:
            logger.warning(f"GCS Upload Failed (falling back to local): {upload_err}")

        if db and project_id:
            try:
                db.collection("users").document(user_id).collection("projects").document(project_id).update({
                    f"export_{fmt}_url": gcs_url,
                    "updated_at": firestore.SERVER_TIMESTAMP
                })
            except Exception as db_err:
                logger.warning(f"Firestore Update Failed: {db_err}")
                
        if gcs_url and local_path.exists():
            try:
                os.remove(local_path)
            except Exception: pass

        return {"url": gcs_url or relative_url}

    except Exception as e:
        logger.error(f"Export Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/regenerate_slide")
async def regenerate_slide(request: Request, user_id: str = Depends(get_user_id), api_key: str = Depends(get_api_key)):
    try:
        data = await request.json()
        slide_id = data.get("slide_id")
        prompt = data.get("image_prompt")
        aspect_ratio = data.get("aspect_ratio", "16:9")
        surface_id = "infographic_workspace"

        async def event_generator():
            yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [
                {"id": f"card_{slide_id}", "component": "Text", "text": "🎨 Nano Banana is refining...", "status": "generating"}
            ]}}) + "\n"
            img_tool = ImageGenerationTool(api_key=api_key)
            img_url = await asyncio.to_thread(img_tool.generate_and_save, prompt, aspect_ratio=aspect_ratio, user_id=user_id)
            
            if "Error" not in img_url:
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [
                    {"id": f"card_{slide_id}", "component": "Column", "children": [f"title_{slide_id}", f"img_{slide_id}"], "status": "success"},
                    {"id": f"img_{slide_id}", "component": "Image", "src": img_url}
                ]}}) + "\n"
            else:
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [
                    {"id": f"card_{slide_id}", "component": "Text", "text": f"⚠️ {img_url}", "status": "error"}
                ]}}) + "\n"
        return StreamingResponse(event_generator(), media_type="application/x-ndjson")
    except Exception as e:
        logger.error(f"Regenerate Slide Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/upload")
async def upload_document(request: Request, file: UploadFile = File(...), user_id: str = Depends(get_user_id), api_key: str = Depends(get_api_key)):
    try:
        client = genai.Client(api_key=api_key)
        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename).suffix) as tmp:
                tmp.write(await file.read())
                tmp_path = tmp.name
            
            remote_path = storage_tool.get_user_upload_path(user_id, os.path.basename(file.filename))
            gcs_url = await asyncio.to_thread(storage_tool.upload_file, tmp_path, remote_path, content_type=file.content_type)
            
            gemini_file = client.files.upload(path=tmp_path)
            
            if db:
                db.collection("users").document(user_id).collection("uploads").add({
                    "filename": file.filename,
                    "gcs_url": gcs_url,
                    "gemini_file_id": gemini_file.name,
                    "uploaded_at": firestore.SERVER_TIMESTAMP
                })

            logger.info(f"User {user_id} uploaded file {gemini_file.name} to GCS and Gemini")
            return {"file_id": gemini_file.name, "uri": gemini_file.uri, "gcs_url": gcs_url}
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.remove(tmp_path)
            
    except Exception as e:
        logger.error(f"Upload Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/stream")
async def agent_stream(request: Request, user_id: str = Depends(get_user_id), api_key: str = Depends(get_api_key)):
    try:
        data = await request.json()
        phase = data.get("phase", "script")
        project_id = data.get("project_id") or uuid.uuid4().hex
        
        async def event_generator():
            surface_id = "infographic_workspace"
            yield json.dumps({"createSurface": {"surfaceId": surface_id, "catalogId": "https://a2ui.dev/specification/0.9/standard_catalog_definition.json"}}) + "\n"

            if phase == "script":
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Column", "children": ["l"]}, {"id": "l", "component": "Text", "text": "🧠 Agent is analyzing source material..."}]}}) + "\n"
                
                agent = create_infographic_agent(api_key=api_key)
                if await request.is_disconnected(): return

                runner = Runner(agent=agent, app_name="infographic-pro", session_service=session_service)
                session_id = data.get("session_id", "default_project")
                namespaced_session_id = f"{user_id}_{session_id}"
                
                try:
                    session = await session_service.create_session(app_name="infographic-pro", user_id=user_id, session_id=namespaced_session_id)
                except Exception as sess_err:
                    logger.warning(f"Session error, using existing: {sess_err}")
                    session = await session_service.get_session(app_name="infographic-pro", user_id=user_id, session_id=namespaced_session_id)

                prompt_parts = [types.Part(text=data.get("query", ""))]
                
                file_ids = data.get("file_ids", [])
                legacy_file_id = data.get("file_id")
                if legacy_file_id and legacy_file_id not in file_ids:
                    file_ids.append(legacy_file_id)

                if file_ids:
                    client = genai.Client(api_key=api_key)
                    for fid in file_ids:
                        try:
                            g_file = client.files.get(name=fid)
                            prompt_parts.append(types.Part.from_uri(file_uri=g_file.uri, mime_type=g_file.mime_type))
                            logger.info(f"Attached file {fid}")
                        except Exception as fe:
                            logger.error(f"Failed to attach file {fid}: {fe}")
                            yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "l", "component": "Text", "text": f"⚠️ Failed to read file {fid}. Proceeding..."}]}}) + "\n"

                content = types.Content(role="user", parts=prompt_parts)
                agent_output = ""
                
                async for event in runner.run_async(session_id=session.id, user_id=user_id, new_message=content):
                    if await request.is_disconnected(): break 
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text: agent_output += part.text
                
                if await request.is_disconnected(): return

                try:
                    match = re.search(r'(\{.*\})', agent_output.replace("\n", ""), re.DOTALL)
                    if match:
                        script_data = json.loads(match.group(1))
                        
                        if db:
                            db.collection("users").document(user_id).collection("projects").document(project_id).set({
                                "query": data.get("query", ""),
                                "file_ids": file_ids,
                                "script": script_data,
                                "status": "script_ready",
                                "created_at": firestore.SERVER_TIMESTAMP,
                                "updated_at": firestore.SERVER_TIMESTAMP
                            }, merge=True)

                        yield json.dumps({"updateDataModel": {"surfaceId": surface_id, "path": "/", "op": "replace", "value": {"script": script_data, "project_id": project_id}}}) + "\n"
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Column", "children": ["review_header"]}, {"id": "review_header", "component": "Text", "text": "✅ Plan Ready."}]}}) + "\n"
                    else:
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Text", "text": "Agent failed to produce valid JSON."}]}}) + "\n"
                except Exception as parse_err:
                    logger.error(f"Parse Error: {parse_err}. Output was: {agent_output[:200]}...")
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Text", "text": "Error parsing agent output."}]}}) + "\n"

            elif phase == "graphics":
                script = data.get("script", {})
                slides = script.get("slides", [])
                ar = script.get("global_settings", {}).get("aspect_ratio", "16:9")
                children_ids = [f"card_{s['id']}" for s in slides]
                card_comps = [{"id": f"card_{s['id']}", "component": "Text", "text": "Waiting...", "status": "waiting"} for s in slides]
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Column", "children": ["status", "grid"]}, {"id": "status", "component": "Text", "text": "🎨 Starting production..."}, {"id": "grid", "component": "Column", "children": children_ids}] + card_comps}}) + "\n"
                
                img_tool = ImageGenerationTool(api_key=api_key)
                for idx, slide in enumerate(slides):
                    if await request.is_disconnected(): break
                    sid = slide['id']
                    msg = json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Text", "text": "🖌️ Nano Banana is drawing...", "status": "generating"}]}})
                    yield msg + "\n" + " " * 2048 + "\n"
                    await asyncio.sleep(0.05)
                    img_url = await asyncio.to_thread(img_tool.generate_and_save, slide['image_prompt'], aspect_ratio=ar, user_id=user_id)
                    
                    if "Error" not in img_url:
                        slide["image_url"] = img_url
                        msg = json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Column", "children": [f"title_{sid}", f"img_{sid}"], "status": "success"}, {"id": f"title_{sid}", "component": "Text", "text": f"{idx+1}. {slide['title']}"}, {"id": f"img_{sid}", "component": "Image", "src": img_url}]}})
                    else:
                        msg = json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Text", "text": f"⚠️ {img_url}", "status": "error"}]}})
                    yield msg + "\n" + " " * 2048 + "\n"
                    await asyncio.sleep(0.05)
                
                if db and not await request.is_disconnected():
                    db.collection("users").document(user_id).collection("projects").document(project_id).update({
                        "script": script,
                        "status": "completed",
                        "updated_at": firestore.SERVER_TIMESTAMP
                    })

                if not await request.is_disconnected():
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "status", "component": "Text", "text": "✨ Done!"}]}}) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")
    except Exception as e:
        logger.error(f"Stream Fatal: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
