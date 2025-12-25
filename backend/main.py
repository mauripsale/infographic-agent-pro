import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from google_adk.runtime import adk_runtime

from agents.infographic_agent.agent import presentation_pipeline

# Create the main FastAPI app
app = FastAPI()

# Mount static files directory
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Initialize the ADK runtime
adk_runtime.init(
    agent=presentation_pipeline,
    creds=os.environ.get("GOOGLE_API_KEY"),
    is_async=True,
)

# Get the ADK's FastAPI app, which includes all necessary routes (/chat, /info)
adk_app = adk_runtime.get_fastapi_app()

# Mount the ADK app at the /api path
app.mount("/api", adk_app)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)