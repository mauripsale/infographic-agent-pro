import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pydantic import BaseModel
from google.adk import Agent
from google.adk.runners import InMemoryRunner

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env or .env.local in current or parent directory
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / '.env.local'

load_dotenv(dotenv_path=env_path)

app = FastAPI()

# Configure CORS
frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url], # Specific frontend URL for security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Definizione del modello di input
class InfographicRequest(BaseModel):
    source_content: str
    slide_count: int = 5
    detail_level: str = "balanced"
    model: str = "gemini-2.0-flash" # Default model

# Lock per gestire la concorrenza sulla variabile d'ambiente globale (soluzione temporanea)
env_lock = asyncio.Lock()

@app.post("/api/generate-script")
async def generate_script(
    request: InfographicRequest, 
    x_api_key: Optional[str] = Header(None)
):
    # Usa la chiave dall'header, fallback su env var se presente
    api_key = x_api_key or os.getenv("GEMINI_API_KEY")
    
    if not api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is required. Please provide it in the X-API-Key header.")

    prompt = f"Genera uno script di {request.slide_count} slide con livello di dettaglio {request.detail_level} basato su: {request.source_content}"
    
    # Usiamo un lock per evitare che richieste concorrenti sovrascrivano la chiave globale
    async with env_lock:
        # Debug log: check key reception (masked)
        if api_key:
            masked_key = f"{api_key[:4]}...{api_key[-4:]}" if len(api_key) > 8 else "***"
            logger.info(f"Received API Key: {masked_key}")
        else:
            logger.error("No API Key received!")

        original_google_key = os.getenv("GOOGLE_API_KEY")
        original_gemini_key = os.getenv("GEMINI_API_KEY")
        
        # Set both potential env vars used by ADK/GenAI
        os.environ["GOOGLE_API_KEY"] = api_key
        os.environ["GEMINI_API_KEY"] = api_key
        
        try:
            # Istanziamo l'agente con il modello richiesto
            # Nota: Re-inizializzare l'agente qui è cruciale perché legga le nuove env vars
            agent = Agent(
                name="InfographicDesigner",
                model=request.model,
                instruction="""Sei un esperto Infographic Script Designer. 
                Il tuo compito è trasformare il contenuto fornito in uno script strutturato per infografiche.
                Usa esattamente questo formato per ogni slide:
                #### Infographic X/Y: [Titolo]
                - Layout: [Descrizione visiva per AI]
                - Body: [Testo principale]
                - Details: [Colori, icone, stile]"""
            )
            
            runner = InMemoryRunner(agent=agent)
            events = await runner.run_debug(prompt)
            
            text_parts = []
            for event in events:
                if hasattr(event, 'content') and event.content:
                    if hasattr(event.content, 'parts'):
                        for part in event.content.parts:
                            if hasattr(part, 'text') and part.text:
                                text_parts.append(part.text)
            
            full_text = "\n".join(text_parts)
            return {"script": full_text}
            
        except Exception as e:
            logger.exception("Error generating infographic script")
            raise HTTPException(
                status_code=500, 
                detail="An internal error occurred while generating the infographic script. Please try again later."
            )
        finally:
            # Ripristina o pulisci GOOGLE_API_KEY
            if original_google_key:
                os.environ["GOOGLE_API_KEY"] = original_google_key
            else:
                os.environ.pop("GOOGLE_API_KEY", None)

            # Ripristina o pulisci GEMINI_API_KEY
            if original_gemini_key:
                os.environ["GEMINI_API_KEY"] = original_gemini_key
            else:
                os.environ.pop("GEMINI_API_KEY", None)

if __name__ == "__main__":
    import uvicorn
    # In Cloud Run, la porta è solitamente passata via variabile d'ambiente PORT
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

# just for adk web ui dev server:
if __name__ == "__agent__":
    root_agent = Agent(
        name="InfographicDesigner",
        model="gemini-2.0-flash",
        instruction="Placeholder agent"
    )
