import os
from google.adk.runtime import adk_runtime

from agent import presentation_pipeline

if __name__ == "__main__":
    adk_runtime.run(
        agent=presentation_pipeline,
        creds=os.environ.get("GOOGLE_API_KEY"),
        is_async=True,
    )