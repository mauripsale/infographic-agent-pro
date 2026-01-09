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

def generate_infographic_image(prompt: str, aspect_ratio: str = "16:9") -> str:
    """
    Generates an infographic image using Nano Banana models and saves it as PNG.
    Args:
        prompt: The visual description of the image.
        aspect_ratio: The desired aspect ratio (e.g., "16:9", "4:3", "1:1", "9:16").
    Returns:
        The public URL path of the generated image.
    """
    try:
        client = genai.Client(api_key=os.environ.get("GOOGLE_API_KEY"))
        
        # Get model from context (Nano Banana or Nano Banana Pro)
        model_name = model_context.get()
        
        # Ensure we are using an image-capable model
        if "image" not in model_name:
            model_name = "gemini-2.5-flash-image" # Default to Nano Banana
            
        print(f"Nano Banana is drawing ({aspect_ratio}): {prompt[:50]}... using {model_name}")
        
        # Generate content (Multimodal Image Output)
        response = client.models.generate_images(
            model='imagen-3.0-generate-001', # Use Imagen 3 explicitly for better control over AR in this specific tool
            prompt=f"A high-quality professional infographic. Style: {prompt}",
            config=types.GenerateImagesConfig(
                number_of_images=1,
                aspect_ratio=aspect_ratio
            )
        )
        
        # Extract image bytes
        image_data = None
        if response.generated_images:
            image_data = response.generated_images[0].image.image_bytes
        
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
    # Task: Analyze input and create detailed visual prompts respecting user settings.
    script_generator = LlmAgent(
        name="Conceptualizer",
        model="gemini-2.5-flash", 
        description="Analyzes content and creates visual prompts for infographics.",
        instruction="""You are a professional Infographic Designer. 
Your task is to analyze the user's input and the provided configuration (Settings) to create a series of visual concepts.

**INPUT ANALYSIS:**
Look for specific instructions in the user prompt regarding:
1. **Target Slide Count** (e.g., "5 slides"). You MUST generate exactly this number of items.
2. **Visual Style** (e.g., "Cyberpunk", "Minimalist"). Use this to craft the image prompts.
3. **Language**. Ensure all text labels described in the prompt are in this language.
4. **Detail Level**. If 'High', make prompts complex. If 'Basic', keep them simple.
5. **Aspect Ratio**. Note this for the output.

**OUTPUT FORMAT:**
Generate a valid JSON object containing:
- "global_settings": {"aspect_ratio": "..."}
- "slides": A list of objects, each containing:
  - "title": Title of the infographic.
  - "image_prompt": A highly detailed, standalone prompt for an AI image generator. Describe the visual elements, layout, colors, and specific text labels to render.

Example Output:
{
  "global_settings": {"aspect_ratio": "16:9"},
  "slides": [
    {"title": "Overview", "image_prompt": "A modern minimalist infographic chart showing growth, indigo palette..."},
    ...
  ]
}
Output ONLY the JSON block.""",
        output_key="infographic_scripts"
    )

    # --- Agent 2: Infographic Artist (The Creator) ---
    # Task: Take prompts and generate actual images using the specific aspect ratio.
    artist = LlmAgent(
        name="Artist",
        model="gemini-2.5-flash", 
        description="Uses Nano Banana to generate the final images.",
        instruction="""You are an AI Artist coordinator. 
You receive a JSON object in 'infographic_scripts' containing 'global_settings' and a list of 'slides'.

1. Extract the 'aspect_ratio' from 'global_settings' (default to "16:9" if missing).
2. For each slide in 'slides':
   - Call the 'generate_infographic_image' tool.
   - Pass the 'image_prompt' as the prompt.
   - Pass the extracted 'aspect_ratio' as the aspect_ratio argument.

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