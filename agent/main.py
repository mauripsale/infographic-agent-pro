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
from google import genai

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

# Definizione dei modelli di input
class ScriptRequest(BaseModel):
    source_content: str
    slide_count: int = 5
    detail_level: str = "balanced"
    model: str = "gemini-2.0-flash"

class ImageRequest(BaseModel):
    prompt: str
    model: str = "gemini-2.0-flash"
    aspect_ratio: str = "16:9"

# Lock per gestire la concorrenza sulla variabile d'ambiente globale (soluzione temporanea)
env_lock = asyncio.Lock()

@app.post("/api/generate-script")
async def generate_script(
    request: ScriptRequest, 
    x_api_key: Optional[str] = Header(None)
):
    api_key = x_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is required.")

    logger.info(f"Generating script for input of {len(request.source_content)} chars")

    async with env_lock:
        os.environ["GOOGLE_API_KEY"] = api_key
        os.environ["GEMINI_API_KEY"] = api_key
        
        try:
            agent = Agent(
                name="InfographicDesigner",
                model=request.model,
                instruction="""Sei un esperto Infographic Script Designer. 
                Trasforma il contenuto in uno script strutturato per infografiche.
                Formato obbligatorio per ogni slide:
                #### Infographic X/Y: [Titolo]
                - Layout: [Descrizione visiva]
                - Body: [Testo principale]
                - Details: [Stile, colori]"""
            )
            
            runner = InMemoryRunner(agent=agent)
            prompt = f"Genera uno script di {request.slide_count} slide con livello di dettaglio {request.detail_level} basato su: {request.source_content}"
            events = await runner.run_debug(prompt)
            
            text_parts = []
            for event in events:
                if hasattr(event, 'content') and event.content:
                    if hasattr(event.content, 'parts'):
                        for part in event.content.parts:
                            if hasattr(part, 'text') and part.text:
                                text_parts.append(part.text)
            
            return {"script": "\n".join(text_parts)}
        except Exception as e:
            logger.exception("Script generation failed")
            raise HTTPException(status_code=500, detail="Internal script generation error.")
        finally:
            os.environ.pop("GOOGLE_API_KEY", None)
            os.environ.pop("GEMINI_API_KEY", None)

@app.post("/api/generate-image")
async def generate_image(
    request: ImageRequest, 
    x_api_key: Optional[str] = Header(None)
):
    api_key = x_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is required.")

    logger.info(f"Generating image for prompt: {request.prompt[:50]}...")

    async with env_lock:
        os.environ["GOOGLE_API_KEY"] = api_key
        
        try:
            client = genai.Client(api_key=api_key)
            
            # Using Gemini's multimodal generation capability
            response = client.models.generate_content(
                model=request.model,
                contents=f"Create a high-quality professional infographic image based on this segment: {request.prompt}. Style: professional, clean, aesthetic. Ratio: {request.aspect_ratio}"
            )

            # Extraction logic for inline data (image)
            for candidate in response.candidates:
                for part in candidate.content.parts:
                    if part.inline_data:
                        return {
                            "image_data": part.inline_data.data,
                            "mime_type": part.inline_data.mime_type or "image/png"
                        }
            
            raise Exception("No image data returned from model.")

        except Exception as e:
            logger.exception("Image generation failed")
            raise HTTPException(status_code=500, detail="Internal image generation error.")
        finally:
            os.environ.pop("GOOGLE_API_KEY", None)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

if __name__ == "__agent__":
    root_agent = Agent(name="Designer", model="gemini-2.0-flash", instruction="Infographic creator")
