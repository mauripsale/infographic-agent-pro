import os
import logging
import json
import asyncio
import re
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# ADK Documentation Reference: @context7_doc/google-adk-python.md
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

from agents.infographic_agent.agent import get_script_agent, generate_infographic_image_tool

# Configurazione Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# --- MIDDLEWARE: Model Selection & CORS ---
class ModelSelectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
        model_header = request.headers.get("X-GenAI-Model")
        token = model_context.set(model_header if model_header else "gemini-2.5-flash-image")
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            return JSONResponse(status_code=500, content={"error": str(e)})
        finally:
            model_context.reset(token)

app.add_middleware(ModelSelectionMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Static Files
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

session_service = InMemorySessionService()

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/agent/stream")
async def agent_stream(request: Request):
    """
    A2UI Multi-Phase Stream:
    Phase 1: Prompt -> Script Generation -> UI for Review
    Phase 2: Approved Script -> Sequential Image Generation -> Real-time UI updates
    """
    try:
        api_key = request.headers.get("x-goog-api-key")
        if not api_key: return JSONResponse(status_code=401, content={"error": "Missing API Key"})
        
        data = await request.json()
        query = data.get("query", "")
        session_id = data.get("session_id", "default")
        phase = data.get("phase", "script")
        
        async def event_generator():
            surface_id = "infographic_workspace"
            yield json.dumps({"createSurface": {"surfaceId": surface_id, "catalogId": "https://a2ui.dev/specification/0.9/standard_catalog_definition.json"}}) + "\n"

            if phase == "script":
                # PHASE 1: Plan Script
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Column", "children": ["l"]}, {"id": "l", "component": "Text", "text": "✍️ Planning..."}]}}) + "\n"
                agent = get_script_agent(api_key=api_key)
                runner = Runner(agent=agent, app_name="infographic-pro", session_service=session_service)
                session = await session_service.create_session(app_name="infographic-pro", user_id="u1", session_id=session_id)
                content = types.Content(role="user", parts=[types.Part(text=query)])
                agent_output = ""
                async for event in runner.run_async(session_id=session.id, user_id="u1", new_message=content):
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text: agent_output += part.text
                try:
                    script_data = json.loads(re.search(r'(\{.*\})', agent_output.replace("\n", ""), re.DOTALL).group(1))
                    yield json.dumps({"updateDataModel": {"surfaceId": surface_id, "path": "/", "op": "replace", "value": {"script": script_data}}}) + "\n"
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Column", "children": ["status"]}, {"id": "status", "component": "Text", "text": "Script ready!"}]}}) + "\n"
                except:
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Text", "text": "Error parsing script"}]}}) + "\n"

            else:
                # PHASE 2: Generate Images
                script = data.get("script", {})
                slides = script.get("slides", [])
                children_ids = [f"c_{s['id']}" for s in slides]
                card_comps = [{"id": f"c_{s['id']}", "component": "Text", "text": f"Waiting: {s['title']}..."} for s in slides]
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Column", "children": children_ids}] + card_comps}}) + "\n"

                os.environ["GOOGLE_API_KEY"] = api_key 
                for idx, slide in enumerate(slides):
                    sid = slide['id']
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"c_{sid}", "component": "Text", "text": f"⌛ Drawing {slide['title']}..."}]}}) + "\n"
                    img = generate_infographic_image_tool(slide['image_prompt'])
                    if "/static/" in img:
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"c_{sid}", "component": "Column", "children": [f"t_{sid}", f"i_{sid}"]}, {"id": f"t_{sid}", "component": "Text", "text": f"{idx+1}. {slide['title']}"}, {"id": f"i_{sid}", "component": "Image", "src": img}]}}) + "\n"
                    else:
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": f"c_{sid}", "component": "Text", "text": "❌ Error"}]}}) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)