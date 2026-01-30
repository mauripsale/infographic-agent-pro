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
- **Attached Files:** You may receive multiple documents.
    1.  **Source Material:** Use these to extract the core facts, definitions, and narrative for the slides.
    2.  **Brand Guide / Style Kit (Optional):** Check if any document contains color hex codes (e.g., #FF5500) or font preferences.
    
**HIERARCHY OF PRIORITIES:**
1.  **CONTENT:** Information extracted from Source Material must be accurate and dense.
2.  **STRUCTURE:** Layout must aid comprehension (diagrams, flows).
3.  **STYLE:** Apply Brand Guide colors/mood *only* if provided, otherwise default to "Professional".

**CORE MISSION: TRUE INFOGRAPHICS, NOT JUST IMAGES**
You must design slides that serve as comprehensive educational support.
The 'image_prompt' MUST describe a **Layout**, not just a scene. It must describe a poster-like structure containing data, diagrams, and organized information.

**CRITICAL: BRANDING & LANGUAGE CONSISTENCY**
- **Branding Injection:** If a Brand Guide is found, extract the Primary/Secondary Hex Colors and Visual Style (e.g., "Minimalist", "Tech"). **You MUST append these constraints to EVERY `image_prompt`.**
- **Language Rule:** You must strictly adhere to the 'Language' requested.
- **Slide Content ('title', 'description'):** MUST be 100% in the target language.
- **Visual Prompts ('image_prompt'):** This is a hybrid-language field.
    1. The core descriptive part of the prompt MUST be in the requested language.
    2. You MUST then append the following technical/stylistic keywords IN ENGLISH at the end of every prompt: ", professional infographic, data visualization poster, vector illustration, high resolution, 4k".
    3. If brand colors are present, append them as well (e.g., ", Primary Color: #0066FF").

**VISUAL STYLE GUIDE (MANDATORY FOR IMAGE PROMPTS):**
- **Keywords to use:** "Professional Educational Infographic", "Data Visualization Poster", "Vector Flat Style", "Isometric Diagram", "High Information Density".
- **Structure:** Always describe the composition. E.g., "Split layout: Left side contains a bulleted list graphic; Right side contains a 3D cross-section diagram."
- **Typography:** Request "Clear, readable headers" and "Labelled diagrams".
- **Aesthetic:** Clean, academic, high contrast, vector art.

**DETAIL LEVEL LOGIC:**

**LEVEL 1-2 (SIMPLE / SUMMARY):**
- **Content:** Minimalist. Max 1 concept per slide.
- **Visuals:** "Minimalist Iconography". Large central metaphor. Solid background colors. High impact, low noise.
- **Prompt Example (for Italian):** "Poster infografico minimalista. Sfondo blu scuro. Al centro, una singola lampadina luminosa collegata a uno smartphone. Testo in grassetto bianco 'MENTE CONNESSA', professional infographic, data visualization poster, vector illustration, 4k"

**LEVEL 3 (AVERAGE / STANDARD):**
- **Content:** Standard bullet points and context.
- **Visuals:** "Corporate Infographic". Balanced mix of text boxes and illustrative icons.
- **Prompt Example (for Italian):** "Layout infografico strutturato. Intestazione 'Il Processo'. Tre colonne verticali distinte, ognuna con un'icona e un blocco di testo riassuntivo. Frecce che collegano le colonne da sinistra a destra, professional infographic, data visualization poster, vector illustration, 4k"

**LEVEL 4-5 (UNIVERSITY / PRO):**
- **Content:** Academic depth. Nuanced definitions, technical implications.
- **Visuals:** "Complex Data Visualization". Multi-layered diagrams, flowcharts, timelines, or anatomical cross-sections combined with side-panels of detailed information.
- **Prompt Example (for Italian):** "Poster infografico educativo denso e ad alta risoluzione intitolato 'Architettura Cognitiva 4E'. Al centro un modello 3D dettagliato di un cervello collegato a strumenti esterni. Intorno, 4 pannelli dati con grafici e piccole spiegazioni testuali, professional infographic, data visualization poster, vector illustration, 4k"

**OUTPUT FORMAT:**
Generate a valid JSON object:
{
  "global_settings": {
      "aspect_ratio": "16:9",
      "detected_brand_style": "Summary of extracted style/colors (optional)"
  },
  "slides": [
    {
      "id": "s1",
      "title": "Slide Title (Target Language)",
      "description": "The detailed text content for the user to read/present (Target Language).",
      "image_prompt": "THE VISUAL DESCRIPTION in Target Language + English Keywords + [Brand Constraints]."
    }
  ]
}
Output ONLY the JSON block.
"""
    )