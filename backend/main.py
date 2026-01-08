import os
import logging
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

# Imports rigorosamente basati sulla documentazione ADK Python
from google.adk import Agent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

# Import del contesto e dell'agente definito nell'altro file
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
        # Imposta il contesto per la richiesta corrente
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

# --- MIDDLEWARE 2: CORS (Cruciale per CopilotKit) ---
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

# --- ADK SERVICE INITIALIZATION ---
# Usiamo InMemorySessionService come da esempi della documentazione per demo/test
session_service = InMemorySessionService()

# --- API ENDPOINTS ---

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.get("/api/info")
async def get_agent_info():
    """
    Endpoint richiesto da CopilotKit per scoprire gli agenti disponibili.
    Restituisce un agente chiamato 'default'.
    """
    return {
        "agents": [
            {
                "name": "default",
                "description": "Infographic Generator Agent",
                "model": "gemini-2.5-flash",
                # Eventuali altre info richieste dal protocollo CopilotKit/ADK wrapper
            }
        ]
    }

@app.post("/api")
async def chat_endpoint(request: Request):
    """
    Endpoint principale per la chat.
    Accetta il payload JSON, istanzia un Runner ADK e restituisce la risposta.
    """
    try:
        data = await request.json()
        messages = data.get("messages", [])
        
        if not messages:
            return {"messages": []}

        # Estrae l'ultimo messaggio utente
        last_message_text = messages[-1].get("content", "")
        
        # Inizializza il Runner per questa richiesta
        # Nota: L'agente 'presentation_pipeline' è importato e riutilizzato (è stateless o gestito dal runner)
        runner = Runner(
            agent=presentation_pipeline,
            app_name="infographic-agent",
            session_service=session_service
        )

        # Crea una sessione (o ne recupera una se passassimo un session_id)
        user_id = "default_user"
        session = await session_service.create_session(
            app_name="infographic-agent",
            user_id=user_id
        )

        # Prepara il contenuto per Gemini (google.genai.types)
        content = types.Content(
            role="user",
            parts=[types.Part(text=last_message_text)]
        )

        # Esegue l'agente e raccoglie la risposta
        # ADK Runner.run_async restituisce un generatore asincrono di eventi
        agent_responses = []
        async for event in runner.run_async(
            session_id=session.id,
            user_id=user_id,
            new_message=content
        ):
            # Analizza gli eventi per estrarre il testo della risposta
            if event.content and event.content.parts:
                for part in event.content.parts:
                    if part.text:
                        agent_responses.append(part.text)
        
        full_response = "\n".join(agent_responses)
        
        # Restituisce la risposta nel formato atteso da CopilotKit (array di messaggi)
        return {
            "messages": [
                {"role": "assistant", "content": full_response}
            ]
        }

    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)
