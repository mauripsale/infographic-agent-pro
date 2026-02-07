from .agent import create_infographic_agent

def create_infographic_team(api_key: str = None):
    """
    Creates the infographic agent team.
    Delegates to the robust InfographicDirector defined in agent.py
    to avoid prompt duplication and 'Fact Sheet' zombies.
    """
    return create_infographic_agent(api_key=api_key)