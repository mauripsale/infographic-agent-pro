from google.adk.agents import LlmAgent, SequentialAgent
from google.adk.tools import FunctionTool
import io
import os
import sys
import time
import json
import uuid
from pathlib import Path
from google import genai
from google.genai import types

# Robust import for context
try:
    import context
    model_context = context.model_context
except ImportError:
    from contextvars import ContextVar
    model_context = ContextVar("model_context", default="gemini-2.5-flash-image")

STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)

def generate_infographic_image(prompt: str) -> str:
    """
    Generates an infographic image using Nano Banana models and saves it as PNG.
    Returns the public URL path.
    """
    try:
        client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
        
        # Get model from context (Nano Banana or Nano Banana Pro)
        model_name = model_context.get()
        
        # Ensure we are using an image-capable model
        if "image" not in model_name:
            model_name = "gemini-2.5-flash-image" # Default to Nano Banana
            
        print(f"Nano Banana is drawing: {prompt[:50]}... using {model_name}")
        
        # Generate content (Multimodal Image Output)
        response = client.models.generate_content(
            model=model_name,
            contents=f"Generate a high-quality, professional infographic image based on this description: {prompt}. The image should be clear, modern, and suitable for a professional presentation."
        )
        
        # Extract image bytes
        image_data = None
        for part in response.candidates[0].content.parts:
            if part.inline_data:
                image_data = part.inline_data.data
                break
            try:
                if hasattr(part, 'image_bytes') and part.image_bytes:
                    image_data = part.image_bytes
                    break
            except:
                pass
        
        if image_data:
            filename = f"infographic_{uuid.uuid4().hex}.png"
            filepath = STATIC_DIR / filename
            with open(filepath, "wb") as f:
                f.write(image_data)
            return f"/static/{filename}"
        
        return "Error: No image data returned from model."
    except Exception as e:
        print(f"Nano Banana failed: {e}")
        return f"Error: {str(e)}"

def create_infographic_pipeline(api_key: str = None):
    """
    Factory to create the Infographic generation pipeline.
    """
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key

    # --- Agent 1: Script Generator (The Conceptualizer) ---
    # Task: Analyze input and create detailed visual prompts.
    script_generator = LlmAgent(
        name="Conceptualizer",
        model="gemini-2.5-flash", # Use standard flash for reasoning/text
        description="Analyzes content and creates visual prompts for infographics.",
        instruction="""You are a professional Infographic Designer. 
Your task is to analyze the user's input (text, topics, or URLs) and break it down into a series of visual concepts.
For each concept, generate a highly detailed 'image_prompt' for an AI image generator (Nano Banana).
The prompt should describe: layout, color scheme (modern, professional), specific icons, charts, and text labels to be included in the image.
Generate a valid JSON output containing a list of objects.
Example format:
[
  {"title": "Overview", "image_prompt": "A professional infographic showing a 3-step process for AI adoption, using indigo and teal colors, flat design, clean typography..."},
  {"title": "Data Trends", "image_prompt": "A complex dashboard infographic with 3D bar charts and glowing nodes representing global data flow..."}
]
Output ONLY the JSON block. Do not add any conversational text.""",
        output_key="infographic_scripts"
    )

    # --- Agent 2: Infographic Artist (The Creator) ---
    # Task: Take prompts and generate actual images.
    artist = LlmAgent(
        name="Artist",
        model="gemini-2.5-flash", # Orchestrator
        description="Uses Nano Banana to generate the final images.",
        instruction="""You are an AI Artist coordinator. 
Take the JSON list of prompts provided in 'infographic_scripts'.
For each prompt, call the 'generate_infographic_image' tool.
Collect all the returned image URLs.
Return a final JSON list of the generated image URLs.
Example: ["/static/img1.png", "/static/img2.png"]
""",
        tools=[FunctionTool(generate_infographic_image)],
        output_key="image_urls"
    )

    return SequentialAgent(
        name="InfographicFactory",
        description="Transforms ideas into PNG infographics.",
        sub_agents=[script_generator, artist]
    )