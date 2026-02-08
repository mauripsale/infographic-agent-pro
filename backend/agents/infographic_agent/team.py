from .agent import create_infographic_agent

def create_infographic_team(api_key: str = None, model: str = "gemini-2.0-flash"):
    """
    Creates the infographic agent team.
    Delegates to the robust InfographicDirector defined in agent.py.
    """
    return create_infographic_agent(api_key=api_key, model=model)
