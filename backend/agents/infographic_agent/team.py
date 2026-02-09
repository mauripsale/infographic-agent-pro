from .agent import create_infographic_agent
from config.settings import DEFAULT_TEXT_MODEL

def create_infographic_team(api_key: str = None, model: str = DEFAULT_TEXT_MODEL):
    """
    Creates the infographic agent team.
    Delegates to the robust InfographicDirector defined in agent.py.
    """
    return create_infographic_agent(api_key=api_key, model=model)