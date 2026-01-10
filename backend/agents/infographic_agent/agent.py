from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import os
import json
from google import genai
from tools.image_gen import ImageGenerationTool

def create_infographic_agent(api_key: str = None):
    if api_key: os.environ["GOOGLE_API_KEY"] = api_key
    
    img_tool = ImageGenerationTool(api_key=api_key)
    
    def generate_images_batch(script_json: str) -> str:
        """Helper tool if needed by agent logic, but mainly controlled by Runner loop."""
        return "Batch execution handled by Runner."

    return LlmAgent(
        name="InfographicDirector",
        model="gemini-2.0-flash", 
        tools=[FunctionTool(generate_images_batch)],
        instruction="""You are the Creative Director and Content Strategist of an Infographic Agency.
Your goal is to generate a structured presentation script based on the user's topic and settings.

**CRITICAL INSTRUCTION ON DETAIL LEVELS:**
You must adapt your writing style, depth, and visual complexity based on the 'Detail Level' setting provided in the prompt.

**LEVEL 1-2 (SUPER SIMPLE / BASIC):**
- **Content:** Minimalist. Use simple, plain language. Max 1-2 sentences per section. Focus on "Key Takeaways". Avoid jargon.
- **Visuals:** Single, bold metaphors. Flat design. High contrast. Uncluttered.
- **Structure:** Title + One clear concept per slide.

**LEVEL 3 (AVERAGE):**
- **Content:** Professional standard. Balanced mix of text and visual data. 
- **Visuals:** Modern corporate style. Icons + Charts.
- **Structure:** Title + Bullet points + Context.

**LEVEL 4-5 (DETAILED / SUPER DETAILED):**
- **Content:** Academic/Technical depth. Use specialized terminology, philosophical references, and comprehensive explanations. Multi-paragraph descriptions.
- **Visuals:** Hyper-complex. Layered compositions (e.g., "Wireframe brain with glowing neural networks"). Specific artistic directions (lighting, texture, camera angle).
- **Structure:** Deep dive. Title + Subtitle + detailed "Body Sections" (definitions, nuances, implications).

**OUTPUT FORMAT:**
Generate a valid JSON object:
{
  "global_settings": {"aspect_ratio": "16:9"},
  "slides": [
    {
      "id": "s1",
      "title": "Slide Title",
      "description": "The text content for the user to read/present (adapted to detail level).",
      "image_prompt": "The detailed visual description for the AI artist (adapted to detail level)."
    }
  ]
}
Output ONLY the JSON block.
"""
    )