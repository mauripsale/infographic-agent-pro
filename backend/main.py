import os
import logging
import json
import asyncio
import uuid
import datetime
from datetime import timedelta
from typing import Optional
from pathlib import Path

import google.auth
from google.auth.transport import requests as google_requests
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import firebase_admin
from firebase_admin import auth as firebase_auth, firestore
from google.cloud import storage

# --- CONFIGURATION IMPORT ---
from config.settings import PROJECT_ID, GCS_BUCKET_NAME, DEFAULT_TEXT_MODEL, DEFAULT_IMAGE_MODEL

# ADK Core
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.artifacts import GcsArtifactService
from google.genai import types

try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default=DEFAULT_TEXT_MODEL)

from agents.infographic_agent.team import create_infographic_team
from tools.image_gen import ImageGenerationTool
from tools.export_tool import ExportTool
from tools.security_tool import security_service
from tools.slides_tool import GoogleSlidesTool
from services.firestore_session import FirestoreSessionService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

logger.info(f"🚀 BACKEND STARTING - Project: {PROJECT_ID} | Bucket: {GCS_BUCKET_NAME}")

# --- TRAFFIC LOGGER ---
def log_traffic(direction: str, content: dict):
    """Logs traffic to STDOUT for Cloud Logging."""
    entry = {
        "timestamp": datetime.datetime.now().isoformat(),
        "tag": "TRAFFIC_DEBUG", # Etichetta per filtrare facilmente i log
        "direction": direction, # "IN" (Request) or "OUT" (Response Chunk)
        "content": content
    }
    # Su Cloud Run, print() finisce direttamente in Cloud Logging
    print(json.dumps(entry))

# --- UTILS ---
def extract_first_json_block(text: str) -> Optional[dict]:
    text = text.strip()
    start_index = text.find('{')
    if start_index == -1: return None
    brace_count = 0
    in_string = False
    escape = False
    for i in range(start_index, len(text)):
        char = text[i]
        if char == '"' and not escape: in_string = not in_string
        if not in_string:
            if char == '{': brace_count += 1
            elif char == '}': brace_count -= 1
            if brace_count == 0:
                try: return json.loads(text[start_index:i+1])
                except json.JSONDecodeError: return None
        if char == '\\' and not escape: escape = True
        else: escape = False
    return None

def enrich_script_with_prompts(script_data: dict) -> dict:
    if not script_data or "slides" not in script_data: return script_data
    for slide in script_data["slides"]:
        if "image_prompt" not in slide or not slide["image_prompt"]:
            title = slide.get("title", "Infographic")
            desc = slide.get("description", "")
            slide["image_prompt"] = f"A professional infographic illustration about '{title}'. Context: {desc}. Style: clean vector, data visualization, minimalist, high resolution."
            logger.warning(f"🩹 SELF-HEALED: Injected missing image_prompt for slide '{title}'")
    return script_data

# --- SERVICES ---
artifact_service = GcsArtifactService(bucket_name=GCS_BUCKET_NAME)

try:
    firebase_admin.initialize_app()
except ValueError: pass
db = firestore.client() if firebase_admin._apps else None
session_service = FirestoreSessionService(db) if db else InMemorySessionService()

app = FastAPI()

# --- HELPERS ---
async def get_user_id(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "): raise HTTPException(401)
    try: return firebase_auth.verify_id_token(auth_header.split("Bearer ")[1])['uid']
    except: raise HTTPException(401)

async def get_api_key(request: Request, user_id: str = Depends(get_user_id)) -> str:
    api_key = request.headers.get("x-goog-api-key")
    if not api_key and db:
        doc = db.collection("users").document(user_id).get()
        if doc.exists:
            k = doc.to_dict().get("gemini_api_key")
            if k: api_key = security_service.decrypt_data(k)
    if not api_key: raise HTTPException(401)
    return api_key

# --- MIDDLEWARE ---
class ModelSelectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS": return await call_next(request)
        # Text model extraction
        token = model_context.set(request.headers.get("X-GenAI-Model", DEFAULT_TEXT_MODEL))
        try: return await call_next(request)
        finally: model_context.reset(token)

app.add_middleware(ModelSelectionMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=os.environ.get("ALLOWED_CORS_ORIGINS", "*").split(","), allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

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
    if not db: raise HTTPException(500)
    doc = db.collection("users").document(user_id).collection("projects").document(project_id).get()
    if not doc.exists: raise HTTPException(404)
    return doc.to_dict()

@app.post("/agent/stream")
async def agent_stream(request: Request, user_id: str = Depends(get_user_id), api_key: str = Depends(get_api_key)):
    try:
        data = await request.json()
        
        # [LOGGING] Log Incoming Request
        log_traffic("IN", {
            "phase": data.get("phase"),
            "query": data.get("query"),
            "project_id": data.get("project_id"),
            "models": {
                "text": request.headers.get("X-GenAI-Model"),
                "image": request.headers.get("X-GenAI-Image-Model")
            }
        })

        phase = data.get("phase", "script")
        project_id = data.get("project_id") or uuid.uuid4().hex
        
        # EXTRACT REQUESTED MODELS
        requested_text_model = request.headers.get("X-GenAI-Model", DEFAULT_TEXT_MODEL)
        requested_img_model = request.headers.get("X-GenAI-Image-Model", DEFAULT_IMAGE_MODEL)
        
        logger.info(f"📥 AGENT STREAM REQUEST | Phase: {phase} | Models: T={requested_text_model} I={requested_img_model}")
        
        surface_id = "infographic_workspace"
        session_id = f"{user_id}_{project_id}"

        async def event_generator():
            # Helper per inviare e loggare
            async def yield_and_log(msg_str):
                try:
                    log_traffic("OUT", json.loads(msg_str))
                except:
                    pass
                return msg_str + "\n"

            yield await yield_and_log(json.dumps({"createSurface": {"surfaceId": surface_id, "catalogId": "https://a2ui.dev/specification/0.9/standard_catalog_definition.json"}}))

            session = None
            try: session = await session_service.get_session(app_name="infographic-pro", user_id=user_id, session_id=session_id)
            except Exception: pass
            
            if not session:
                session = await session_service.create_session(
                    app_name="infographic-pro", user_id=user_id, session_id=session_id,
                    state={"current_phase": "init", "script": None}
                )

            if phase == "script":
                logger.info("🎬 Starting SCRIPT phase")
                session.state["current_phase"] = "planning"
                await session_service.update_session_state(app_name="infographic-pro", user_id=user_id, session_id=session_id, state=session.state)

                yield await yield_and_log(json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "status", "component": "Text", "text": "🧠 Planning content..."}]}}))
                
                agent = create_infographic_team(api_key=api_key, model=requested_text_model)
                runner = Runner(agent=agent, app_name="infographic-pro", session_service=session_service)
                user_query = data.get("query", "")

                agent_output = ""
                async for event in runner.run_async(session_id=session.id, user_id=user_id, new_message=types.Content(role="user", parts=[types.Part(text=user_query)])):
                    if await request.is_disconnected(): break
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text:
                                agent_output += part.text
                                yield await yield_and_log(json.dumps({"log": part.text[:100] + "..."}))

                script_data = extract_first_json_block(agent_output)
                if script_data:
                    script_data = enrich_script_with_prompts(script_data)
                    if db:
                        db.collection("users").document(user_id).collection("projects").document(project_id).set({
                            "query": data.get("query"), "script": script_data, "status": "script_ready", "created_at": firestore.SERVER_TIMESTAMP
                        }, merge=True)
                    session.state["script"] = script_data
                    session.state["current_phase"] = "script_ready"
                    await session_service.update_session_state(app_name="infographic-pro", user_id=user_id, session_id=session_id, state=session.state)
                    yield await yield_and_log(json.dumps({"updateDataModel": {"surfaceId": surface_id, "path": "/", "op": "replace", "value": {"script": script_data, "project_id": project_id}}}))
                else:
                    logger.error(f"Failed to parse JSON. Output was: {agent_output[:500]}...")
                    yield await yield_and_log(json.dumps({"log": "Error: Agent failed to produce valid plan."}))

            elif phase == "graphics":
                logger.info("🎨 ENTERING GRAPHICS PHASE BLOCK")
                script = session.state.get("script") or data.get("script", {})
                slides = script.get("slides", [])
                
                if not slides:
                    yield await yield_and_log(json.dumps({"log": "Error: No script found. Please run the planning phase first."}))
                    return

                ar = script.get("global_settings", {}).get("aspect_ratio", "16:9")
                logo_url = await get_project_logo(user_id, project_id) if db else None
                
                # ADK Native: Use artifact_service directly
                img_tool = ImageGenerationTool(api_key=api_key, artifact_service=artifact_service)
                
                batch_updates = {}
                sem = asyncio.Semaphore(2)

                async def process_single_slide(slide):
                    sid = slide.get('id')
                    if not sid: return None
                    async with sem:
                        try:
                            logger.info(f"🎨 Generating image for slide {sid}...")
                            prompt_text = slide.get('image_prompt')
                            if not prompt_text:
                                prompt_text = f"Infographic about {slide.get('title', 'Data')}, professional style, vector illustration, high resolution"

                            # Result is now a dict: {"url": str, "path": str} or {"error": str}
                            result_data = await asyncio.to_thread(
                                img_tool.generate_and_save, 
                                prompt_text, 
                                aspect_ratio=ar, 
                                user_id=user_id, 
                                project_id=project_id, 
                                logo_url=logo_url,
                                model=requested_img_model
                            )
                            
                            if "error" in result_data:
                                raise Exception(result_data["error"])

                            img_url = result_data["url"]
                            img_path = result_data.get("path")
                            
                            logger.info(f"✅ Slide {sid} done: {img_url}")
                            return {
                                "sid": sid, 
                                "url": img_url, 
                                "path": img_path,
                                "title": slide.get('title', 'Slide')
                            }
                        except Exception as e:
                            logger.error(f"❌ Failed processing slide {sid}: {e}")
                            return {"sid": sid, "url": f"Error: {str(e)}", "title": slide.get('title', 'Slide')}

                tasks = [process_single_slide(slide) for slide in slides]
                logger.info(f"Queued {len(tasks)} image generation tasks...")
                
                success_count = 0
                error_count = 0
                
                for future in asyncio.as_completed(tasks):
                    if await request.is_disconnected(): break
                    result = await future
                    if not result: continue
                    sid = result["sid"]
                    img_url = result["url"]
                    if "http" in img_url:
                        success_count += 1
                        # Save result for batch update
                        batch_updates[sid] = result
                        for s in script["slides"]:
                            if s["id"] == sid: 
                                s["image_url"] = img_url
                                if "path" in result: s["image_path"] = result["path"]
                        
                        yield await yield_and_log(json.dumps({"updateDataModel": {"value": {"script": script}}}))
                        yield await yield_and_log(json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Column", "children": [f"t_{sid}", f"i_{sid}"], "status": "success"}, {"id": f"t_{sid}", "component": "Text", "text": result["title"]}, {"id": f"i_{sid}", "component": "Image", "src": img_url}]}}))
                    else:
                        error_count += 1
                        yield await yield_and_log(json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Text", "text": f"⚠️ {img_url}", "status": "error"}]}}))

                if db and project_id and batch_updates:
                    for s in script.get("slides", []):
                        if s['id'] in batch_updates: 
                            s['image_url'] = batch_updates[s['id']]['url']
                            if 'path' in batch_updates[s['id']]:
                                s['image_path'] = batch_updates[s['id']]['path']
                    
                    db.collection("users").document(user_id).collection("projects").document(project_id).update({"script": script, "status": "completed"})
                    session.state["script"] = script
                    session.state["current_phase"] = "completed"
                    await session_service.update_session_state(app_name="infographic-pro", user_id=user_id, session_id=session_id, state=session.state)
                
                final_msg = "✨ All images ready!"
                if error_count > 0:
                    if success_count == 0:
                        final_msg = "❌ Generation failed. Please try again."
                    else:
                        final_msg = f"⚠️ Finished with {error_count} errors."
                
                yield await yield_and_log(json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "status", "component": "Text", "text": final_msg}]}}))

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")
    except Exception as e:
        logger.error(f"Stream Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/export_slides")
async def export_slides_endpoint(request: Request, user_id: str = Depends(get_user_id)):
    try:
        data = await request.json()
        script = data.get("script")
        project_id = data.get("project_id")
        if not script: raise HTTPException(400, "Missing script")
        slides_tool = GoogleSlidesTool(access_token=None)
        presentation_id = slides_tool.create_presentation(script.get("slides", []), f"Project {project_id}")
        return {"url": f"https://docs.google.com/presentation/d/{presentation_id}"}
    except Exception as e:
        logger.error(f"Slides Export Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/export")
async def export_assets(request: Request, user_id: str = Depends(get_user_id)):
    try:
        data = await request.json()
        script = data.get("script")
        project_id = data.get("project_id")
        if not script: raise HTTPException(400, "Missing script")
        export_tool = ExportTool(artifact_service=artifact_service)
        pdf_url, zip_url = await asyncio.gather(
            asyncio.to_thread(export_tool.generate_pdf, script, project_id),
            asyncio.to_thread(export_tool.create_zip, script, project_id)
        )
        return {"pdf": pdf_url, "zip": zip_url}
    except Exception as e:
        logger.error(f"Export Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/refine_text")
async def refine_text(request: Request): return {}

@app.post("/agent/regenerate_slide")
async def regenerate_slide(request: Request): return {}

@app.post("/agent/upload")
async def upload_document(request: Request): return {}

@app.post("/agent/refresh_assets")
async def refresh_assets(request: Request, user_id: str = Depends(get_user_id)):
    """Refreshes Signed URLs for expired assets."""
    try:
        data = await request.json()
        project_id = data.get("project_id")
        script = data.get("script")
        
        if not script or "slides" not in script:
            return JSONResponse(status_code=400, content={"error": "Invalid script data"})

        # Prepare credentials once for the batch
        credentials, _ = google.auth.default()
        if not credentials.valid:
            request_adapter = google_requests.Request()
            credentials.refresh(request_adapter)
        
        service_account_email = getattr(credentials, "service_account_email", None)

        refreshed_count = 0
        for slide in script["slides"]:
            # If we have the storage path, we can regenerate the signed URL
            if "image_path" in slide and slide["image_path"]:
                try:
                    blob = artifact_service.bucket.blob(slide["image_path"])
                    
                    if service_account_email:
                        new_url = blob.generate_signed_url(
                            version="v4",
                            expiration=timedelta(days=7),
                            method="GET",
                            service_account_email=service_account_email,
                            access_token=credentials.token
                        )
                    else:
                        # Fallback for local dev
                        new_url = blob.generate_signed_url(
                            version="v4",
                            expiration=timedelta(days=7),
                            method="GET",
                        )
                        
                    slide["image_url"] = new_url
                    refreshed_count += 1
                except Exception as e:
                    logger.warning(f"Failed to refresh URL for {slide['image_path']}: {e}")
        
        logger.info(f"♻️ Refreshed {refreshed_count} assets for project {project_id}")
        
        # Update DB if project_id exists
        if db and project_id:
             db.collection("users").document(user_id).collection("projects").document(project_id).update({"script": script})

        return {"script": script}
    except Exception as e:
        logger.error(f"Asset Refresh Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

async def get_project_logo(user_id, project_id): return None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
