from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import io
import os
import json
import uuid
from pathlib import Path
from google import genai
from google.genai import types

# Documentation Reference: https://ai.google.dev/gemini-api/docs/models
try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

def generate_infographic_image_tool(prompt: str, aspect_ratio: str = "16:9") -> str:
    """
    Generates a single infographic image using the correct Gemini Image models (Nano Banana).
    Supported IDs: gemini-2.5-flash-image, gemini-3-pro-image-preview.
    """
    try:
        client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
        model_name = model_context.get()
        
        # Ensure we are using a valid image-capable model ID from the documentation
        if "image" not in model_name:
            model_name = "gemini-2.5-flash-image"
            
        print(f"Nano Banana [Model: {model_name}] is generating visual for: {prompt[:50]}...")
        
        # Correct multimodal call for Gemini Image models
        response = client.models.generate_content(
            model=model_name,
            contents=f"Generate a professional, high-quality infographic image. Style: {prompt}. Aspect Ratio: {aspect_ratio}",
            config=types.GenerateContentConfig(
                # The model will return image bytes in the response parts
            )
        )
        
        # Extract image bytes from response parts
        image_bytes = None
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    image_bytes = part.inline_data.data
                    break
                elif hasattr(part, 'data') and part.data:
                    image_bytes = part.data
                    break
        
        if image_bytes:
            filename = f"infographic_{uuid.uuid4().hex}.png"
            filepath = STATIC_DIR / filename
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            return f"/static/{filename}"
        
        return f"Error: Model {model_name} did not return image data. Check if prompt is valid."
    except Exception as e:
        print(f"❌ Generation failed: {e}")
        return f"Error: {str(e)}"

def get_script_agent(api_key: str = None):
    """Creates the agent responsible for script generation."""
    if api_key: os.environ["GOOGLE_API_KEY"] = api_key
    
    return LlmAgent(
        name="InfographicPlanner",
        model="gemini-2.5-flash",
        instruction="""You are a professional Infographic Script Writer.
Analyze the user's input and generate a structured script for a presentation.
For each slide, provide a clear title, a description of the content, and a detailed 'image_prompt' for Nano Banana (Gemini 2.5/3 Image models).
The 'image_prompt' must describe the exact visual layout, icons, and text elements.

OUTPUT FORMAT:
Generate a valid JSON object:
{
  "slides": [
    {
      "id": "slide_1",
      "title": "...",
      "description": "...",
      "image_prompt": "..."
    }
  ]
}
Output ONLY the JSON block.
"""
    )