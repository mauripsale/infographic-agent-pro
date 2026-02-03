from google.adk.agents import LlmAgent
from google.adk.tools import google_search, url_context
from google.adk.tools.agent_tool import AgentTool
from google.adk.planners import BuiltInPlanner
import os
from tools.image_gen import ImageGenerationTool

# Use a constant for the model name to improve maintainability across all agents
AGENT_MODEL = "gemini-2.5-flash"

def create_refiner_agent(api_key: str = None):
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key
    
    return LlmAgent(
        name="ContentRefiner",
        model=AGENT_MODEL,
        instruction="""You are an expert Content Editor.
You will receive a JSON object containing:
- 'title': Current title
- 'description': Current description
- 'instruction': User's editing instruction (e.g., "Make it shorter", "Translate to Spanish")

Your task is to rewrite the 'title' and 'description' according to the 'instruction'.

**RULES:**
1. Respect the user's instruction precisely.
2. Maintain the original meaning unless asked to change it.
3. Output MUST be a valid JSON object with 'title' and 'description' keys.
4. Do NOT output markdown code blocks, just the raw JSON string.
"""
    )

def create_image_artist_agent(api_key: str, img_tool: ImageGenerationTool, user_id: str, project_id: str, logo_url: str = None):
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key
    
    # Closure to bind context to the tool
    def generate_infographic(prompt: str, aspect_ratio: str = "16:9") -> str:
        """Generates an infographic image based on the prompt and aspect ratio."""
        return img_tool.generate_and_save(prompt, aspect_ratio=aspect_ratio, user_id=user_id, project_id=project_id, logo_url=logo_url)

    return LlmAgent(
        name="ImageArtist",
        model=AGENT_MODEL, 
        instruction="""You are an expert AI Artist.
Your task is to generate an infographic image using the 'generate_infographic' tool.
You will receive a visual description (prompt) and an aspect ratio.
Call the tool with these parameters.
Output ONLY the URL returned by the tool.
""",
        tools=[generate_infographic]
    )

def create_infographic_agent(api_key: str = None):
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key
    
    # 1. Specialist: Search Agent (Isolated for Google Search Tool)
    search_agent = LlmAgent(
        name="SearchSpecialist",
        model=AGENT_MODEL,
        instruction="You are a search specialist. Use Google Search to find accurate, up-to-date information.",
        tools=[google_search]
    )

    # 2. Specialist: URL Reader Agent (Isolated for URL Context Tool)
    url_agent = LlmAgent(
        name="UrlReaderSpecialist",
        model=AGENT_MODEL,
        instruction="You are a URL reading specialist. Use the url_context tool to extract content from web pages.",
        tools=[url_context]
    )

    # 3. Root Agent: Director (Orchestrator)
    # It delegates tasks to specialists via AgentTool
    return LlmAgent(
        name="InfographicDirector",
        model=AGENT_MODEL, 
        tools=[
            AgentTool(agent=search_agent),
            AgentTool(agent=url_agent)
        ],
        instruction="""You are the Creative Director and Visual Data Architect of a University Press.
Your goal is to generate a structured presentation script based on the user's topic, source materials, and style preferences.

**RESOURCES & TOOLS:**
- To find latest data or missing info, call the `SearchSpecialist`.
- To read specific URLs provided by the user, call the `UrlReaderSpecialist`.
- **Attached Files:** You may receive multiple documents. Use them to extract facts.

**HIERARCHY OF PRIORITIES:**
1.  **CONTENT:** Information extracted from Source Material must be accurate and dense.
2.  **STRUCTURE:** Layout must aid comprehension (diagrams, flows).
3.  **STYLE:** Apply Brand Guide colors/mood *only* if provided, otherwise default to "Professional".

**CRITICAL: JSON OUTPUT ONLY**
You must output a valid JSON object. No markdown, no conversation.

**REQUIRED JSON SCHEMA:**
```json
{
  "global_settings": {
      "aspect_ratio": "16:9",
      "detected_brand_style": "string (optional)"
  },
  "slides": [
    {
      "id": "s1",
      "title": "Slide Title (Target Language)",
      "description": "The detailed text content for the user to read/present (Target Language).",
      "image_prompt": "VISUAL DESCRIPTION (Mandatory)" 
    }
  ]
}
```

**FIELD DEFINITIONS:**
- **title**: The headline of the slide.
- **description**: The body text, bullet points, or narration script.
- **image_prompt**: A detailed visual description for an AI Image Generator. **THIS IS MANDATORY.**
    - IT MUST DESCRIBE A VISUAL SCENE/LAYOUT.
    - IT MUST be in the requested language + English Keywords.
    - Append: ", professional infographic, data visualization poster, vector illustration, high resolution, 4k"

**VISUAL PROMPT CONSTRUCTION (Crucial):**
For every slide, you MUST write a distinct `image_prompt`.
Example for Italian:
`"Layout a tre colonne. Colonna sinistra: icona lampadina. Colonna destra: grafico a barre blu. Sfondo bianco pulito, professional infographic, data visualization poster, vector illustration, 4k"`

**Failure to provide `image_prompt` will cause the system to crash.**
Generate the full JSON now.
"""
    )