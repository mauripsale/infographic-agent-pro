import os
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from google_adk.runtime import adk_runtime

from agents.infographic_agent.agent import presentation_pipeline

# Create the FastAPI app
app = FastAPI()

# Mount static files directory
STATIC_DIR = Path("static")
STATIC_DIR.mkdir(exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

@app.on_event("startup")
async def startup_event():
    adk_runtime.init(
        agent=presentation_pipeline,
        creds=os.environ.get("GOOGLE_API_KEY"),
        is_async=True,
    )

@app.post("/api/chat")
async def chat(request: dict):
    response = await adk_runtime.call_agent(request)
    return response

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080)