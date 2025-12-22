from google.adk import Agent

# This agent is specialized in visual descriptions and prompt refinement
# The actual image generation happens via a tool or external call
root_agent = Agent(
    name="VisualDesigner",
    model="gemini-2.5-flash",
    instruction="""You are an expert Visual Designer.
    Your task is to take a description and refine it into a perfect image generation prompt.
    Focus on style, composition, lighting, and mood."""
)
