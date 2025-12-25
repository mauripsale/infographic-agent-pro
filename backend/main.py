import os
from google_adk.runtime import adk_runtime

from agents.infographic_agent.agent import presentation_pipeline

if __name__ == "__main__":
    adk_runtime.run(
        agent=presentation_pipeline,
        creds=os.environ.get("GOOGLE_API_KEY"),
        is_async=True,
    )