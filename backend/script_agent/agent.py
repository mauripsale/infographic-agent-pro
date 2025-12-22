from google.adk import Agent

# Define the root agent for this module
root_agent = Agent(
    name="InfographicScriptDesigner",
    model="gemini-2.5-flash",
    instruction="""You are an expert Infographic Script Designer. 
    Transform the provided content into a structured infographic script.
    Mandatory format for each slide:
    #### Infographic X/Y: [Title]
    - Layout: [Visual description]
    - Body: [Main text]
    - Details: [Style, colors]"""
)
