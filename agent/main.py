import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from pydantic import BaseModel
from google.adk import Agent
from google.adk.runners import InMemoryRunner

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

@app.post("/generate-script")
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
    # Nota: In produzione, l'ADK dovrebbe supportare un client per-request per evitare questo collo di bottiglia.
    async with env_lock:
        original_key = os.getenv("GEMINI_API_KEY")
        os.environ["GEMINI_API_KEY"] = api_key
        os.environ["GOOGLE_API_KEY"] = api_key # ADK potrebbe usare questa
        
        try:
            # Istanziamo l'agente con il modello richiesto
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
            import traceback
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(e))
        finally:
            # Ripristina la chiave originale (o rimuovi se non c'era)
            if original_key:
                os.environ["GEMINI_API_KEY"] = original_key
                os.environ["GOOGLE_API_KEY"] = original_key
            else:
                os.unsetenv("GEMINI_API_KEY") if "GEMINI_API_KEY" in os.environ else None
                os.unsetenv("GOOGLE_API_KEY") if "GOOGLE_API_KEY" in os.environ else None

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# just for adk web ui dev server:
if __name__ == "__agent__":
    root_agent = Agent(
        name="InfographicDesigner",
        model="gemini-2.0-flash",
        instruction="Placeholder agent"
    )
