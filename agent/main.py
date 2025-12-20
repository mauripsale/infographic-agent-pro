import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from google.adk import Agent
from google.adk.runners import InMemoryRunner

# Load environment variables from .env or .env.local in current or parent directory
env_path = Path(__file__).resolve().parent / '.env'
if not env_path.exists():
    env_path = Path(__file__).resolve().parent.parent / '.env.local'

load_dotenv(dotenv_path=env_path)

app = FastAPI()

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Definizione del modello di input
class InfographicRequest(BaseModel):
    source_content: str
    slide_count: int = 5
    detail_level: str = "balanced"

# Inizializzazione dell'agente (modello Gemini Flash per velocità o Pro per qualità)
# Nota: Assicurati che GEMINI_API_KEY sia settata nel .env o nell'ambiente
agent = Agent(
    name="InfographicDesigner",
    model="gemini-2.0-flash", # Uso 2.0 Flash come standard attuale potente/veloce
    instruction="""Sei un esperto Infographic Script Designer. 
    Il tuo compito è trasformare il contenuto fornito in uno script strutturato per infografiche.
    Usa esattamente questo formato per ogni slide:
    #### Infographic X/Y: [Titolo]
    - Layout: [Descrizione visiva per AI]
    - Body: [Testo principale]
    - Details: [Colori, icone, stile]"""
)

@app.post("/generate-script")
async def generate_script(request: InfographicRequest):
    prompt = f"Genera uno script di {request.slide_count} slide con livello di dettaglio {request.detail_level} basato su: {request.source_content}"
    
    try:
        # Uso InMemoryRunner per un'esecuzione rapida e isolata
        runner = InMemoryRunner(agent=agent)
        
        # run_debug restituisce una lista di eventi, non stringhe
        events = await runner.run_debug(prompt)
        
        text_parts = []
        for event in events:
            # L'evento potrebbe essere di tipo ModelResponseEvent o simile
            # Cerchiamo content.parts.text
            if hasattr(event, 'content') and event.content:
                if hasattr(event.content, 'parts'):
                    for part in event.content.parts:
                        if hasattr(part, 'text') and part.text:
                            text_parts.append(part.text)
            # Fallback: prova a convertire l'evento in stringa se sembra utile
            # else:
            #     text_parts.append(str(event))
        
        full_text = "\n".join(text_parts)
        
        return {"script": full_text}
    except Exception as e:
        # Log dell'errore per debug
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# just for adk web ui dev server:
if __name__ == "__agent__":
    root_agent = agent