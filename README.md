<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# IPSA - Infographic Presentation Sales Agent

**IPSA** (Infographic Presentation Sales Agent) is an ADK-powered "Visual Data Architect" designed to accelerate knowledge transfer for **Academy/Education** and **Pre-sales** workflows.

It solves the critical bottleneck of transforming complex technical concepts into client-ready visual narratives. By orchestrating specialized AI agents, IPSA synthesizes unstructured inputs—such as technical PDFs, web articles, or raw text—into high-density, professional infographic presentations in minutes.

## 🌟 Key Features

- **AI-Powered Content Synthesis**: Analyzes dense source material to extract key insights, data points, and narrative flow.
- **Visual Data Architecture**: Goes beyond simple image generation. IPSA designs structured slide layouts (diagrams, flowcharts, comparison tables) optimized for educational retention.
- **Multi-Agent Orchestration**: Powered by **Google ADK**, it coordinates specialized sub-agents:
    -   🕵️‍♂️ **Research Agent**: Finds missing data and context.
    -   📖 **URL Reader**: Extracts content from web links.
    -   🎨 **Creative Director**: Generates precise visual prompts for the image model.
- **Real-Time Streaming UI**: Uses the **A2UI** protocol to stream the creative process live to the user, allowing for an interactive and transparent experience.
- **Privacy-First Design**: Operates with least-privilege scopes (only accesses files it creates) and supports optional API Key encryption.
- **Native Export**: Generates professional **.pptx** files (editable in Google Slides) and PDF handouts.

## 🏗️ Architecture

The project is a cloud-native monorepo built on the **Google Agent Development Kit (ADK)**:

1.  **Backend (`/backend`)**: A **FastAPI** service running on **Cloud Run**.
    -   **Framework**: Google ADK (Python) for agent orchestration.
    -   **Models**: Gemini 2.5 Flash / Gemini 3 Pro.
    -   **Tools**: Custom tools for Image Generation (Imagen/Gemini), Google Slides API, and File Processing.
    -   **Protocol**: Streams UI updates via **A2UI** (Agent-to-User Interface) protocol over JSONL.

2.  **Frontend (`/frontend`)**: A **Next.js (React)** application hosted on Firebase/Vercel.
    -   **Role**: A pure renderer for the A2UI stream.
    -   **Auth**: Firebase Authentication with incremental permission requests.
    -   **UX**: "Lightbox" mode for detailed slide review and per-slide regeneration controls.

## 🚀 Getting Started

### Prerequisites

-   [Node.js](https://nodejs.org/) (LTS)
-   [Python 3.11+](https://www.python.org/downloads/)
-   A [Google Gemini API Key](https://aistudio.google.dev/)
-   A Google Cloud Project (for deployment)

### Local Development

#### 1. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Run the ADK Agent Server
export GOOGLE_API_KEY="YOUR_KEY"
uvicorn main:app --host 0.0.0.0 --port 8080
```

#### 2. Frontend Setup

```bash
cd frontend
npm install

# Point to your local backend
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:8080" > .env.local

npm run dev
```

Open `http://localhost:3000` to start using IPSA.

## 🛡️ Security & Privacy

IPSA is designed with a **"Trust & Safety"** first approach:
-   **No Data Retention**: Uploaded documents are processed in-memory (or ephemeral temp storage) and discarded after analysis.
-   **Incremental Auth**: The app works with basic profile access. Highly sensitive scopes (like Google Drive write access) are requested *only* when you explicitly click "Export to Slides".
-   **BYOK (Bring Your Own Key)**: Users provide their own Gemini API Key, which is encrypted client-side or stored securely in Firestore with user-only access rules.

Built with ❤️ by Maurizio Ipsale using <strong>Google ADK</strong> and <strong>Gemini</strong>.
</p>
