import os
import logging
import json
import asyncio
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Imports rigorosamente basati sulla documentazione ADK Python
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash")

from agents.infographic_agent.agent import presentation_pipeline

# Configurazione Logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# --- MIDDLEWARE 1: Model Selection ---
class ModelSelectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)
            
        model_header = request.headers.get("X-GenAI-Model")
        token = model_context.set(model_header if model_header else "gemini-2.5-flash")
        try:
            response = await call_next(request)
            return response
        except Exception as e:
            logger.error(f"Unhandled error in request: {e}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal Server Error", "error": str(e)}
            )
        finally:
            model_context.reset(token)

app.add_middleware(ModelSelectionMiddleware)

# --- MIDDLEWARE 2: CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://qwiklabs-asl-04-f9d4ba2925b9.web.app",
        "https://qwiklabs-asl-04-f9d4ba2925b9.firebaseapp.com",
        "http://localhost:3000",
        "http://localhost:8080"
    ],
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

# --- A2UI ENDPOINTS ---

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/agent/stream")
async def agent_stream(request: Request):
    """
    A2UI Endpoint: Streams JSONL messages to the client.
    """
    try:
        # Extract API Key from headers
        api_key = request.headers.get("x-goog-api-key")
        if not api_key:
            # Fallback to env var or raise error (for now just log warning)
            logger.warning("No API Key provided in headers, relying on server environment.")
        else:
            # Set API key for this request context (Note: This is not thread-safe in multi-threaded envs
            # but standard Cloud Run instances often handle one request at a time per thread or use process workers.
            # For a more robust solution, we'd pass auth config to ADK components directly.)
            os.environ["GOOGLE_API_KEY"] = api_key

        data = await request.json()
        query = data.get("query", "")
        session_id = data.get("session_id", "default-session")
        
        logger.info(f"Received A2UI request: query='{query}', session_id='{session_id}'")

        async def event_generator():
            # 1. Initialize Surface
            surface_id = "main_surface"
            yield json.dumps({
                "createSurface": {
                    "surfaceId": surface_id,
                    "catalogId": "https://a2ui.dev/specification/0.9/standard_catalog_definition.json"
                }
            }) + "\n"
            
            # 2. Show loading state
            yield json.dumps({
                "updateComponents": {
                    "surfaceId": surface_id,
                    "components": [
                        {"id": "root", "component": "Column", "children": ["status_text"]},
                        {"id": "status_text", "component": "Text", "text": "Analyzing request..."}
                    ]
                }
            }) + "\n"

            # 3. Run the Agent (ADK Runner)
            runner = Runner(
                agent=presentation_pipeline,
                app_name="infographic-agent",
                session_service=session_service
            )
            
            # Create/Get session
            session = await session_service.create_session(
                app_name="infographic-agent",
                user_id="user_a2ui",
                session_id=session_id
            )

            content = types.Content(role="user", parts=[types.Part(text=query)])
            
            agent_response_text = ""
            async for event in runner.run_async(session_id=session.id, user_id="user_a2ui", new_message=content):
                if event.content and event.content.parts:
                    for part in event.content.parts:
                        if part.text:
                            agent_response_text += part.text
            
            # 4. Update UI with Agent Response
            # Here we dynamically build the UI based on the agent's output.
            # Assuming the agent returns the JSON for the slide script or a file path.
            
            # Simple heuristic: if it looks like a path, show a download button
            components = [
                {"id": "root", "component": "Column", "children": ["response_text"]}
            ]
            comp_defs = [
                {"id": "response_text", "component": "Text", "text": agent_response_text}
            ]

            if "/static/" in agent_response_text:
                 # Extract link (simple logic)
                 import re
                 match = re.search(r'(/static/[\w\.-]+)', agent_response_text)
                 if match:
                     link = match.group(1)
                     components[0]["children"].append("download_button")
                     comp_defs.append({
                         "id": "download_button", 
                         "component": "Button", 
                         "child": "btn_label",
                         "action": {"name": "download", "context": {"url": link}} # Client handles action
                     })
                     comp_defs.append({"id": "btn_label", "component": "Text", "text": "Download Presentation"})

            yield json.dumps({
                "updateComponents": {
                    "surfaceId": surface_id,
                    "components": components + comp_defs
                }
            }) + "\n"

        return StreamingResponse(event_generator(), media_type="application/x-ndjson")

    except Exception as e:
        logger.error(f"Error in A2UI stream: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"error": str(e)})

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
