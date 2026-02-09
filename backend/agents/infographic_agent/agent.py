from google.adk.agents import LlmAgent
from google.adk.tools import google_search, url_context
from google.adk.tools.agent_tool import AgentTool
import os
from pathlib import Path
from tools.image_gen import ImageGenerationTool
from config.settings import DEFAULT_TEXT_MODEL

# Load Prompts
PROMPTS_DIR = Path(__file__).parent.parent.parent / "config" / "prompts"
with open(PROMPTS_DIR / "director_prompt.md", "r") as f:
    DIRECTOR_INSTRUCTION = f.read()

def create_refiner_agent(api_key: str = None, model: str = DEFAULT_TEXT_MODEL):
    if api_key: os.environ["GOOGLE_API_KEY"] = api_key
    return LlmAgent(
        name="ContentRefiner", 
        model=model, 
        instruction="You are a content refiner. Improve the text for clarity and impact."
    )

def create_image_artist_agent(api_key: str, img_tool, user_id, project_id, logo_url, model: str = DEFAULT_TEXT_MODEL):
    if api_key: os.environ["GOOGLE_API_KEY"] = api_key
    # This agent is currently not the primary image generator (main.py handles it directly), 
    # but we keep it valid for potential future use or team orchestration.
    return LlmAgent(
        name="ImageArtist", 
        model=model, 
        instruction="You are an AI Artist. You generate image prompts."
    )

def create_infographic_agent(api_key: str = None, model: str = DEFAULT_TEXT_MODEL):
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
        instruction=DIRECTOR_INSTRUCTION
    )