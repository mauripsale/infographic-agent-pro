import os
import asyncio
import logging
import base64
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Header, Depends
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

# Input models definition
class ScriptRequest(BaseModel):
    source_content: str
    slide_count: int = 5
    detail_level: str = "balanced"

class ImageRequest(BaseModel):
    prompt: str
    model: str = "gemini-2.0-flash"
    aspect_ratio: str = "16:9"

# Lock to manage concurrency on global environment variable (temporary solution)
env_lock = asyncio.Lock()

# Reusable dependency for API Key retrieval
async def get_api_key(x_api_key: Optional[str] = Header(None)) -> str:
    api_key = x_api_key or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=401, detail="Gemini API Key is required. Please provide it in the X-API-Key header.")
    return api_key

@app.post("/api/generate-script")
async def generate_script(
    request: ScriptRequest, 
    api_key: str = Depends(get_api_key)
):
    logger.info(f"Generating script for input of {len(request.source_content)} chars")

    # Use a lock for the entire duration of script generation.
    # This is necessary because google-adk may read environment variables 
    # lazily during the network call (run_debug), leading to race conditions.
    async with env_lock:
        original_google_key = os.getenv("GOOGLE_API_KEY")
        original_gemini_key = os.getenv("GEMINI_API_KEY")
        
        try:
            os.environ["GOOGLE_API_KEY"] = api_key
            os.environ["GEMINI_API_KEY"] = api_key
            
            # Instantiate agent with fixed model gemini-2.5-flash
            agent = Agent(
                name="InfographicDesigner",
                model="gemini-2.5-flash", # Fixed for script
                instruction="""You are an expert Infographic Script Designer. 
                Transform the provided content into a structured infographic script.
                Mandatory format for each slide:
                #### Infographic X/Y: [Title]
                - Layout: [Visual description]
                - Body: [Main text]
                - Details: [Style, colors]"""
            )
            
            # Execute generation INSIDE the lock for safety
            runner = InMemoryRunner(agent=agent)
            
            # Structured prompt to mitigate injection
            prompt = (
                f"Generate a script of {request.slide_count} slides with detail level {request.detail_level} "
                "based strictly on the USER CONTENT provided below.\n\n"
                f"USER CONTENT:\n{request.source_content}"
            )
            
            events = await runner.run_debug(prompt)
            
            # Use optimized list comprehension to extract text
            text_parts = [
                part.text
                for event in events
                if (content := getattr(event, "content", None))
                for part in getattr(content, "parts", [])
                if getattr(part, "text", None)
            ]
            
            return {"script": "\n".join(text_parts)}
            
        except Exception as e:
            logger.exception("Script generation failed")
            raise HTTPException(status_code=500, detail="Internal script generation error.")
        finally:
            if original_google_key:
                os.environ["GOOGLE_API_KEY"] = original_google_key
            else:
                os.environ.pop("GOOGLE_API_KEY", None)

            if original_gemini_key:
                os.environ["GEMINI_API_KEY"] = original_gemini_key
            else:
                os.environ.pop("GEMINI_API_KEY", None)

@app.post("/api/generate-image")
async def generate_image(
    request: ImageRequest, 
    api_key: str = Depends(get_api_key)
):
    # Log the specific model being used for image generation
    logger.info(f"Generating image using model: {request.model} for prompt: {request.prompt[:50]}...")

    try:
        # The genai.Client accepts the API key directly, so there's no need to 
        # manipulate environment variables or use a lock like in generate_script.
        client = genai.Client(api_key=api_key)
        
        # Structured prompt to mitigate injection
        system_instruction = (
            "Create a high-quality professional infographic image based on the user-provided segment below. "
            f"Style: professional, clean, aesthetic. Ratio: {request.aspect_ratio}"
        )
        full_prompt = f"{system_instruction}\n\nUSER SEGMENT: {request.prompt}"

        # request.model will contain 'gemini-2.5-flash-image' or 'gemini-3-pro-image-preview'
        response = client.models.generate_content(
            model=request.model,
            contents=full_prompt
        )

        # Extract image from candidates
        for candidate in response.candidates:
            for part in candidate.content.parts:
                if part.inline_data:
                    # Convert bytes to base64 string for JSON serialization
                    image_b64 = base64.b64encode(part.inline_data.data).decode('utf-8')
                    return {
                        "image_data": image_b64,
                        "mime_type": part.inline_data.mime_type or "image/png"
                    }
        
        raise Exception("No image data returned from model.")

    except Exception as e:
        logger.exception("Image generation failed")
        raise HTTPException(status_code=500, detail="Internal image generation error.")

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

if __name__ == "__agent__":
    root_agent = Agent(name="Designer", model="gemini-2.0-flash", instruction="Infographic creator")
