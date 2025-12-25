<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Infographic Agent Pro

Infographic Agent Pro is a full-stack application that transforms text prompts or web articles into downloadable infographic presentations. It leverages the power of Google's AI Development Kit (ADK) and Gemini models to automate content synthesis and slide creation.

## Features

- **AI-Powered Content Synthesis**: Analyzes raw text or web page content to generate a structured presentation script.
- **URL to Presentation**: Simply provide a URL, and the agent will fetch, parse, and summarize the content for your slides.
- **Interactive Chat Interface**: Uses CopilotKit to provide a seamless, chat-based experience for generating presentations.
- **Downloadable `.pptx` Files**: Generates a professional `.pptx` file that you can download and edit.
- **Static File Serving**: The backend serves the generated presentations, making them easily accessible for download.

## Architecture

The project is a monorepo containing two main components:

1.  **Backend (`/backend`)**: A Python server built with **FastAPI** that uses the **Google ADK**. It hosts a sequential agent composed of:
    -   A `ScriptGenerator` agent that uses a Gemini model to create a JSON-based script for the presentation.
    -   A `SlideBuilder` agent that uses the `python-pptx` library to generate a `.pptx` file from the script.
    -   Serves the generated files from a `/static` directory.

2.  **Frontend (`/frontend`)**: A **Next.js** and **React** application that provides the user interface.
    -   Integrates **CopilotKit** for the AI chat popup and action handling.
    -   Renders the presentation slides in the browser.
    -   Displays a download link for the generated `.pptx` file.

## Prerequisites

-   [Node.js](https://nodejs.org/) (LTS version recommended)
-   [Python 3.11+](https://www.python.org/downloads/)
-   A [Google Gemini API Key](https://ai.google.dev/)

## Setup and Running the Application

Follow these steps to run the application locally.

### 1. Backend Setup

First, set up and run the FastAPI server.

```bash
# Navigate to the backend directory
cd backend

# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate
# On Windows, use: venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt

# Set your Gemini API key as an environment variable
export GOOGLE_API_KEY="YOUR_GEMINI_API_KEY"
# On Windows PowerShell, use: $env:GOOGLE_API_KEY="YOUR_GEMINI_API_KEY"
# On Windows CMD, use: set GOOGLE_API_KEY=YOUR_GEMINI_API_KEY

# Run the backend server
uvicorn main:app --host 0.0.0.0 --port 8080
```

The backend server will be running at `http://localhost:8080`.

### 2. Frontend Setup

In a separate terminal, set up and run the Next.js frontend.

```bash
# Navigate to the frontend directory
cd frontend

# Install Node.js dependencies
npm install

# The frontend needs to know the backend URL.
# By default, it's set to http://localhost:8080/api/chat in the code.
# You can create a .env.local file to override it if needed:
# echo "NEXT_PUBLIC_COPILOT_API_URL=http://127.0.0.1:8080/api/chat" > .env.local

# Run the frontend development server
npm run dev
```

The frontend will be available at `http://localhost:3000`.

## Deployment

When deploying the frontend, you must set the `NEXT_PUBLIC_COPILOT_API_URL` environment variable to the public URL of your deployed backend.

For example, if your backend is deployed at `https://your-backend-service.com`, set the following environment variable in your frontend hosting provider's settings (e.g., Vercel, Netlify):

`NEXT_PUBLIC_COPILOT_API_URL=https://your-backend-service.com/api/chat`

Failure to set this variable will cause the frontend to default to `localhost`, which will not be accessible from the public internet.

## How to Use

1.  Open your web browser and navigate to `http://localhost:3000`.
2.  In the input field on the top right, enter the same **Gemini API Key** you used for the backend. This is required for the CopilotKit frontend to authenticate.
3.  Use the chat popup (bottom right) to make a request. For example:
    -   "Create a 5-slide presentation about the benefits of hydration."
    -   "Make a presentation about this article: [URL]"
4.  The agent will process the request, and the generated slides will appear in the presentation view.
5.  A **"Download Presentation"** button will appear on the top right, allowing you to download the generated `.pptx` file.

## Technologies Used

-   **Backend**: Python, FastAPI, Google ADK, `python-pptx`, BeautifulSoup
-   **Frontend**: Next.js, React, TypeScript, CopilotKit, Tailwind CSS
-   **AI**: Google Gemini Models