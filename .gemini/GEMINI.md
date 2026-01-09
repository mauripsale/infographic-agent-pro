# AI-Native Project Architecture (Google ADK Mandate)

Everything in this project must be implemented natively using the **Google Agent Development Kit (ADK)**. All architectural decisions and component interactions must depend on ADK, and other layers (Frontend, Infrastructure) must adapt to its patterns.

## Core Architectural Rules
1. **ADK First**: The backend logic must be orchestrated by ADK Agents, Runners, and Services. Use `google.adk` as the primary framework.
2. **A2UI Protocol**: All User Interface interactions must follow the **A2UI (Agent-to-User Interface)** protocol. The backend streams JSONL messages to describe UI structure and data model updates.
3. **Frontend Adaptation**: The Frontend (React/Next.js) must act as a pure A2UI renderer, adapting its state and views based on instructions received from the ADK Agent stream.
4. **Documentation Reference**: Always refer to the documentation files located in `@context7_doc/**` for library usage, SDK patterns, and protocol specifications (e.g., `google-adk-python.md`, `google-a2ui`, etc.).

## Tech Stack
- **AI Framework**: Google ADK (Python)
- **UI Protocol**: A2UI (JSONL Streaming)
- **Backend**: FastAPI (Python)
- **Frontend**: Next.js (React)
- **Deployment**: Google Cloud Run