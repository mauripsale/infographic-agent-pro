import os
import logging
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Imports from google.adk namespace
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

from context import model_context
from agents.infographic_agent.agent import presentation_pipeline

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI()

# --- MIDDLEWARE: Model Selection & Error Handling ---
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
            logger.error(f"Unhandled error: {e}", exc_info=True)
            return JSONResponse(
                status_code=500,
                content={"detail": "Internal Server Error", "error": str(e)}
            )
        finally:
            model_context.reset(token)

app.add_middleware(ModelSelectionMiddleware)

# --- MIDDLEWARE: CORS ---
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

# --- ADK SERVICES ---
session_service = InMemorySessionService()

# --- API ENDPOINTS ---

@app.get("/health")
async def health_check():
    """Simple health check endpoint."""
    return {"status": "ok"}

@app.post("/api") # Endpoint matching frontend configuration
async def chat_endpoint(request: Request):
    """
    Manual implementation of a chat endpoint using ADK Runner.
    This adapts the incoming JSON to what Runner expects and returns the event stream.
    """
    try:
        data = await request.json()
        messages = data.get("messages", [])
        
        if not messages:
            return {"messages": []}

        last_message_text = messages[-1].get("content", "")
        
        # Create a runner for this request
        runner = Runner(
            agent=presentation_pipeline,
            app_name="infographic-agent",
            session_service=session_service
        )

        # Create user session (in-memory, so distinct per request/user id if provided)
        # Ideally, we should get user_id/session_id from request headers or body
        user_id = "default_user" 
        session = await session_service.create_session(
            app_name="infographic-agent",
            user_id=user_id
        )

        # Prepare content for Gemini
        content = types.Content(
            role="user",
            parts=[types.Part(text=last_message_text)]
        )

        # Run the agent
        # We need to collect responses. ADK Runner is async generator.
        agent_responses = []
        async for event in runner.run_async(
            session_id=session.id,
            user_id=user_id,
            new_message=content
        ):
            # Collect text parts from the agent's response events
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        agent_responses.append(part.text)
        
        # Construct response for CopilotKit
        # (Simplified: just returning the final text)
        full_response = "\n".join(agent_responses)
        
        return {
            "messages": [
                {"role": "assistant", "content": full_response}
            ]
        }

    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

# Mount a fallback /api for general requests if needed
# app.mount("/api", ...) 

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)