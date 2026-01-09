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

# Imports ADK
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

from agents.infographic_agent.agent import create_infographic_pipeline

# Configurazione Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# --- MIDDLEWARE: Model Selection ---
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
            logger.error(f"Unhandled error: {e}", exc_info=True)
            return JSONResponse(status_code=500, content={"error": str(e)})
        finally:
            model_context.reset(token)

app.add_middleware(ModelSelectionMiddleware)

# --- MIDDLEWARE: CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In Lab mode, allowing all is safer
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- STATIC FILES ---
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# --- ADK SERVICE ---
session_service = InMemorySessionService()

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/agent/stream")
def agent_stream(request: Request):
    try:
        api_key = request.headers.get("x-goog-api-key")
        if not api_key:
            return JSONResponse(status_code=401, content={"error": "Missing API Key"})

        data = await request.json()
        query = data.get("query", "")
        session_id = data.get("session_id", "default-session")
        
        async def event_generator():
            surface_id = "main_surface"
            # 1. Start Surface
            yield json.dumps({
                "createSurface": {
                    "surfaceId": surface_id,
                    "catalogId": "https://a2ui.dev/specification/0.9/standard_catalog_definition.json"
                }
            }) + "\n"
            
            # 2. Loading
            yield json.dumps({
                "updateComponents": {
                    "surfaceId": surface_id,
                    "components": [
                        {"id": "root", "component": "Column", "children": ["loader"]},
                        {"id": "loader", "component": "Text", "text": "🎨 Nano Banana is sketching your infographics..."}
                    ]
                }
            }) + "\n"

            # 3. Setup Agent
            pipeline = create_infographic_pipeline(api_key=api_key)
            runner = Runner(agent=pipeline, app_name="infographic-agent", session_service=session_service)
            session = await session_service.create_session(app_name="infographic-agent", user_id="user", session_id=session_id)
            
            content = types.Content(role="user", parts=[types.Part(text=query)])
            
            agent_output = ""
            async for event in runner.run_async(session_id=session.id, user_id="user", new_message=content):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            agent_output += part.text

            # 4. Parse output for images
            # Agent returns a list of URLs like ["/static/1.png", "/static/2.png"]
            image_urls = []
            try:
                # Try to find JSON in the output
                json_match = re.search(r'(\[.*\])', agent_output.replace("\n", ""), re.DOTALL)
                if json_match:
                    image_urls = json.loads(json_match.group(1))
            except:
                # Fallback: find anything that looks like a static path
                image_urls = re.findall(r'(/static/[\w\.-]+)', agent_output)

            # 5. Final UI Update: Show the images!
            components = [{"id": "root", "component": "Column", "children": []}]
            comp_defs = []
            
            if not image_urls:
                comp_defs.append({"id": "err", "component": "Text", "text": "No images generated. Output: " + agent_output[:100]})
                components[0]["children"].append("err")
            else:
                for idx, url in enumerate(image_urls):
                    img_id = f"img_{idx}"
                    comp_defs.append({
                        "id": img_id, 
                        "component": "Image", 
                        "src": url, 
                        "alt": f"Infographic {idx+1}"
                    })
                    components[0]["children"].append(img_id)
                
                # Add a final success text
                comp_defs.append({"id": "success", "component": "Text", "text": "✨ Infographics ready!"})
                components[0]["children"].append("success")

            yield json.dumps({
                "updateComponents": {
                    "surfaceId": surface_id,
                    "components": components + comp_defs
                }
            }) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except Exception as e:
        logger.error(f"Stream error: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)