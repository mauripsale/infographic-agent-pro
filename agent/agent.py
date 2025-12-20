from google.adk.agents.llm_agent import Agent

import os
import asyncio
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
#from google.adk import Agent
from google.adk.agents.llm_agent import Agent
from google.adk.runners import InMemoryRunner

load_dotenv()

app = FastAPI()

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
        
        # run_debug restituisce una lista di stringhe (messaggi dell'agente)
        # Nota: run_debug è comodo per test, in prod si userebbe Runner con SessionService
        responses = await runner.run_debug(prompt)
        
        # Unisco le risposte in un unico testo
        full_text = "\n".join(responses)
        
        return {"script": full_text}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__123":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

# just for adk web ui dev server:
root_agent = agent
