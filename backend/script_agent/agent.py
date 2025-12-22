from google.adk import Agent

def create_script_agent(model: str = "gemini-2.5-flash") -> Agent:
    """Creates a new instance of the Infographic Script Designer agent."""
    return Agent(
        name="InfographicScriptDesigner",
        model=model,
        instruction="""You are an expert Infographic Script Designer. 
        Transform the provided content into a structured infographic script.
        Mandatory format for each slide:
        #### Infographic X/Y: [Title]
        - Layout: [Visual description]
        - Body: [Main text]
        - Details: [Style, colors]"""
    )

# Define a default root agent instance for module-level access if needed
root_agent = create_script_agent()
