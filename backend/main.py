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

# ADK Core
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# Project Components
try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

from agents.infographic_agent.agent import create_infographic_agent
from tools.image_gen import ImageGenerationTool
from tools.export_tool import ExportTool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# --- MIDDLEWARE ---
class ModelSelectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS": return await call_next(request)
        token = model_context.set(request.headers.get("X-GenAI-Model", "gemini-2.5-flash-image"))
        try: return await call_next(request)
        finally: model_context.reset(token)

app.add_middleware(ModelSelectionMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

# Static & Tools
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
session_service = InMemorySessionService()

@app.post("/agent/export")
async def export_assets(request: Request):
    try:
        # Authentication Check
        api_key = request.headers.get("x-goog-api-key")
        if not api_key:
            return JSONResponse(status_code=401, content={"error": "Missing API Key"})

        data = await request.json()
        images = data.get("images", [])
        fmt = data.get("format", "zip")
        
        tool = ExportTool()
        if fmt == "pdf":
            url = tool.create_pdf(images)
        else:
            url = tool.create_zip(images)
            
        if not url:
            return JSONResponse(status_code=500, content={"error": "Export failed"})
            
        # Dynamic Backend URL
        base_url = os.environ.get("BACKEND_URL", "https://infographic-agent-backend-218788847170.us-central1.run.app")
        return {"url": f"{base_url}{url}"}
    except Exception as e:
        logger.error(f"Export Error: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/agent/stream")
async def agent_stream(request: Request):
    try:
        api_key = request.headers.get("x-goog-api-key")
        if not api_key: return JSONResponse(status_code=401, content={"error": "Missing API Key"})
        
        # Inject API Key into env for tools (Tool context support coming in ADK v0.2)
        os.environ["GOOGLE_API_KEY"] = api_key 
        
        data = await request.json()
        phase = data.get("phase", "script")
        
        async def event_generator():
            surface_id = "infographic_workspace"
            
            # Init Surface
            yield json.dumps({"createSurface": {"surfaceId": surface_id, "catalogId": "https://a2ui.dev/specification/0.9/standard_catalog_definition.json"}}) + "\n"

            if phase == "script":
                # --- PHASE 1: AGENTIC DRAFTING ---
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Column", "children": ["l"]}, {"id": "l", "component": "Text", "text": "🧠 Agent is analyzing your request..."}]}}) + "\n"
                
                # We use the ADK Agent to 'Think' and 'Plan'
                agent = create_infographic_agent(api_key=api_key)
                runner = Runner(agent=agent, app_name="infographic-pro", session_service=session_service)
                session = await session_service.create_session(app_name="infographic-pro", user_id="u1", session_id=data.get("session_id", "s1"))
                
                # Construct a specialized prompt for the agent
                prompt = data.get("query", "")
                
                content = types.Content(role="user", parts=[types.Part(text=prompt)])
                agent_output = ""
                async for event in runner.run_async(session_id=session.id, user_id="u1", new_message=content):
                    if event.content and event.content.parts:
                        for part in event.content.parts:
                            if part.text: agent_output += part.text
                
                # Extract JSON Plan from Agent Output
                try:
                    match = re.search(r'(\{.*\})', agent_output.replace("\n", ""), re.DOTALL)
                    if match:
                        script_data = json.loads(match.group(1))
                        # Send to Frontend Editor
                        yield json.dumps({"updateDataModel": {"surfaceId": surface_id, "path": "/", "op": "replace", "value": {"script": script_data}}}) + "\n"
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [
                            {"id": "root", "component": "Column", "children": ["review_header"]},
                            {"id": "review_header", "component": "Text", "text": "✅ Plan Ready. Please review below."}
                        ]}}) + "\n"
                    else:
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Text", "text": "Agent failed to produce valid JSON. Raw output:\n" + agent_output[:200]}]}}) + "\n"
                except Exception as parse_err:
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Text", "text": f"Error parsing agent output: {str(parse_err)}"}]}}) + "\n"

            elif phase == "graphics":
                # --- PHASE 2: EXECUTION & ORCHESTRATION ---
                script = data.get("script", {})
                slides = script.get("slides", [])
                ar = script.get("global_settings", {}).get("aspect_ratio", "16:9")
                
                # Setup Grid - Use consistent IDs: card_{id}
                children_ids = [f"card_{s['id']}" for s in slides]
                # Initialize cards with waiting state
                card_comps = [{"id": f"card_{s['id']}", "component": "Text", "text": "Waiting in queue...", "status": "waiting"} for s in slides]
                
                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "root", "component": "Column", "children": ["status", "grid"]}, {"id": "status", "component": "Text", "text": "🎨 Starting production pipeline..."}, {"id": "grid", "component": "Column", "children": children_ids}] + card_comps}}) + "\n"

                # Tool Execution
                img_tool = ImageGenerationTool(api_key=api_key)
                
                # Serial Execution
                for idx, slide in enumerate(slides):
                    sid = slide['id']
                    # STATUS: GENERATING
                    yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [
                        {"id": f"card_{sid}", "component": "Text", "text": f"🖌️ Nano Banana is sketching {slide['title']}...", "status": "generating"}
                    ]}}) + "\n"
                    
                    # Call the Tool
                    img_url = img_tool.generate_and_save(slide['image_prompt'], aspect_ratio=ar)
                    
                    if "Error" not in img_url:
                        # STATUS: SUCCESS
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [
                            {"id": f"card_{sid}", "component": "Column", "children": [f"t_{sid}", f"img_{sid}"], "status": "success"},
                            {"id": f"t_{sid}", "component": "Text", "text": f"{idx+1}. {slide['title']}"}, 
                            {"id": f"img_{sid}", "component": "Image", "src": img_url} # Matched ID: img_{sid}
                        ]}}) + "\n"
                    else:
                        # STATUS: ERROR
                        yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [
                            {"id": f"card_{sid}", "component": "Text", "text": f"⚠️ {img_url}", "status": "error"}
                        ]}}) + "\n"

                yield json.dumps({"updateComponents": {"surfaceId": surface_id, "components": [{"id": "status", "component": "Text", "text": "✨ All infographics ready!"}]}}) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except Exception as e:
        logger.error(f"Stream Fatal: {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
