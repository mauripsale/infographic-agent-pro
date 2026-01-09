from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool
import os
import json
from google import genai
from backend.tools.image_gen import ImageGenerationTool

# --- TOOLS ---
def generate_draft_script(topic: str, slide_count: int, style: str) -> dict:
    """
    Generates a draft script for the infographic presentation.
    This is a 'Thinking' tool that prepares the content.
    """
    # Note: In a pure agentic loop, the LLM itself does this reasoning. 
    # But to enforce structure, we can wrap a specialized LLM call here if needed,
    # or just let the main agent do it via prompt. 
    # For ADK best practice, let's allow the main agent to 'think' and produce this output directly,
    # but we provide a tool to 'validate' or 'format' it if necessary.
    pass 

# Since the main agent IS the script writer, we don't need a separate tool for writing text.
# We need tools for the "Side Effects" (Image Generation).

def create_infographic_agent(api_key: str = None):
    if api_key: os.environ["GOOGLE_API_KEY"] = api_key
    
    # Tool Instance
    img_tool = ImageGenerationTool(api_key=api_key)
    
    def generate_images_batch(script_json: str, parallel: bool = False) -> str:
        """
        Takes a JSON string representing the approved script and generates images for all slides.
        Returns a JSON string with the results (image URLs).
        """
        try:
            data = json.loads(script_json)
            slides = data.get("slides", [])
            aspect_ratio = data.get("global_settings", {}).get("aspect_ratio", "16:9")
            
            results = []
            # Note: For true parallelism in Python ADK, we would use asyncio.gather here.
            # For simplicity and reliability in this specific environment, we'll loop.
            # If 'parallel' is True, we could spawn threads, but let's keep it robust.
            for slide in slides:
                prompt = slide.get("image_prompt", "")
                url = img_tool.generate_and_save(prompt, aspect_ratio=aspect_ratio)
                results.append({"id": slide['id'], "url": url, "title": slide['title']})
            
            return json.dumps(results)
        except Exception as e:
            return f"Error executing batch: {e}"

    # The "Director" Agent
    return LlmAgent(
        name="InfographicDirector",
        model="gemini-2.5-flash", # Orchestrator logic is fine on Flash
        tools=[FunctionTool(generate_images_batch)],
        instruction="""You are the Creative Director of an Infographic Agency.
Your goal is to take a user request and turn it into a visual presentation.

**WORKFLOW:**

**PHASE 1: DRAFTING**
If the user provides a raw topic or URL:
1. Analyze the request.
2. Create a structured JSON plan containing 'slides'.
3. OUTPUT the JSON plan inside a code block.
4. STOP and ask the user to "Review and Approve" this plan.

**PHASE 2: PRODUCTION**
If the user provides a JSON structure (which means they approved/edited it):
1. Call the `generate_images_batch` tool with this JSON.
2. The tool will return the list of image URLs.
3. Present the final results to the user.

**JSON FORMAT for Script:**
{
  "global_settings": {"aspect_ratio": "16:9"},
  "slides": [
    {"id": "s1", "title": "Title", "image_prompt": "Detailed visual description..."}
  ]
}
"""
    )
