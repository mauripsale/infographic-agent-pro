from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import io
import os
import json
import uuid
from pathlib import Path
from google import genai
from google.genai import types

# Documentation Reference: @context7_doc/google-adk-python.md, @context7_doc/python-genai.md
try:
    from context import model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

def generate_infographic_image_tool(prompt: str, aspect_ratio: str = "16:9") -> str:
    """
    Generates a single infographic image using Nano Banana models.
    """
    try:
        client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
        model_name = model_context.get()
        
        # Ensure we use an image-capable model (Nano Banana)
        if "image" not in model_name:
            model_name = "gemini-2.5-flash-image"
            
        print(f"Nano Banana is generating image for: {prompt[:50]}... [Model: {model_name}, AR: {aspect_ratio}]")
        
        # Use generate_content for Gemini models (Nano Banana)
        response = client.models.generate_content(
            model=model_name,
            contents=f"Generate a professional infographic image. Description: {prompt}",
            config=types.GenerateContentConfig(
                response_mime_type="image/jpeg" 
            )
        )
        
        # Extract image data from Gemini response
        image_bytes = None
        if response.candidates and response.candidates[0].content.parts:
            for part in response.candidates[0].content.parts:
                if part.inline_data:
                    image_bytes = part.inline_data.data
                    break
        
        if image_bytes:
            filename = f"infographic_{uuid.uuid4().hex}.png"
            filepath = STATIC_DIR / filename
            with open(filepath, "wb") as f:
                f.write(image_bytes)
            return f"/static/{filename}"
        
        return "Error: No image generated from model."
    except Exception as e:
        return f"Error: {str(e)}"

def get_script_agent(api_key: str = None):
    """Creates the agent responsible for script generation."""
    if api_key: os.environ["GOOGLE_API_KEY"] = api_key
    
    return LlmAgent(
        name="InfographicPlanner",
        model="gemini-2.5-flash",
        instruction="""You are a professional Infographic Script Writer.
Analyze the user's input and generate a structured script for a presentation.
For each slide, provide a clear title, a description of the content, and a detailed 'image_prompt' for Nano Banana.
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
