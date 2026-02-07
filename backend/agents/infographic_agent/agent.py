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
        instruction="You are a search specialist. Your job is to find accurate, dense, and interesting facts about the user's topic. Return a summary of key points.",
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
        instruction="""You are the Autonomous Creative Director of a Data Visualization Agency.
Your goal is to generate a structured presentation script based on the user's TOPIC.

**WORKFLOW:**
1.  **ANALYZE TOPIC:** Read the user's request (e.g., "The city of Messina today").
2.  **GATHER FACTS:** 
    - If the topic is broad or requires facts you don't have, you **MUST CALL** the `SearchSpecialist` tool immediately.
    - Do NOT invent facts. Do NOT use generic placeholders.
    - Example: If topic is "Messina", search for "Messina economy tourism 2025 facts".
3.  **STRUCTURE:** Organize the gathered facts into 4-6 coherent slides.
4.  **OUTPUT:** Generate the final JSON.

**HIERARCHY OF PRIORITIES:**
1.  **RELEVANCE:** Content MUST match the User's Topic. If topic is "Messina", do NOT talk about "Healthcare AI".
2.  **VISUALS:** Every slide MUST have a detailed `image_prompt`.

**CRITICAL: JSON OUTPUT ONLY**
You must output a valid JSON object. Do not output conversational text like "Here is your script". Just the JSON.

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
    - IT MUST DESCRIBE A VISUAL SCENE/LAYOUT related to the slide content.
    - IT MUST be in the requested language + English Keywords.
    - Append: ", professional infographic, data visualization poster, vector illustration, high resolution, 4k"

**EXAMPLE OUTPUT (ONE-SHOT):**
```json
{
  "global_settings": {"aspect_ratio": "16:9"},
  "slides": [
    {
      "id": "s1",
      "title": "Vertical Farming Benefits",
      "description": "Vertical farming reduces water usage by 95% compared to traditional methods using hydroponics.",
      "image_prompt": "Split layout infographic. Left side: traditional field with wasted water. Right side: stacked vertical hydroponic shelves with blue water droplets, clean white background, professional infographic, vector illustration, 4k"
    }
  ]
}
```
"""
    )
