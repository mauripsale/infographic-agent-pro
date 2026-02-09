from google.adk.agents import LlmAgent
from google.adk.tools import google_search, url_context
from google.adk.tools.agent_tool import AgentTool
import os
from tools.image_gen import ImageGenerationTool

def create_refiner_agent(api_key: str = None, model: str = "gemini-3-flash-preview"):
    if api_key: os.environ["GOOGLE_API_KEY"] = api_key
    return LlmAgent(
        name="ContentRefiner", 
        model=model, 
        instruction="You are a content refiner. Improve the text for clarity and impact."
    )

def create_image_artist_agent(api_key: str, img_tool, user_id, project_id, logo_url, model: str = "gemini-3-flash-preview"):
    if api_key: os.environ["GOOGLE_API_KEY"] = api_key
    # This agent is currently not the primary image generator (main.py handles it directly), 
    # but we keep it valid for potential future use or team orchestration.
    return LlmAgent(
        name="ImageArtist", 
        model=model, 
        instruction="You are an AI Artist. You generate image prompts."
    )

def create_infographic_agent(api_key: str = None, model: str = "gemini-3-flash-preview"):
    if api_key:
        os.environ["GOOGLE_API_KEY"] = api_key
    
    # 1. Specialist: Search Agent
    search_agent = LlmAgent(
        name="SearchSpecialist",
        model=model,
        instruction="You are a search specialist. Your job is to find accurate, dense, and interesting facts about the user's topic. Return a summary of key points.",
        tools=[google_search]
    )

    # 2. Specialist: URL Reader Agent
    url_agent = LlmAgent(
        name="UrlReaderSpecialist",
        model=model,
        instruction="You are a URL reading specialist. Use the url_context tool to extract content from web pages.",
        tools=[url_context]
    )

    # 3. Root Agent: Director
    return LlmAgent(
        name="InfographicDirector",
        model=model, 
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
