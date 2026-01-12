import os
import logging
import json
import asyncio
import re
import tempfile
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

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Firebase Admin & Firestore
try:
    firebase_admin.initialize_app()
except ValueError:
    pass

try:
    db = firestore.client()
except Exception as e:
    logger.warning(f"Firestore init failed: {e}")
    db = None

app = FastAPI()

# --- AUTH HELPERS ---
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
session_service = InMemorySessionService()

# --- SETTINGS ENDPOINTS ---
@app.get("/user/settings")
async def get_settings(user_id: str = Depends(get_user_id)):
    api_key = get_decrypted_api_key(user_id)
    return {
        "has_api_key": bool(api_key),
        "masked_key": f"sk-....{api_key[-4:]}" if api_key else None
    }

@app.post("/user/settings")
async def save_settings(payload: dict = Body(...), user_id: str = Depends(get_user_id)):
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


@app.post("/agent/export")
async def export_assets(request: Request, api_key: str = Depends(get_api_key)):
    try:
        data = await request.json()
        images = data.get("images", [])
        fmt = data.get("format", "zip")
        tool = ExportTool()
        url = await asyncio.to_thread(tool.create_pdf, images) if fmt == "pdf" else await asyncio.to_thread(tool.create_zip, images)
        if not url: return JSONResponse(status_code=500, content={"error": "Export failed"})
        base_url = os.environ.get("BACKEND_URL", "https://infographic-agent-backend-218788847170.us-central1.run.app")
        return {"url": f"{base_url}{url}"}
    except Exception as e:
        logger.error(f"Export Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/regenerate_slide")
async def regenerate_slide(request: Request, api_key: str = Depends(get_api_key)):
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
            img_url = await asyncio.to_thread(img_tool.generate_and_save, prompt, aspect_ratio=aspect_ratio)
            
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
            
            gemini_file = client.files.upload(path=tmp_path)
            logger.info(f"User {user_id} uploaded file {gemini_file.name}")
            return {"file_id": gemini_file.name, "uri": gemini_file.uri}
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
                
                file_id = data.get("file_id")
                if file_id:
                    try:
                        client = genai.Client(api_key=api_key)
                        g_file = client.files.get(name=file_id)
                        prompt_parts.append(types.Part.from_uri(file_uri=g_file.uri, mime_type=g_file.mime_type))
                        logger.info(f"Attached file {file_id}")
                    except Exception as fe:
                        logger.error(f"Failed to attach file {file_id}: {fe}")
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "l", "component": "Text", "text": "⚠️ Failed to read uploaded doc. Proceeding with text only..."}]}}) + "\n"

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
                        yield json.dumps({"updateDataModel": {"surfaceId": surface_id, "path": "/", "op": "replace", "value": {"script": script_data}}}) + "\n"
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
                    img_url = await asyncio.to_thread(img_tool.generate_and_save, slide['image_prompt'], aspect_ratio=ar)
                    if "Error" not in img_url:
                        msg = json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Column", "children": [f"title_{sid}", f"img_{sid}"], "status": "success"}, {"id": f"title_{sid}", "component": "Text", "text": f"{idx+1}. {slide['title']}"}, {"id": f"img_{sid}", "component": "Image", "src": img_url}]}})
                    else:
                        msg = json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"card_{sid}", "component": "Text", "text": f"⚠️ {img_url}", "status": "error"}]}})
                    yield msg + "\n" + " " * 2048 + "\n"
                    await asyncio.sleep(0.05)
                if not await request.is_disconnected():
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "status", "component": "Text", "text": "✨ Done!"}]}}) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")
    except Exception as e:
        logger.error(f"Stream Fatal: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
